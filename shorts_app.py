"""HTTP routes for the shorts editor (mounted by app.py)."""
from pathlib import Path
import threading,uuid,shutil,json,re,time
from fastapi import APIRouter,UploadFile,File,Form,HTTPException,Body
from fastapi.responses import FileResponse,HTMLResponse
from pydantic import ValidationError
import shorts,clients
ROOT=Path(__file__).resolve().parent;RUNS=ROOT/'runs'
router=APIRouter();active={};cancels={};lock=threading.Lock()
IMAGES=['.png','.jpg','.jpeg','.webp','.gif']
# What each background action is called in the UI, and how to retry it.
ACTIONS={'auto':'Editing for you','fix':'Checking the words','post':'Writing your post','transcribe':'Transcribing','autocut':'Auto-cut','apply':'Building your edit','plan':'Auto-plan','render':'Rendering'}

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=RUNS/ident
    if not is_job(path):raise HTTPException(404)
    return path

# A job holds one upload.mp4, or several recordings in parts/ that are joined into it.
def is_job(path):return (path/'upload.mp4').exists() or (path/'parts').is_dir()

def natural(name):return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)',name)]

def read(path,name,default=None):
    try:return json.loads((path/name).read_text())
    except (OSError,ValueError):return default

def check(path):
    try:return shorts.transcript_check(path) if (path/'full-captions.json').exists() else None
    except (OSError,ValueError,KeyError):return None

def busy(ident):return bool(active.get(ident) and active[ident].is_alive())

# A render works from a snapshot of the plan and captions (render-props.json), and post text only reads them:
# while one of those runs, the creator can keep editing; the edits show in the next draft.
EDIT_DURING={'render','post'}
def edit_locked(ident):return busy(ident) and status_of(folder(ident)).get('action') not in EDIT_DURING

def start(path,action,message,work,**extra):
    """One background task per job. Status (action, progress, start time) is persisted for reloads."""
    with lock:
        if busy(path.name):raise HTTPException(409,'This video is still busy. Wait for the current step to finish.')
        started=time.time();info={'action':action,'started':started,**extra}
        shorts.save_status(path,'running',message,progress=None,**info);stop=threading.Event()
        def status(m,p=None):  # every progress update is also a place where Cancel takes effect
            if stop.is_set():raise shorts.Cancelled()
            shorts.save_status(path,'running',m,progress=p,**info)
        status.cancelled=stop
        def run():
            try:end=shorts.save_status(path,'done',work(status) or 'Done',finished=time.time(),**info)
            except Exception as e:
                if stop.is_set():end=shorts.save_status(path,'cancelled','Stopped. Start this step again whenever you like.',finished=time.time(),**info)
                else:end=shorts.save_status(path,'error',str(e),finished=time.time(),**info)
            # Every finished step is kept, so an error is not lost when the next step overwrites status.json.
            with open(path/'history.jsonl','a') as log:log.write(json.dumps(end)+'\n')
        cancels[path.name]=stop;active[path.name]=threading.Thread(target=run,daemon=True);active[path.name].start()

def status_of(path):
    saved=read(path,'status.json',{'state':'idle','status':''})
    if saved['state'] not in ['done','error','idle','cancelled'] and not busy(path.name):
        saved=shorts.save_status(path,'error','Interrupted because the app was restarted. Try again.',action=saved.get('action'),final=saved.get('final'))
    return saved

def meta(path):
    data=read(path,'job.json') or {}
    created=data.get('created') or (path/'upload.mp4').stat().st_mtime
    if data.get('title'):return {'title':data['title'],'created':created}
    words=' '.join(c['text'].strip() for c in (read(path,'full-captions.json') or read(path,'captions.json') or {}).get('captions',[])[:7])
    return {'title':(words.rstrip('.,!?')+'…') if words else time.strftime('Video from %b %d, %H:%M',time.localtime(created)),'created':created}

