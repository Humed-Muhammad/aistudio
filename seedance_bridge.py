from pathlib import Path
import json,requests,re,time,random,concurrent.futures
from config import credential, setting
from media_host import upload
from audio_workflow import finish_preview

REPLICATE_MODEL='bytedance/seedance-2.0'
REPLICATE_API='https://api.replicate.com/v1/'
REPLICATE_MAX_REFERENCE_SECONDS=15
WAN_MODEL='wan-video/wan-2.2-animate-replace'
VIDEO_SUFFIXES=['.mp4','.mov','.webm']
RATIOS={'16:9':16/9,'9:16':9/16,'1:1':1,'4:3':4/3,'3:4':3/4,'21:9':21/9}

def provider():
    """GENERATION_PROVIDER wins; otherwise Enhancor when its key is set, else Replicate."""
    choice=setting('GENERATION_PROVIDER').strip().lower()
    if choice:
        if choice not in ['enhancor','replicate']:raise ValueError('GENERATION_PROVIDER must be enhancor or replicate.')
        return choice
    return 'enhancor' if setting('ENHANCOR_API_KEY').strip() else 'replicate'

def saved_provider(folder):
    """Provider of an already submitted request; older jobs without a marker are Enhancor."""
    for name in ['seedance-response.json','response.json']:
        try:return json.loads((Path(folder)/name).read_text()).get('provider') or 'enhancor'
        except (OSError,ValueError):pass
    return 'enhancor'

def seconds(path):
    import av
    with av.open(str(path)) as source:return float(source.duration/av.time_base)

def nearest_ratio(path):
    import av
    with av.open(str(path)) as source:
        stream=source.streams.video[0]
        ratio=stream.width/stream.height
    return min(RATIOS,key=lambda r:abs(RATIOS[r]-ratio))

def submit(folder,prompt,sirio,tein=None,status=print):
    folder=Path(folder)
    from mask_review import require_approved, is_mesh
    require_approved(folder)
    if (folder/'seedance-response.json').exists():raise ValueError('This job already has a provider response. Resume it; prepare a new job for a deliberate variation.')
    from mask_review import mode as job_mode
    if job_mode(folder)=='wan':return submit_wan(folder,sirio,tein,status)
    if provider()=='replicate':return submit_replicate(folder,prompt,sirio,tein,status)
    key=credential('ENHANCOR_API_KEY')
    if not setting('ENHANCOR_WEBHOOK_URL'):raise ValueError('Webhook URL required. Install cloudflared and restart the app, or set ENHANCOR_WEBHOOK_URL.')
    if not (folder/'audio-manifest.json').exists():raise ValueError('Audio separation must complete before submission.')
    from audio_workflow import prepare_seedance_video
    status('Pitching isolated vocals +3 semitones and embedding in colored-depth video')
    prepared=folder/'seedance-input.mp4' if is_mesh(folder) else prepare_seedance_video(folder)
    status('Uploading video with embedded vocals and character references')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:urls=list(pool.map(upload,[prepared,sirio]+([tein] if tein else [])))
    p={'resolution':'1080p','output_format':'mp4','pass_faces':True,'webhook_url':setting('ENHANCOR_WEBHOOK_URL','')}
    p.update(mode='edit',is_draft=True,aspect_ratio='adaptive',videos=[urls[0]],audios=[],images=urls[1:],prompt=prompt.replace('@Audio1', 'the audio embedded in @Video1')+'\n@Video1 contains the colored-depth composite and embedded isolated vocals pitched up three semitones, without the music bed; use its embedded audio for performance and lip synchronization. '+('@Image1 is the primary character reference; @Image2 is the secondary character reference.' if tein else '@Image1 is the only replacement character reference.'));p.pop('duration',None)
    if Path(sirio).suffix.lower() in VIDEO_SUFFIXES:
        p.update(mode='multi_reference',duration=str(max(4,min(30,round(seconds(prepared))))),aspect_ratio=nearest_ratio(prepared))
        p['videos']=[urls[0],urls[1]]
        p['images']=urls[2:]
        p['prompt']=prompt+'\n@Video1 is the source edit and contains isolated vocals pitched +3 semitones. @Video2 is only the primary character visual identity reference. Use only @Video1 audio for speech timing.'
    if is_mesh(folder):p['prompt']=mesh_prompt(folder,p['prompt'])
    (folder/'seedance-request.json').write_text(json.dumps(p,indent=2));h={'x-api-key':key};base=setting('ENHANCOR_BASE_URL','https://apireq.enhancor.ai/api/seedance2.5/v1').rstrip('/')+'/'
    r=requests.post(base+'queue',headers=h,json=p,timeout=90);
    if not r.ok:
        (folder/'submission-error.json').write_text(r.text)
        raise ValueError(f'Enhancor rejected submission ({r.status_code}): {r.text[:500]}')
    j=r.json();(folder/'seedance-response.json').write_text(json.dumps(j))
    ident=j.get('requestId')
    if not ident:raise ValueError('Seedance did not return a request ID.')
    (folder/'generation.json').write_text(json.dumps({'request_id':ident,'prompt':p['prompt'],'video':'seedance-result.mp4','mode':p['mode'],'provider':'enhancor'}))
    status('Seedance draft submitted: '+ident)
    return ident

