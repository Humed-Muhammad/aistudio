"""HTTP routes for the Channel tool (mounted by app.py); the pages live in the studio app (/shorts?view=channel).
Research and videos are folders under runs/channel; each runs one background step at a time (the Shorts task helpers),
and every paid step waits for the creator's click."""
from pathlib import Path
import shutil,time
from fastapi import APIRouter,Body,File,HTTPException,UploadFile
from fastapi.responses import RedirectResponse
import channel,channel_youtube as yt,graphics
from shorts_app import busy,cancels,start,status_of
router=APIRouter()

def research_path(ident):
    try:return channel.research_folder(ident)
    except ValueError:raise HTTPException(404,'No such research.')

def research_state(path):
    s=status_of(path);data=channel.read(path,'data.json') or {}
    return {**channel.research_summary(path),'request':channel.read(path,'request.json'),'result':channel.read(path,'result.json'),
            'summary_rows':data.get('summary',[]),'videos':data.get('videos',[])[:300],'channels':data.get('channels',[])[:200],
            'competitors':data.get('competitors',[]),'competitor_problems':data.get('competitor_problems',[]),'suggestions':data.get('suggestions',{}),
            'made_videos':channel.read(path,'made.json',{}),
            'state':s['state'],'status':s.get('status',''),'progress':s.get('progress'),'action':s.get('action')}

@router.get('/channel')
def page():return RedirectResponse('/shorts?view=channel')

@router.get('/channel/setup')
def setup():
    import channel_media
    return {'claude':bool(graphics.claude_bin()),'models':channel.MODELS,'keys':channel.keys(),'styles':channel.STYLES,
            'quota':{'used':yt.used_today(),'daily':yt.DAILY},'defaults':channel.DEFAULT_PROFILE,'art_styles':channel_media.ART_STYLES,
            'prices':{'image':channel_media.cost_of('image'),'ai_clip':channel_media.cost_of('ai_clip')},'backdrops':channel.films.BACKDROPS}

@router.get('/channel/quota')
def quota(seeds:str='',searches:int=2,profile:str='',focus:str='',competitors:int=0):
    """YouTube units a scan would use at most: a niche scan (seeds) or a topic scan (a channel, its focus and competitors)."""
    if profile:
        found=channel.topic_seeds(channel.profile(profile),focus)
        return {'used':yt.used_today(),'daily':yt.DAILY,'seeds':found,'estimate':channel.topic_estimate(found,searches,[0]*competitors) if found else 0}
    return {'used':yt.used_today(),'daily':yt.DAILY,'estimate':yt.estimate(channel.seeds_of(seeds),searches) if seeds.strip() else 0}

@router.get('/channel/voices')
def list_voices():
    """ElevenLabs voices and credits left (free calls: nothing is spoken)."""
    if not channel.keys()['elevenlabs']:raise HTTPException(400,'Add ELEVENLABS_API_KEY to .env to choose a voice.')
    try:return {'voices':channel.voices(),'credits':channel.credits(),'models':channel.VOICE_MODELS,'delivery':channel.channel_voice.DELIVERY}
    except RuntimeError as e:raise HTTPException(502,str(e))

@router.get('/channel/profiles')
def list_profiles():return channel.profiles()

@router.post('/channel/profiles')
def create_profile(body:dict=Body(...)):
    try:return channel.save_profile(body)
    except (ValueError,TypeError) as e:raise HTTPException(400,str(e))

@router.put('/channel/profiles/{pid}')
def update_profile(pid:str,body:dict=Body(...)):
    try:return channel.save_profile(body,pid)
    except KeyError:raise HTTPException(404,'No such channel.')
    except (ValueError,TypeError) as e:raise HTTPException(400,str(e))

@router.delete('/channel/profiles/{pid}')
def delete_profile(pid:str):
    channel.delete_profile(pid);return channel.profiles()