def stage(path):
    plan=read(path,'plan.json')
    for done,label in [((path/'shorts-final.mp4').exists(),'Final ready'),((path/'shorts-draft.mp4').exists(),'Draft ready'),
                       (bool(plan and plan.get('events')),'Graphics planned'),((path/'tracks.json').exists(),'Edit ready'),
                       ((path/'cut.json').exists(),'Choose what to keep')]:
        if done:return label
    return 'New'

DELIVERY=['','sent','delivered']  # set by hand: sent to the client for review, then delivered

def summary(path):
    s=status_of(path);info=read(path,'manifest.json') or read(path,'source-info.json') or {}
    thumb=next((f'/runs/{path.name}/{n}' for n in ['thumb.jpg','keyframes/0000.00.jpg'] if (path/n).exists()),None)
    job=read(path,'job.json') or {}
    return {'id':path.name,**meta(path),'duration':info.get('duration'),'stage':stage(path),'thumb':thumb,
            'state':s['state'],'action':s.get('action'),'progress':s.get('progress'),'status':s.get('status',''),
            'client':job.get('client') or None,'delivery':job.get('delivery',''),
            'updated':max([p.stat().st_mtime for p in (path/'status.json',path/'plan.json',path/'job.json') if p.exists()] or [meta(path)['created']])}

def set_job(path,**fields):
    (path/'job.json').write_text(json.dumps({**read(path,'job.json',{}),**meta(path),**fields}))

def client_view(c,jobs=None):
    jobs=jobs if jobs is not None else all_jobs()
    kit=c.get('kit')
    return {**c,'videos':sum(1 for j in jobs if (read(j,'job.json') or {}).get('client')==c['id']),
            'kit_summary':{'look':(kit['background'].get('look') or kit['background'].get('mode')),'captions':kit['caption_preset'],
                           'graphics':kit['graphics_style'],'effect':kit.get('transition')} if kit else None}

def all_jobs():return [p for p in RUNS.iterdir() if p.is_dir() and (read(p,'workflow-mode.json') or {}).get('mode')=='shorts' and is_job(p)]

@router.get('/shorts/clients')
def list_clients():
    jobs=all_jobs();return [client_view(c,jobs) for c in clients.load()]

@router.post('/shorts/clients')
def new_client(body:dict=Body(...)):
    try:return client_view(clients.create(body.get('name',''),body.get('color',''),body.get('notes','')))
    except ValueError as e:raise HTTPException(422,str(e))

@router.patch('/shorts/clients/{cid}')
def edit_client(cid:str,body:dict=Body(...)):
    try:return client_view(clients.update(cid,**{k:body[k] for k in ('name','color','notes') if k in body}))
    except KeyError:raise HTTPException(404,'No such client')
    except ValueError as e:raise HTTPException(422,str(e))

@router.delete('/shorts/clients/{cid}')
def remove_client(cid:str):
    """Delete a client; their videos stay, without a client."""
    for p in all_jobs():
        if (read(p,'job.json') or {}).get('client')==cid:set_job(p,client=None)
    clients.delete(cid);return {'ok':True}

@router.put('/shorts/clients/{cid}/kit')
def save_kit(cid:str,body:dict=Body(...)):
    """Save one video's style as the client's brand kit; their next videos start from it."""
    path=folder(str(body.get('job','')))
    if not (path/'plan.json').exists():raise HTTPException(409,'Build this video first, then save its style.')
    try:return client_view(clients.update(cid,kit=shorts.kit_from(path)))
    except KeyError:raise HTTPException(404,'No such client')

@router.delete('/shorts/clients/{cid}/kit')
def drop_kit(cid:str):
    try:return client_view(clients.update(cid,kit=None))
    except KeyError:raise HTTPException(404,'No such client')