def mesh_prompt(folder,text):
    mesh_mode=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('mode')
    description='depth composite with face mesh overlay' if mesh_mode=='depth_mesh' else 'original video with face mesh overlay'
    return text.replace('colored-depth composite',description)+' Remove all face mesh lines and any depth colors from the output; use them only for expression and lip motion guidance. Replace the entire original identity including hair. Preserve the exact embedded dialogue and timing.'

def replicate_headers():
    return {'Authorization':'Bearer '+credential('REPLICATE_API_TOKEN')}

def replicate_upload(path):
    from media_host import replicate_file
    return replicate_file(path,replicate_headers())

def replicate_queue(folder,request,response_name):
    """Upload the saved local inputs and create one prediction. Never retried automatically."""
    folder=Path(folder);local=request['local_inputs']
    fields={{'videos':'reference_videos','images':'reference_images'}.get(k,k):v for k,v in local.items()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        uploaded={k:(list(pool.map(replicate_upload,v)) if isinstance(v,list) else replicate_upload(v)) for k,v in fields.items()}
    data=dict(request['input'],**uploaded)
    r=requests.post(REPLICATE_API+'models/'+request.get('model',REPLICATE_MODEL)+'/predictions',headers=replicate_headers(),json={'input':data},timeout=90)
    if not r.ok:
        (folder/'submission-error.json').write_text(r.text)
        raise ValueError(f'Replicate rejected submission ({r.status_code}): {r.text[:500]}')
    j=r.json();ident=j.get('id')
    if not ident:raise ValueError('Replicate did not return a prediction ID.')
    (folder/response_name).write_text(json.dumps({'requestId':ident,'provider':request.get('provider','replicate'),'prediction':j}))
    return ident

def submit_replicate(folder,prompt,sirio,tein=None,status=print):
    """Seedance 2.0 on Replicate: references go in reference_videos/reference_images, cited as [Video1]/[Image1]."""
    from mask_review import is_mesh
    credential('REPLICATE_API_TOKEN')
    if not (folder/'audio-manifest.json').exists():raise ValueError('Audio separation must complete before submission.')
    from audio_workflow import prepare_seedance_video
    status('Pitching isolated vocals +3 semitones and embedding in colored-depth video')
    prepared=folder/'seedance-input.mp4' if is_mesh(folder) else prepare_seedance_video(folder)
    omni=Path(sirio).suffix.lower() in VIDEO_SUFFIXES
    videos=[prepared]+([sirio] if omni else []);images=([] if omni else [sirio])+([tein] if tein else [])
    source=seconds(prepared);total=sum(seconds(v) for v in videos)
    if total>REPLICATE_MAX_REFERENCE_SECONDS:raise ValueError(f'Replicate Seedance accepts at most {REPLICATE_MAX_REFERENCE_SECONDS}s of reference video in total; this job has {total:.1f}s. Trim the source'+(' or identity clip' if omni else '')+' or use Enhancor.')
    if omni:
        text=prompt+'\n@Video1 is the source edit and contains isolated vocals pitched +3 semitones. @Video2 is only the primary character visual identity reference. Use only @Video1 audio for speech timing.'+(' @Image1 is the secondary character reference.' if tein else '')
    else:
        text=prompt.replace('@Audio1','the audio embedded in @Video1')+'\n@Video1 contains the colored-depth composite and embedded isolated vocals pitched up three semitones, without the music bed; use its embedded audio for performance and lip synchronization. '+('@Image1 is the primary character reference; @Image2 is the secondary character reference.' if tein else '@Image1 is the only replacement character reference.')
    if is_mesh(folder):text=mesh_prompt(folder,text)
    text=re.sub(r'@(Video|Image|Audio)(\d+)',r'[\1\2]',text)
    request={'provider':'replicate','model':REPLICATE_MODEL,'mode':'multi_reference' if omni else 'edit','is_draft':True,
        'input':{'prompt':text,'resolution':'480p','duration':max(4,min(REPLICATE_MAX_REFERENCE_SECONDS,round(source))),'aspect_ratio':nearest_ratio(prepared) if omni else 'adaptive','seed':random.randrange(2**31)},
        'local_inputs':{'reference_videos':[str(v) for v in videos],'reference_images':[str(i) for i in images]}}
    (folder/'seedance-request.json').write_text(json.dumps(request,indent=2))
    status('Uploading video with embedded vocals and character references to Replicate')
    ident=replicate_queue(folder,request,'seedance-response.json')
    (folder/'generation.json').write_text(json.dumps({'request_id':ident,'prompt':text,'video':'seedance-result.mp4','mode':request['mode'],'provider':'replicate'}))
    status('Seedance draft submitted on Replicate: '+ident)
    return ident

def submit_wan(folder,character,second=None,status=print):
    """Wan 2.2 Animate Replace: original video + one character photo. Accepts real faces; no prompt, depth or SAM."""
    credential('REPLICATE_API_TOKEN')
    if second:raise ValueError('Wan Animate replaces one character per run. Remove the second reference.')
    if Path(character).suffix.lower() in VIDEO_SUFFIXES:raise ValueError('Wan Animate needs a character photo, not a video. Use a clear, front-facing image.')
    request={'provider':'wan','model':WAN_MODEL,'mode':'animate_replace','is_draft':True,'hd_resolution':'720',
        'input':{'resolution':'480','merge_audio':False,'go_fast':False,'seed':random.randrange(2**31)},
        'local_inputs':{'video':str(folder/'seedance-input.mp4'),'character_image':str(character)}}
    (folder/'seedance-request.json').write_text(json.dumps(request,indent=2))
    status('Uploading original video and character photo to Replicate')
    ident=replicate_queue(folder,request,'seedance-response.json')
    (folder/'generation.json').write_text(json.dumps({'request_id':ident,'prompt':'(Wan Animate Replace takes no text prompt: original video + character photo)','video':'seedance-result.mp4','mode':'animate_replace','provider':'wan'}))
    status('Wan Animate draft submitted on Replicate: '+ident)
    return ident

def download_and_finish(folder,url,status):
    if not isinstance(url,str) or not url.startswith('https://'):raise ValueError('Seedance result URL missing.')
    r=requests.get(url,timeout=180);r.raise_for_status();(folder/'seedance-result.mp4').write_bytes(r.content)
    status('Restoring entire original source audio · discarding generated audio')
    finish_preview(folder/'seedance-result.mp4',folder)

def wait_and_finish(folder,request_id,status=print):
    folder=Path(folder)
    if saved_provider(folder) in ['replicate','wan']:return wait_replicate(folder,request_id,status)
    key=credential('ENHANCOR_API_KEY')
    for _ in range(360):
        r=requests.post(setting('ENHANCOR_BASE_URL','https://apireq.enhancor.ai/api/seedance2.5/v1').rstrip('/')+'/status',headers={'x-api-key':key},json={'request_id':request_id},timeout=30);r.raise_for_status();j=r.json()
        (folder/'provider-status.json').write_text(json.dumps(j,indent=2))
        if j.get('status')=='COMPLETED':return download_and_finish(folder,j.get('result'),status)
        if j.get('status') in ['FAILED','CANCELED']:raise RuntimeError('Seedance failed: '+str(j.get('error') or j.get('status')))
        time.sleep(10)
    raise TimeoutError('Seedance is still pending. Request ID saved; do not resubmit automatically.')

def wait_replicate(folder,request_id,status=print):
    for _ in range(360):
        from media_host import replicate_get
        j=replicate_get(REPLICATE_API+'predictions/'+request_id,replicate_headers())
        (folder/'provider-status.json').write_text(json.dumps(j,indent=2))
        if j.get('status')=='succeeded':
            output=j.get('output')
            return download_and_finish(folder,output[0] if isinstance(output,list) and output else output,status)
        if j.get('status') in ['failed','canceled']:raise RuntimeError(('Wan Animate' if saved_provider(folder)=='wan' else 'Seedance')+' failed on Replicate: '+str(j.get('error') or j.get('status')))
        status(('Wan Animate' if saved_provider(folder)=='wan' else 'Seedance')+' rendering on Replicate: '+str(j.get('status')))
        time.sleep(10)
    raise TimeoutError('Seedance is still pending on Replicate. Prediction ID saved; do not resubmit automatically.')


def submit_hd(folder):
    """Complete the accepted draft. Enhancor reuses its original parameters; Replicate re-renders the same inputs and seed at 1080p."""
    folder=Path(folder)
    if (folder/'hd/response.json').exists():raise ValueError('HD already submitted. Resume its saved request.')
    generation=json.loads((folder/'generation.json').read_text())
    original=json.loads((folder/'seedance-request.json').read_text())
    if not original.get('is_draft') or not (folder/'final-preview.mp4').exists():
        raise ValueError('A completed draft is required before generating 1080p.')
    hd=folder/'hd';hd.mkdir(exist_ok=True)
    # Keep the draft intact and use the exact source audio for the HD export.
    source=hd/'upload.mp4'
    if not source.exists():__import__('shutil').copy2(folder/'upload.mp4',source)
    if original.get('provider') in ['replicate','wan']:
        from mask_review import require_approved
        require_approved(folder)
        request=dict(original,is_draft=False,draft_request_id=generation['request_id'],input=dict(original['input'],resolution=original.get('hd_resolution','1080p')))
        (hd/'request.json').write_text(json.dumps(request,indent=2))
        return replicate_queue(hd,request,'response.json')
    payload={'draft_id':generation['request_id'],'webhook_url':original['webhook_url']}
    key=credential('ENHANCOR_API_KEY')
    (hd/'request.json').write_text(json.dumps(payload,indent=2))
    response=requests.post(setting('ENHANCOR_BASE_URL','https://apireq.enhancor.ai/api/seedance2.5/v1').rstrip('/')+'/queue',headers={'x-api-key':key},json=payload,timeout=90)
    response.raise_for_status();data=response.json()
    (hd/'response.json').write_text(json.dumps(data))
    ident=data.get('requestId')
    if not ident:raise ValueError('Enhancor did not return a request ID.')
    return ident