@router.get('/channel/research')
def list_research(kind:str=''):
    """Past research, newest first; kind=niche or topics for one kind only."""
    if not channel.RESEARCH.exists():return []
    out=[]
    for p in channel.RESEARCH.iterdir():
        if (p/'request.json').exists() and (not kind or channel.read(p,'request.json',{}).get('kind','niche')==kind):
            s=status_of(p);out.append({**channel.research_summary(p),'state':s['state'],'status':s.get('status',''),'progress':s.get('progress')})
    return sorted(out,key=lambda r:-r['created'])

@router.post('/channel/research')
def create_research(body:dict=Body(...)):
    """Scan YouTube for the seed ideas (free quota), then Claude Code writes the report (plan usage, no API key)."""
    if not graphics.claude_bin():raise HTTPException(400,'Claude Code is not installed: install the Claude Code VS Code extension or CLI.')
    try:
        if body.get('kind')=='topics':
            comps=body.get('competitors');comps=channel.seeds_of(comps) if isinstance(comps,str) else comps
            path=channel.new_topic_research(body.get('profile'),str(body.get('focus','')),comps,int(body.get('months',3)),int(body.get('searches',1)),str(body.get('model','sonnet')))
        else:path=channel.new_research(str(body.get('seeds','')),int(body.get('months',12)),int(body.get('searches',2)),body.get('profile'),str(body.get('model','sonnet')))
    except (ValueError,TypeError) as e:raise HTTPException(400,str(e))
    start(path,'research','Starting the research',lambda status:(channel.research(path,status),'Report ready')[1])
    return research_state(path)

@router.get('/channel/research/{ident}')
def get_research(ident:str):return research_state(research_path(ident))

@router.post('/channel/research/{ident}/report')
def rewrite_report(ident:str,body:dict=Body({})):
    path=research_path(ident);model=body.get('model')
    if model and model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    if channel.read(path,'data.json') is None:raise HTTPException(400,'Run the YouTube scan first.')
    start(path,'report','Claude is writing the niche report',lambda status:(channel.report(path,status,model),'Report ready')[1])
    return research_state(path)

@router.post('/channel/research/{ident}/scan')
def rescan(ident:str):
    path=research_path(ident)
    start(path,'research','Starting the research',lambda status:(channel.research(path,status),'Report ready')[1])
    return research_state(path)