@router.post('/shorts/jobs/{ident}/kit')
def use_kit(ident:str):
    """Apply the video's client brand kit to it now (look, captions, graphic style, effects); graphics stay."""
    path=folder(ident);c=clients.get((read(path,'job.json') or {}).get('client'))
    if not c or not c.get('kit'):raise HTTPException(409,'This client has no brand kit yet.')
    if not (path/'plan.json').exists():raise HTTPException(409,'Build this video first.')
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish.')
    set_job(path,kit=c['kit']);shorts.apply_kit(path,c['kit']);return state(ident)

STUDIO=ROOT/'static'/'studio'/'index.html'  # React app (motion/studio), built by `make shorts`

NOT_BUILT='<!doctype html><meta charset="utf-8"><title>Humed’s AI Studio</title><body style="font:16px system-ui;background:#F4F4F6;color:#16181F;display:grid;place-items:center;height:100vh;margin:0"><p>The studio isn’t built yet. Run <b>make shorts</b> in the project folder, then reload this page.</p>'

@router.get('/shorts')
def page():
    if STUDIO.exists():return FileResponse(STUDIO)
    return HTMLResponse(NOT_BUILT,status_code=503)

@router.get('/shorts/setup')
def setup():return {'planner_available':bool(shorts.setting('ANTHROPIC_API_KEY')),'strong_noise_available':bool(shorts.setting('ELEVENLABS_API_KEY')),'palette':shorts.PALETTE}

@router.get('/shorts/sounds')
def sounds():return shorts.sound_catalog()

@router.put('/shorts/sounds/{family}')
def pick_sound(family:str,body:dict=Body(...)):
    """The creator's sound for a family, used in every video from the next render (catalog sounds download once)."""
    try:shorts.set_sound_choice(family,str(body.get('choice','')))
    except ValueError as e:raise HTTPException(400,str(e))
    except Exception:raise HTTPException(502,'Could not download that sound. Check your internet connection.')
    return shorts.sound_catalog()

@router.get('/shorts/sounds/{family}/play')
def play_sound(family:str,choice:str):
    """One option as audio, so the creator can listen before choosing."""
    if family not in shorts.SFX_FAMILIES:raise HTTPException(404,'Unknown sound family')
    try:path=shorts.choice_file(family,choice)
    except ValueError as e:raise HTTPException(400,str(e))
    except Exception:raise HTTPException(502,'Could not download that sound. Check your internet connection.')
    if not path:raise HTTPException(404,'No sound')
    return FileResponse(path)

@router.post('/shorts/jobs/{ident}/revise')
def revise(ident:str,notes:str=Form(...),scope:str=Form('graphics')):
    """Ask for changes in words. graphics: Claude re-plans look + graphics; edit: the cut too. Then a new draft."""
    path=folder(ident)
    if not notes.strip():raise HTTPException(422,'Say what you want changed.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env, or ask Claude Code for the change.')
    if scope=='edit':
        if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
        def work(status):return shorts.auto_edit(path,notes,status)
    else:
        if not (path/'tracks.json').exists():raise HTTPException(409,'Build your edit first.')
        def work(status):
            status('Step 1 of 2 · Claude is updating the look and graphics')
            current=shorts.load_plan(path);current.background.auto=True  # the creator asked Claude to change things
            shorts.save_plan(path,current)
            ask=f"Current plan (keep everything that the request does not touch):\n{current.model_dump_json(exclude_none=True)}\n\nRequested change: {notes.strip()}"
            shorts.plan_auto(path,ask,status=status,asked=notes)
            shorts.render(path,False,lambda m,p=None:status('Step 2 of 2 · '+m,p));return 'New draft ready with your changes'
    start(path,'auto','Making your changes',work);return state(ident)

@router.get('/shorts/looks')
def looks():return [{'id':k,'note':shorts.LOOK_NOTES[k],**shorts.look(k).model_dump()} for k in shorts.LOOKS]

@router.get('/shorts/jobs/{ident}/props')
def props(ident:str):
    """Everything the in-browser Player needs to play the edit exactly as the renderer will."""
    path=folder(ident)
    if not (path/'plan.json').exists():raise HTTPException(409,'Build your edit first (step 2).')
    data,warnings=shorts.render_props(path)
    return {**data,'base':f'/runs/{ident}/','warnings':warnings}

@router.get('/shorts/jobs')
def list_jobs():
    jobs=[summary(p) for p in all_jobs()]
    return sorted(jobs,key=lambda j:-j['created'])

@router.post('/shorts/jobs')
def create(video:list[UploadFile]=File(...),preset:str=Form('bold'),title:str=Form(''),noise:str=Form('off'),track_mode:str=Form('full'),language:str=Form(''),auto:bool=Form(False),notes:str=Form(''),client:str=Form('')):
    if preset not in shorts.PRESETS+['auto']:raise HTTPException(400,'Unknown caption style')
    if noise not in shorts.NOISE:raise HTTPException(400,'Unknown noise setting')
    if track_mode not in shorts.TRACKING:raise HTTPException(400,'Unknown tracking setting')
    if language and language not in shorts.LANGUAGES:raise HTTPException(400,'Unknown language')
    if len(video)>20:raise HTTPException(400,'Upload at most 20 recordings at once.')
    video=sorted(video,key=lambda v:natural(v.filename or ''))  # phone names (IMG_1234) follow recording order
    path=RUNS/uuid.uuid4().hex;path.mkdir(parents=True)
    if len(video)==1:
        with (path/'upload.mp4').open('wb') as out:shutil.copyfileobj(video[0].file,out)
    else:
        (path/'parts').mkdir()
        for k,v in enumerate(video):
            safe=re.sub(r'[^\w.-]+','_',Path(v.filename or f'part{k+1}.mp4').name)[-60:]
            with (path/'parts'/f'{k+1:02d}-{safe}').open('wb') as out:shutil.copyfileobj(v.file,out)
    name=title.strip() or re.sub(r'[_-]+',' ',Path(video[0].filename or '').stem).strip() or 'Untitled video'
    who=clients.get(client);kit=(who or {}).get('kit')  # the client's brand kit, copied so later kit edits don't change this video
    (path/'job.json').write_text(json.dumps({'title':name[:80],'created':time.time(),'client':who['id'] if who else None,'kit':kit}))
    mode={'mode':'shorts','preset':preset,'noise':noise,'tracking':track_mode,'language':language or (kit or {}).get('language') or shorts.job_language(path)}
    if kit and kit.get('voice'):mode['voice']=kit['voice']
    (path/'workflow-mode.json').write_text(json.dumps(mode))
    if auto:(path/'auto.json').write_text(json.dumps({'notes':notes.strip()[:2000]}))
    transcribe(path.name);return state(path.name)

@router.post('/shorts/jobs/{ident}/transcribe')
def transcribe(ident:str):
    path=folder(ident);preset=(read(path,'workflow-mode.json') or {}).get('preset','bold')
    def work(status):
        if not (path/'upload.mp4').exists():
            parts=shorts.join_recordings(sorted((path/'parts').iterdir(),key=lambda p:natural(p.name)),path/'upload.mp4',status)
            (path/'job.json').write_text(json.dumps({**meta(path),'parts':parts}))
        shorts.prepare(path/'upload.mp4',path,preset,status)
        wanted=read(path,'auto.json')  # "Edit it for me" at upload: carry straight on, once
        if wanted is None:return 'Transcript ready · choose what to keep'
        (path/'auto.json').unlink(missing_ok=True);return shorts.auto_edit(path,wanted.get('notes',''),status)
    start(path,'auto' if (path/'auto.json').exists() else 'transcribe','Starting',work);return state(ident)

@router.post('/shorts/jobs/{ident}/auto')
def auto_edit(ident:str,notes:str=Form('')):
    """Edit it for me: Claude cut, build, look + graphics, draft render."""
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    def work(status):return shorts.auto_edit(path,notes,status)
    start(path,'auto','Editing your video',work);return state(ident)