@router.post('/channel/research/{ident}/cancel')
def cancel_research(ident:str):
    path=research_path(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running.')
    cancels[ident].set()
    for _ in range(50):
        if not busy(ident):break
        time.sleep(.1)
    return research_state(path)

@router.delete('/channel/research/{ident}')
def delete_research(ident:str):
    path=research_path(ident)
    if busy(ident):raise HTTPException(409,'Stop the research first.')
    shutil.rmtree(path);return {'deleted':ident}

# ---- videos ---------------------------------------------------------------------------------------------------------

def video_path(ident):
    try:return channel.video_folder(ident)
    except ValueError:raise HTTPException(404,'No such video.')

def editable(path):
    s=status_of(path)
    if busy(path.name) and s.get('action') in ('script','chat','auto'):raise HTTPException(409,'Claude is changing this video right now. Wait a moment, or stop it.')

def video_state(path):
    s=status_of(path);script=channel.script_of(path);_,_,stats=channel.check_script(script,channel.job(path).get('minutes'),channel.voice_model(path))
    try:est=channel.voice_estimate(path)
    except ValueError:est=None
    runs=channel.read(path,'claude-runs.json',[])
    files={n:int(f.stat().st_mtime) for n in ('voice.wav','captions.srt','renders/draft.mp4','renders/final.mp4') for f in [path/n] if f.exists()}
    return {**channel.video_summary(path),'job':channel.job(path),'script':script,'stats':stats,'warnings':channel.read(path,'script-warnings.json',[]),
            'sources':(path/'sources.md').read_text() if (path/'sources.md').exists() else '','approved':channel.approved(path),
            'voice':est,'voiced':channel.voiced(path),'voice_changed':channel.voice_changed(path),
            'performs_tags':channel.VOICE_MODELS.get(channel.voice_model(path),{}).get('tags',False),'words':channel.read(path,'words.json'),'files':files,
            'can_undo':any(r.get('backup') and not r.get('undone') for r in runs),'runs':runs[-8:],
            'state':s['state'],'status':s.get('status',''),'progress':s.get('progress'),'action':s.get('action')}

def run(path,action,message,work,done):
    start(path,action,message,lambda status:(work(status),done)[1])
    return video_state(path)

@router.get('/channel/videos')
def list_videos():
    if not channel.VIDEOS.exists():return []
    out=[]
    for p in channel.VIDEOS.iterdir():
        if (p/'job.json').exists():
            s=status_of(p);out.append({**channel.video_summary(p),'state':s['state'],'status':s.get('status',''),'progress':s.get('progress'),'action':s.get('action')})
    return sorted(out,key=lambda v:-v['created'])

@router.post('/channel/videos')
def create_video(body:dict=Body(...)):
    """A new video from a topic (typed, or picked from a research report). write=true starts Claude on the script."""
    notes=body.get('notes','')
    found=None
    if body.get('research'):  # a topic from a research: its angle, points and sources go to the script writer
        try:res=channel.read(channel.research_folder(str(body['research'])),'result.json') or {}
        except ValueError:res={}
        found=next((t for t in res.get('topics',[]) if t['title']==body.get('topic')),None)
        if found and not notes:notes=channel.topic_notes(found)
    try:path=channel.new_video(body.get('profile'),body.get('topic'),body.get('minutes'),body.get('hook',''),notes,body.get('research'),body.get('based_on'))
    except (ValueError,TypeError) as e:raise HTTPException(400,str(e))
    if found:channel.mark_made(body['research'],found['title'],path.name)
    model=str(body.get('model','sonnet'))
    if body.get('write'):
        if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
        return run(path,'script','Claude is researching the topic',lambda status:channel.write_script(path,model,status),'Script ready: read it, change what you like, then approve it.')
    return video_state(path)

@router.get('/channel/videos/{ident}')
def get_video(ident:str):return video_state(video_path(ident))

@router.patch('/channel/videos/{ident}')
def patch_video(ident:str,body:dict=Body(...)):
    """Title, notes, length or channel of a video."""
    path=video_path(ident);j=channel.job(path)
    for k in ('title','notes','hook'):
        if k in body:j[k]=str(body[k] or '').strip()[:2000 if k=='notes' else 400]
    if 'minutes' in body:j['minutes']=max(1,min(30,int(body['minutes'] or channel.DEFAULT_MINUTES)))
    if 'profile' in body:
        if not channel.profile(body['profile']):raise HTTPException(400,'No such channel.')
        j['profile']=body['profile']
    channel.write(path,'job.json',j);return video_state(path)

@router.delete('/channel/videos/{ident}')
def delete_video(ident:str):
    path=video_path(ident)
    if busy(ident):raise HTTPException(409,'Stop the current step first.')
    shutil.rmtree(path);return {'deleted':ident}

@router.post('/channel/videos/{ident}/script')
def write_script(ident:str,body:dict=Body({})):
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    return run(path,'script','Claude is researching the topic',lambda status:channel.write_script(path,model,status),'Script ready: read it, change what you like, then approve it.')

@router.post('/channel/videos/{ident}/perform')
def perform(ident:str,body:dict=Body({})):
    """Make it sound human: Claude Code rewrites the delivery (rhythm, emphasis, [tags]) and keeps the content (plan usage)."""
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    if not channel.script_of(path).get('sections'):raise HTTPException(400,'Write the script first.')
    return run(path,'script','Claude is making it sound human',lambda status:channel.perform(path,model,status),
               'Delivery added: read it, then voice the changed paragraphs.')

@router.put('/channel/videos/{ident}/script')
def put_script(ident:str,body:dict=Body(...)):
    """The creator's own edits to the script (the editor saves the whole script)."""
    path=video_path(ident);editable(path);channel.save_script(path,body);return video_state(path)

@router.post('/channel/videos/{ident}/approve')
def approve(ident:str,body:dict=Body({})):
    path=video_path(ident)
    try:channel.approve(path,bool(body.get('on',True)))
    except ValueError as e:raise HTTPException(400,str(e))
    return video_state(path)

@router.post('/channel/videos/{ident}/voice')
def voice(ident:str,body:dict=Body({})):
    """Speak the script with ElevenLabs. credits: the number the creator saw and agreed to (refused if it now costs more)."""
    path=video_path(ident)
    try:est=channel.voice_estimate(path)
    except ValueError as e:raise HTTPException(400,str(e))
    if est['credits'] and int(body.get('credits') or 0)<est['credits']:
        raise HTTPException(409,f'The voice-over now needs {est["credits"]:,} credits. Confirm that amount to go ahead.')
    return run(path,'voice','Voicing the script with ElevenLabs',lambda status:channel.voice(path,status,est['credits']),'Voice-over ready')

@router.post('/channel/videos/{ident}/undo')
def undo(ident:str):
    path=video_path(ident);editable(path)
    try:channel.undo(path)
    except ValueError as e:raise HTTPException(409,str(e))
    return video_state(path)

@router.post('/channel/videos/{ident}/cancel')
def cancel_video(ident:str):
    path=video_path(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running.')
    cancels[ident].set()
    for _ in range(50):
        if not busy(ident):break
        time.sleep(.1)
    return video_state(path)

def chat_state(path):
    chat=channel.read(path,'chat.json',{'messages':[]})
    return {'messages':chat.get('messages',[]),'claude':bool(graphics.claude_bin()),'status':status_of(path),'video':video_state(path)}

@router.get('/channel/videos/{ident}/chat')
def get_chat(ident:str):return chat_state(video_path(ident))

@router.post('/channel/videos/{ident}/chat')
def post_chat(ident:str,body:dict=Body(...)):
    path=video_path(ident);text=str(body.get('message','')).strip();model=str(body.get('model','sonnet'))
    if not text:raise HTTPException(400,'Write what you want changed.')
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    start(path,'chat','Claude is reading your message',lambda status:(channel.send(path,text,model,status),'Done')[1],message=text[:300])
    return chat_state(path)

@router.delete('/channel/videos/{ident}/chat')
def clear_chat(ident:str):
    path=video_path(ident);editable(path);channel.clear_chat(path);return chat_state(path)

# ---- shots, footage, render ------------------------------------------------------------------------------------------

def shots_state(path):
    import channel_render,channel_media
    data=channel.read(path,'shots.json') or {};vis=channel.read(path,'visuals.json') or {}
    try:budget=float(channel.video_profile(path).get('ai_budget') or 0)
    except ValueError:budget=0.
    return {'shots':data.get('shots',[]),'scenes_warnings':channel.read(path,'scenes-warnings.json',[]),
            'visuals':{k:v for k,v in vis.items() if isinstance(v,dict)},'footage_ready':bool(vis.get('ready')),
            'costs':channel.footage_costs(path) if data.get('shots') else {'todo':[],'usd':0},
            'budget':budget,'spent':channel_media.spent(path),'gather':channel.read(path,'gather.json'),'credits':channel_render.credits(path)}

@router.get('/channel/videos/{ident}/shots')
def get_shots(ident:str):return shots_state(video_path(ident))

@router.post('/channel/videos/{ident}/shots')
def plan_shots(ident:str,body:dict=Body({})):
    """Claude Code plans every shot from the timed narration (plan usage)."""
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    if not channel.read(path,'words.json'):raise HTTPException(400,'Voice the script first: shots follow the timing of the voice-over.')
    return run(path,'scenes','Claude is planning the shots',lambda status:channel.plan_shots(path,model,status),'Shots planned. Find the footage next.')

@router.put('/channel/videos/{ident}/scenes')
def put_scenes(ident:str,body:dict=Body(...)):
    """The creator's edits to the shot list (kind, query, template words, where it starts)."""
    path=video_path(ident);editable(path)
    channel.write(path,'scenes.json',{'shots':body.get('shots') if isinstance(body.get('shots'),list) else []})
    try:channel.check_shots(path)
    except ValueError as e:raise HTTPException(400,str(e))
    return shots_state(path)

@router.post('/channel/videos/{ident}/gather')
def gather(ident:str,body:dict=Body({})):
    """Stock footage for every shot (free) and the AI visuals the creator approved: spend is the USD shown to them."""
    path=video_path(ident);spend=max(0.,float(body.get('spend') or 0))
    if not channel.read(path,'shots.json'):raise HTTPException(400,'Plan the shots first.')
    def work(status):
        out=channel.gather(path,status,spend)
        return f"Footage ready for every shot" if not out['missing'] else f"{len(out['missing'])} shot{'s'[:len(out['missing'])!=1]} still without footage (shown as words)"+(f": {out['errors'][0]}" if out['errors'] else '')
    start(path,'gather','Finding footage',work);return video_state(path)

@router.post('/channel/videos/{ident}/swap')
def swap(ident:str,body:dict=Body(...)):
    """Use another stock clip for one shot."""
    import channel_render
    path=video_path(ident);editable(path)
    shots=(channel.read(path,'shots.json') or {}).get('shots',[])
    try:channel_render.swap(path,shots,str(body.get('shot')),str(body.get('candidate')),channel.keys())
    except (ValueError,RuntimeError) as e:raise HTTPException(400,str(e))
    return shots_state(path)

@router.post('/channel/videos/{ident}/render')
def render(ident:str,body:dict=Body({})):
    path=video_path(ident);final=bool(body.get('final'))
    if not channel.read(path,'shots.json'):raise HTTPException(400,'Plan the shots first.')
    start(path,'render','Rendering the final video' if final else 'Rendering a quick draft',
          lambda status:f"{'Final' if final else 'Draft'} ready ({channel.render(path,final,status).name})",final=final)
    return video_state(path)

@router.get('/channel/videos/{ident}/props')
def preview_props(ident:str):
    """Props for the live preview in the editor (the same composition the renderer uses)."""
    import channel_render
    path=video_path(ident)
    try:channel.check_shots(path);return channel_render.props(path,channel.video_profile(path),base=f'/runs/channel/videos/{ident}/')
    except ValueError as e:raise HTTPException(400,str(e))

@router.post('/channel/profiles/{pid}/music')
def upload_music(pid:str,file:UploadFile=File(...)):
    """The channel's music bed (royalty-free, e.g. from the YouTube Audio Library), used under every video."""
    p=channel.profile(pid)
    if not p:raise HTTPException(404,'No such channel.')
    ext=Path(file.filename or '').suffix.lower()
    if ext not in ('.mp3','.wav','.m4a','.aac','.ogg','.flac'):raise HTTPException(400,'Upload an audio file (mp3, wav, m4a).')
    d=channel.HOME/'music';d.mkdir(parents=True,exist_ok=True)
    for old in d.glob(f'{pid}-*'):old.unlink()
    name=f'{pid}-{Path(file.filename).stem[:40]}{ext}'
    with (d/name).open('wb') as out:shutil.copyfileobj(file.file,out)
    return channel.save_profile({'look':{**p['look'],'music':name}},pid)

@router.delete('/channel/profiles/{pid}/music')
def remove_music(pid:str):
    p=channel.profile(pid)
    if not p:raise HTTPException(404,'No such channel.')
    for old in (channel.HOME/'music').glob(f'{pid}-*'):old.unlink()
    return channel.save_profile({'look':{**p['look'],'music':''}},pid)

# ---- mascot ----------------------------------------------------------------------------------------------------------

def mascot_state(pid):
    p=channel.profile(pid)
    if not p:raise HTTPException(404,'No such channel.')
    img=p['art']['mascot'].get('image') if p.get('art') else ''
    stamp=lambda rel:int((channel.HOME/rel).stat().st_mtime) if (channel.HOME/rel).exists() else 0
    return {'profile':p,'image':f'/runs/channel/{img}?v={stamp(img)}' if img and (channel.HOME/img).exists() else None,
            'options':[f'/runs/channel/{o}?v={stamp(o)}' for o in channel.mascot_options(pid)]}

@router.get('/channel/profiles/{pid}/mascot')
def get_mascot(pid:str):return mascot_state(pid)

@router.post('/channel/profiles/{pid}/mascot/design')
def design_mascot(pid:str,body:dict=Body(...)):
    """Four mascot designs in the channel's art style (paid: usd is the amount the creator saw and agreed to)."""
    try:channel.design_mascots(pid,body.get('description',''),allowed=float(body.get('usd') or 0))
    except ValueError as e:raise HTTPException(400,str(e))
    except RuntimeError as e:raise HTTPException(502,str(e))
    return mascot_state(pid)

@router.post('/channel/profiles/{pid}/mascot/pick')
def pick_mascot(pid:str,body:dict=Body(...)):
    try:channel.pick_mascot(pid,option=str(body.get('option','')).split('?')[0])
    except ValueError as e:raise HTTPException(400,str(e))
    return mascot_state(pid)

@router.post('/channel/profiles/{pid}/mascot/upload')
def upload_mascot(pid:str,file:UploadFile=File(...)):
    """The creator's own mascot picture (a drawing, a character they designed elsewhere)."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        src=Path(tmp)/'upload';src.write_bytes(file.file.read())
        try:channel.pick_mascot(pid,upload=src)
        except ValueError as e:raise HTTPException(400,str(e))
    return mascot_state(pid)

@router.delete('/channel/profiles/{pid}/mascot')
def remove_mascot(pid:str):
    p=channel.profile(pid)
    if not p:raise HTTPException(404,'No such channel.')
    (channel.MASCOTS/pid/'mascot.png').unlink(missing_ok=True)
    channel.save_profile({'art':{**p['art'],'mascot':{**p['art']['mascot'],'image':''}}},pid);return mascot_state(pid)

# ---- shorts and the post ---------------------------------------------------------------------------------------------

def short_summary(ident):
    import shorts_app
    path=shorts_app.RUNS/ident if ident else None
    return shorts_app.summary(path) if path and shorts_app.is_job(path) else None

def publish_state(path):
    data=channel.read(path,'moments.json') or {};post=channel.read(path,'post.json')
    thumbs=[f'/runs/channel/videos/{path.name}/{t}?v={int((path/t).stat().st_mtime)}' for t in (f'thumbs/{i}.jpg' for i in (1,2,3)) if (path/t).exists()]
    return {'moments':[{**m,'short':short_summary(m.get('job')),'file':f'/runs/channel/videos/{path.name}/renders/short-{m["n"]}.mp4' if (path/'renders'/f'short-{m["n"]}.mp4').exists() else None}
                       for m in data.get('moments',[])],
            'moment_warnings':data.get('warnings',[]),'post':post,'thumbs':thumbs,'chapters':channel.chapters(path),
            'planner_available':bool(channel.setting('ANTHROPIC_API_KEY')),'upload':channel.read(path,'upload.json')}

@router.get('/channel/videos/{ident}/publish')
def get_publish(ident:str):return publish_state(video_path(ident))

@router.post('/channel/videos/{ident}/moments')
def moments(ident:str,body:dict=Body({})):
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    def work(status):
        found,_=channel.pick_moments(path,model,status);return f'{len(found)} moments found: make them into shorts when you like.'
    start(path,'shorts','Claude is choosing the shorts',work);return video_state(path)

@router.post('/channel/videos/{ident}/shorts')
def make_shorts(ident:str,body:dict=Body({})):
    """Render the chosen moments 9:16 and add each to the Shorts editor (exact captions; Edit it for me only with the Claude API key)."""
    import shorts_app
    path=video_path(ident);picks=[int(x) for x in body.get('moments') or []] or None
    edit=bool(body.get('edit')) and bool(channel.setting('ANTHROPIC_API_KEY'))
    if not (channel.read(path,'moments.json') or {}).get('moments'):raise HTTPException(400,'Find the moments first.')
    def work(status):
        made=channel.make_shorts(path,picks,edit,status)
        # Transcribe (from the exact captions: free) and, when asked, edit each one after another, as YouTube to Shorts does.
        for k,short in enumerate(made):
            ident2=short.name;status(f'Short {k+1} of {len(made)}: preparing it in the Shorts editor',None)
            if not busy(ident2):shorts_app.transcribe(ident2)
            while busy(ident2):
                if status.cancelled.wait(1.5):
                    if ident2 in cancels:cancels[ident2].set()
                    raise channel.Cancelled()
                got=status_of(short);status(f"Short {k+1} of {len(made)}: {got.get('status','')}",got.get('progress'))
        return f"{len(made)} short{'s'[:len(made)!=1]} added to Videos"+(' · edited drafts to review' if edit else ' · open each to style its captions')
    start(path,'shorts','Making the shorts',work);return video_state(path)

@router.post('/channel/videos/{ident}/package')
def package(ident:str,body:dict=Body({})):
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if model not in channel.MODELS:raise HTTPException(400,'Unknown model.')
    start(path,'package','Claude is writing the post',lambda status:(channel.package(path,model,status),'Post and thumbnails ready')[1]);return video_state(path)

@router.put('/channel/videos/{ident}/post')
def put_post(ident:str,body:dict=Body(...)):
    path=video_path(ident);channel.save_post(path,body);return publish_state(path)

@router.post('/channel/videos/{ident}/thumbnails')
def rethumb(ident:str):
    path=video_path(ident)
    if not channel.read(path,'post.json'):raise HTTPException(400,'Write the post first.')
    start(path,'package','Rendering thumbnails',lambda status:(channel.thumbnails(path,status),'Thumbnails ready')[1]);return video_state(path)

# ---- YouTube account, upload, finish it for me -----------------------------------------------------------------------

@router.get('/channel/youtube')
def youtube_account():return yt.account()

@router.post('/channel/youtube/login')
def youtube_login():
    """Google sign-in for uploads: returns the consent page to open; the answer is caught on this Mac."""
    try:return {**yt.account(),'login_url':yt.login()}
    except ValueError as e:raise HTTPException(400,str(e))

@router.post('/channel/videos/{ident}/upload')
def upload(ident:str,body:dict=Body({})):
    """Upload the final video (an explicit click; private by default, or scheduled)."""
    path=video_path(ident);privacy=str(body.get('privacy','private'));when=body.get('publish_at') or None
    if not yt.account()['connected']:raise HTTPException(400,'Connect your YouTube channel first.')
    if not (path/'renders'/'final.mp4').exists():raise HTTPException(400,'Render the final video first.')
    def work(status):
        info=channel.upload(path,privacy,when,int(body.get('thumb') or 1),status)
        return f"Uploaded: {info['url']}"+(' · '+' '.join(info['warnings']) if info['warnings'] else '')
    start(path,'upload','Uploading to YouTube',work);return video_state(path)

@router.post('/channel/videos/{ident}/finish')
def finish(ident:str,body:dict=Body({})):
    """Finish it for me after the script is approved: credits and spend are what the creator saw and agreed to."""
    path=video_path(ident);model=str(body.get('model','sonnet'))
    if not channel.approved(path):raise HTTPException(400,'Read and approve the script first.')
    try:est=channel.voice_estimate(path)
    except ValueError as e:raise HTTPException(400,str(e))
    if est['credits'] and int(body.get('credits') or 0)<est['credits']:raise HTTPException(409,f'The voice-over needs {est["credits"]:,} credits. Confirm that amount to go ahead.')
    spend=max(0.,float(body.get('spend') or 0))
    start(path,'auto','Finishing the video for you',lambda status:channel.finish(path,est['credits'],spend,model,status));return video_state(path)