@router.post('/shorts/jobs/{ident}/cancel')
def cancel(ident:str):
    path=folder(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running for this video.')
    cancels[ident].set()
    for _ in range(40):  # most steps stop within a second; a web request is abandoned at once
        if not busy(ident):break
        time.sleep(.05)
    return state(ident)

@router.patch('/shorts/jobs/{ident}')
def rename(ident:str,body:dict=Body(...)):
    path=folder(ident)
    if 'language' in body:  # used when the video is transcribed again
        if body['language'] not in shorts.LANGUAGES:raise HTTPException(422,'Unknown language')
        mode=read(path,'workflow-mode.json') or {'mode':'shorts'};(path/'workflow-mode.json').write_text(json.dumps({**mode,'language':body['language']}))
    if 'noise' in body:  # used from the next build; the cleaned audio is cached per setting
        if body['noise'] not in shorts.NOISE:raise HTTPException(422,'Unknown noise setting')
        if busy(ident):raise HTTPException(409,'Wait for the current step to finish.')
        mode=read(path,'workflow-mode.json') or {'mode':'shorts'};(path/'workflow-mode.json').write_text(json.dumps({**mode,'noise':body['noise']}))
    if 'track_mode' in body:  # used from the next build (Cut section)
        if body['track_mode'] not in shorts.TRACKING:raise HTTPException(422,'Unknown tracking setting')
        if busy(ident):raise HTTPException(409,'Wait for the current step to finish.')
        mode=read(path,'workflow-mode.json') or {'mode':'shorts'};(path/'workflow-mode.json').write_text(json.dumps({**mode,'tracking':body['track_mode']}))
    if 'voice' in body:  # used from the next render; only the volume changes
        if body['voice'] not in shorts.VOICE:raise HTTPException(422,'Unknown voice setting')
        mode=read(path,'workflow-mode.json') or {'mode':'shorts'};(path/'workflow-mode.json').write_text(json.dumps({**mode,'voice':body['voice']}))
    if 'title' in body:
        title=str(body.get('title','')).strip()[:80]
        if not title:raise HTTPException(422,'Give the video a name.')
        (path/'job.json').write_text(json.dumps({**read(path,'job.json',{}),**meta(path),'title':title}))
    if 'client' in body:
        cid=body['client'] or None
        if cid and not clients.get(cid):raise HTTPException(422,'No such client')
        set_job(path,client=cid)
    if 'delivery' in body:
        if body['delivery'] not in DELIVERY:raise HTTPException(422,'Unknown delivery stage')
        set_job(path,delivery=body['delivery'])
    return state(ident)

@router.delete('/shorts/jobs/{ident}')
def delete(ident:str):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish before deleting.')
    shutil.rmtree(path);return {'deleted':ident}

@router.get('/shorts/jobs/{ident}')
def state(ident:str):
    path=folder(ident);tracks=read(path,'tracks.json');captions=read(path,'captions.json',{});cut=read(path,'cut.json')
    files=[n for n in ['source.mp4','tracking-preview.mp4','shorts-draft.mp4','shorts-final.mp4','plan.json','captions.json'] if (path/n).exists()]
    try:cut_summary=shorts.cut_summary(path) if cut else None
    except (OSError,ValueError,KeyError):cut_summary=None
    return {**status_of(path),**summary(path),'id':ident,'manifest':read(path,'manifest.json'),'plan':read(path,'plan.json'),'warnings':read(path,'plan-warnings.json',[]),
     'assets':sorted(p.name for p in (path/'assets').iterdir() if p.suffix.lower() in IMAGES) if (path/'assets').exists() else [],
     'clips':[{'name':n,**c,'poster':next((f'/runs/{ident}/assets/.frames/{Path(n).stem}/{f.name}' for f in sorted((path/'assets'/'.frames'/Path(n).stem).glob('*.jpg'))),None)} for n,c in shorts.load_clips(path).items()],
     'files':{n:(path/n).stat().st_mtime for n in files},
     'units':[{**{k:u[k] for k in ['id','start','end','text']},'edited':bool(u.get('edited'))} for u in read(path,'units.json',[])],'cut':cut,'cut_summary':cut_summary,
     'tracking':{'frames':tracks['frames'],'cuts':len(tracks['cuts']),'face':sum(map(bool,tracks['face'])),
       'left':sum(map(bool,tracks['hands']['left'])),'right':sum(map(bool,tracks['hands']['right']))} if tracks else None,
     'transcript':{'language':captions.get('language'),'text':''.join(c['text'] for c in captions.get('captions',[])).strip()},
     'cut_mtime':(path/'cut.json').stat().st_mtime if cut else None,'planner_available':bool(shorts.setting('ANTHROPIC_API_KEY')),
     'noise':shorts.job_noise(path),'track_mode':shorts.job_tracking(path),'voice':shorts.job_voice(path),'strong_noise_available':bool(shorts.setting('ELEVENLABS_API_KEY')),
     'language':shorts.job_language(path),'word_fixes':read(path,'word-fixes.json',{'fixes':[]})['fixes'],'post':read(path,'post.json',None),'transcript_check':check(path),
     'stopping':bool(cancels.get(ident) and cancels[ident].is_set() and busy(ident))}

@router.post('/shorts/jobs/{ident}/assets')
def add_assets(ident:str,images:list[UploadFile]=File(...)):
    """Images are stored as-is; screen recordings are converted for the renderer (can take a little while)."""
    path=folder(ident)/'assets';path.mkdir(exist_ok=True)
    for upload in images:
        name=Path(upload.filename or 'image.png');ext=name.suffix.lower()
        if ext not in IMAGES+shorts.CLIPS:raise HTTPException(400,f'{name.name}: use an image (PNG, JPG, WebP, GIF) or a screen recording (MP4, MOV).')
        stem=re.sub(r'[^a-z0-9_-]+','-',name.stem.lower()).strip('-') or 'file'
        if ext in IMAGES:
            with (path/(stem+ext)).open('wb') as out:shutil.copyfileobj(upload.file,out)
            continue
        raw=path/('.'+stem+'.upload'+ext)
        with raw.open('wb') as out:shutil.copyfileobj(upload.file,out)
        try:shorts.add_clip(raw,path.parent,stem)
        except Exception as e:raise HTTPException(400,f'{name.name}: could not read this recording ({e}).')
        finally:raw.unlink(missing_ok=True)
    return state(ident)

@router.delete('/shorts/jobs/{ident}/assets/{name}')
def remove_asset(ident:str,name:str):
    path=folder(ident);name=Path(name).name
    if name in shorts.load_clips(path):shorts.remove_clip(path,name)
    elif Path(name).suffix.lower() in IMAGES:(path/'assets'/name).unlink(missing_ok=True)
    return state(ident)

def invalid(e):
    if isinstance(e,ValidationError):return HTTPException(422,'; '.join(f"{'.'.join(map(str,x['loc']))}: {x['msg']}" for x in e.errors()[:6]))
    return HTTPException(422,str(e))

@router.put('/shorts/jobs/{ident}/plan')
def put_plan(ident:str,plan:dict=Body(...)):
    path=folder(ident)
    if not (path/'tracks.json').exists():raise HTTPException(409,'Build your edit first (step 2).')
    try:shorts.save_plan(path,plan)
    except (ValidationError,ValueError) as e:raise invalid(e)
    return state(ident)

@router.post('/shorts/jobs/{ident}/plan/auto')
def auto_plan(ident:str,notes:str=Form('')):
    path=folder(ident)
    if not (path/'tracks.json').exists():raise HTTPException(409,'Build your edit first (step 2).')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env to use the automatic planner, or ask Claude Code to write the plan.')
    def work(status):
        status('Claude is watching your edit and planning graphics…');plan,warnings=shorts.plan_auto(path,notes,status=status)
        return f'{len(plan.events)} graphics planned'+(f' · {len(warnings)} need attention' if warnings else '')
    start(path,'plan','Planning graphics',work);return state(ident)

@router.post('/shorts/jobs/{ident}/render')
def render(ident:str,final:bool=Form(False)):
    path=folder(ident)
    if not (path/'plan.json').exists():raise HTTPException(409,'Build your edit first (step 2).')
    def work(status):
        shorts.render(path,final,status);return 'Final video ready to download' if final else 'Draft ready · watch it, then render the final'
    start(path,'render','Starting render',work,final=final);return state(ident)

@router.put('/shorts/jobs/{ident}/cut')
def put_cut(ident:str,cut:dict=Body(...)):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    try:shorts.save_cut(path,cut)
    except (ValidationError,ValueError) as e:raise invalid(e)
    return state(ident)

@router.put('/shorts/jobs/{ident}/units/{unit}')
def put_unit(ident:str,unit:int,body:dict=Body(...)):
    """Correct the words of one transcript part."""
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if edit_locked(ident):raise HTTPException(409,'This video is still busy. Wait for the current step to finish.')
    try:updated=shorts.edit_part(path,unit,str(body.get('text','')))
    except ValueError as e:raise invalid(e)
    return {**state(ident),'captions_updated':updated}

@router.post('/shorts/jobs/{ident}/fixes')
def fixes(ident:str,notes:str=Form('')):
    """Claude proofreads the transcript and suggests corrections; the creator reviews them before anything changes."""
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env, or ask Claude Code to fix the words.')
    def work(status):
        status('Claude is reading your transcript for misheard words…');n=len(shorts.suggest_fixes(path,notes,status=status))
        return f'{n} suggested fixes · review them, then apply' if n else 'No fixes needed: the words look right'
    start(path,'fix','Checking the words',work);return state(ident)

@router.post('/shorts/jobs/{ident}/post')
def write_post(ident:str,notes:str=Form('')):
    """Claude writes title options, the description and hashtags from the edit's words (one call)."""
    path=folder(ident)
    if not (path/'captions.json').exists():raise HTTPException(409,'Build your edit first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env, or ask Claude Code for the post text.')
    def work(status):
        status('Claude is writing your title, description and hashtags…');shorts.post_copy(path,notes,status=status)
        return 'Post text ready · copy it on the Export tab'
    start(path,'post','Writing your post',work);return state(ident)

@router.post('/shorts/jobs/{ident}/fixes/apply')
def apply_fixes(ident:str,body:dict=Body(...)):
    path=folder(ident);edits=body.get('edits') or {}
    if edit_locked(ident):raise HTTPException(409,'This video is still busy. Wait for the current step to finish.')
    if not edits:raise HTTPException(422,'Choose at least one fix.')
    try:in_place=shorts.apply_fixes(path,edits)
    except (ValueError,KeyError) as e:raise invalid(e)
    return {**state(ident),'captions_updated':in_place}

@router.delete('/shorts/jobs/{ident}/fixes')
def discard_fixes(ident:str):
    path=folder(ident);(path/'word-fixes.json').unlink(missing_ok=True);return state(ident)

@router.post('/shorts/jobs/{ident}/cut/auto')
def auto_cut(ident:str,notes:str=Form('')):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env for the automatic cut, or ask Claude Code to choose the parts.')
    def work(status):
        status('Claude is reading your transcript and choosing what matters…');shorts.cut_auto(path,notes,status=status)
        s=shorts.cut_summary(path);return f"Suggested cut: {s['kept']:.0f}s of {s['original']:.0f}s · check it, then build your edit"
    start(path,'autocut','Auto-cut',work);return state(ident)

@router.post('/shorts/jobs/{ident}/cut/apply')
def apply_cut(ident:str):
    path=folder(ident)
    if not (path/'cut.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    def work(status):
        shorts.apply_cut(path,status);return 'Your edit is ready to review'
    start(path,'apply','Building your edit',work);return state(ident)
