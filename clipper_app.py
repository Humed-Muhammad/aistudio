"""HTTP routes for YouTube to Shorts (mounted by app.py). A link becomes a clip job in runs/clips/ID: download,
transcript, moments; each moment made becomes an ordinary Shorts editor video, edited one after another."""
from pathlib import Path
import time,uuid,shutil,json
from fastapi import APIRouter,Form,HTTPException,Body
import clipper,shorts,shorts_app,clients
from shorts_app import busy,start,status_of,cancels
router=APIRouter()
SETTINGS={'language':'am','count':'auto','length':'auto','framing':'auto','track':'fast','preset':'duo','noise':'off','client':None,'edit':True,'auto':True,'notes':''}

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=clipper.RUNS/ident
    if not (path/'job.json').exists():raise HTTPException(404)
    return path

def settings_of(path):return {**SETTINGS,**(clipper.read(path,'job.json',{}).get('settings') or {})}

def short_path(ident):
    path=shorts_app.RUNS/ident if ident else None
    return path if path and shorts_app.is_job(path) else None

def summary(path):
    s=status_of(path);job=clipper.read(path,'job.json',{});moments=(clipper.read(path,'moments.json') or {}).get('moments',[])
    return {'id':path.name,'title':job.get('title') or job.get('url',''),'channel':job.get('channel',''),'url':job.get('url'),'duration':job.get('duration'),
            'thumb':f'/runs/clips/{path.name}/thumb.jpg' if (path/'thumb.jpg').exists() else None,'created':job.get('created',0),
            'state':s['state'],'status':s.get('status',''),'progress':s.get('progress'),'action':s.get('action'),
            'moments':len(moments),'made':sum(1 for m in moments if short_path(m.get('job')))}

def state(ident):
    path=folder(ident);data=clipper.read(path,'moments.json') or {};info=clipper.read(path,'info.json',{})
    moments=[{**m,'short':shorts_app.summary(short_path(m.get('job'))) if short_path(m.get('job')) else None} for m in data.get('moments',[])]
    return {**summary(path),'moments':moments,'summary':data.get('summary',''),'warnings':data.get('warnings',[]),'settings':settings_of(path),
            'chapters':len(info.get('chapters') or []),'replayed':bool(info.get('heatmap')),
            'transcript':(clipper.read(path,'transcript.json') or {}).get('provider'),'parts':len(clipper.read(path,'units.json',[])),
            'transcript_needed':clipper.read(path,'transcript-needed.json'),'source':f'/runs/clips/{ident}/source.mp4' if (path/'source.mp4').exists() else None,
            'planner_available':bool(shorts.setting('ANTHROPIC_API_KEY'))}

def run_shorts(path,picks,status):
    """Cut the chosen moments, then transcribe and edit each short one at a time (the Shorts editor's own steps):
    running them side by side would load the Mac with several trackers at once. Shorts already made are kept;
    one cut but never started (the app was closed) carries on."""
    s=settings_of(path);edit=s['edit'] and bool(shorts.setting('ANTHROPIC_API_KEY'))
    clipper.make(path,picks,status,framing=s['framing'],track=s['track'],preset=s['preset'],noise=s['noise'],language=s['language'],
                 client=s['client'],edit=edit,notes=s['notes'])
    moments=clipper.read(path,'moments.json')['moments']
    queue=[m for m in moments if (picks is None or m['n'] in picks) and short_path(m.get('job'))]
    queue=[m for m in queue if not (short_path(m['job'])/'units.json').exists()]
    for k,m in enumerate(queue):
        ident=m['job'];label=f"Short {k+1} of {len(queue)} · {m['title']}"
        status(label,None)
        if not busy(ident):shorts_app.transcribe(ident)
        while busy(ident):
            if status.cancelled.wait(1.5):
                if ident in cancels:cancels[ident].set()
                raise shorts.Cancelled()
            got=status_of(short_path(ident));status(f"{label} · {got.get('status','')}",got.get('progress'))
    n=sum(1 for m in moments if short_path(m.get('job')))
    return f"{n} short{'s'[:n!=1]} made · {'drafts are' if edit else 'each is'} in Videos for you to review"

def pipeline(path,status):
    """Everything after the link, as far as it can go without asking: download, transcript, moments, then the shorts."""
    s=settings_of(path)
    if not (path/'units.json').exists():
        msg=clipper.fetch(clipper.read(path,'job.json')['url'],path,s['language'],status) if not (path/'source.mp4').exists() else clipper.transcribe(path,status)
        if not (path/'units.json').exists():return msg  # waiting for the creator's OK to pay for a transcript
    if not (path/'moments.json').exists():
        if not shorts.setting('ANTHROPIC_API_KEY'):return 'Transcript ready · add ANTHROPIC_API_KEY to .env, or ask Claude Code to find the moments (python clipper.py find JOB)'
        status('Claude is reading the whole video for the best moments',None)
        clipper.find_auto(path,s['count'],s['length'],s['notes'],status=status)
    found=len(clipper.read(path,'moments.json')['moments'])
    if not s['auto']:return f"{found} moments found · choose the ones to make"
    return run_shorts(path,None,status)

@router.get('/clips/jobs')
def list_jobs():
    jobs=[summary(p) for p in clipper.RUNS.iterdir() if (p/'job.json').exists()] if clipper.RUNS.exists() else []
    return sorted(jobs,key=lambda j:-j['created'])

@router.post('/clips/jobs')
def create(url:str=Form(...),language:str=Form('am'),count:str=Form('auto'),length:str=Form('auto'),framing:str=Form('auto'),track_mode:str=Form('fast'),
           preset:str=Form('duo'),noise:str=Form('off'),client:str=Form(''),edit:bool=Form(True),auto:bool=Form(True),notes:str=Form('')):
    try:url=clipper.check_url(url)
    except ValueError as e:raise HTTPException(422,str(e))
    if language not in shorts.LANGUAGES:raise HTTPException(400,'Unknown language')
    if count!='auto' and not (count.isdigit() and 1<=int(count)<=12):raise HTTPException(400,'Ask for 1 to 12 shorts, or auto')
    if length not in clipper.LENGTHS:raise HTTPException(400,'Unknown length')
    if framing not in clipper.FRAMINGS:raise HTTPException(400,'Unknown framing')
    if track_mode not in shorts.TRACKING:raise HTTPException(400,'Unknown tracking setting')
    if preset not in shorts.PRESETS+['auto']:raise HTTPException(400,'Unknown caption style')
    if noise not in shorts.NOISE:raise HTTPException(400,'Unknown noise setting')
    if client and not clients.get(client):raise HTTPException(422,'No such client')
    path=clipper.RUNS/uuid.uuid4().hex;path.mkdir(parents=True)
    settings={'language':language,'count':count,'length':length,'framing':framing,'track':track_mode,'preset':preset,'noise':noise,
              'client':client or None,'edit':edit,'auto':auto,'notes':notes.strip()[:2000]}
    clipper.write(path,'job.json',{'url':url,'created':time.time(),'language':language,'settings':settings})
    clipper.write(path,'workflow-mode.json',{'mode':'clips','language':language})
    start(path,'fetch','Starting',lambda status:pipeline(path,status));return state(path.name)

@router.get('/clips/jobs/{ident}')
def get_job(ident:str):return state(ident)

@router.post('/clips/jobs/{ident}/transcribe')
def transcribe(ident:str):
    """The creator's OK to transcribe a video without captions with ElevenLabs (paid per minute); then carry on."""
    path=folder(ident)
    if not (path/'source.mp4').exists():raise HTTPException(409,'The video is not downloaded yet.')
    def work(status):
        clipper.transcribe(path,status,paid_ok=True);return pipeline(path,status)
    start(path,'transcribe','Transcribing',work);return state(ident)

@router.post('/clips/jobs/{ident}/continue')
def resume(ident:str):
    """Pick up where it stopped (an error, a cancel, a restart of the app)."""
    path=folder(ident);start(path,'fetch','Starting',lambda status:pipeline(path,status));return state(ident)

@router.post('/clips/jobs/{ident}/find')
def find(ident:str,count:str=Form('auto'),length:str=Form('auto'),notes:str=Form('')):
    """Ask Claude again (other instructions, another count or length). Shorts already made stay."""
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env, or ask Claude Code to find the moments.')
    if length not in clipper.LENGTHS:raise HTTPException(400,'Unknown length')
    def work(status):
        status('Claude is reading the whole video for the best moments',None)
        out=clipper.find_auto(path,count,length,notes,status=status);return f"{len(out['moments'])} moments found · choose the ones to make"
    start(path,'find','Finding moments',work);return state(ident)

@router.put('/clips/jobs/{ident}/moments')
def put_moments(ident:str,body:dict=Body(...)):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish.')
    try:clipper.save_moments(path,body,{**(clipper.read(path,'moments.json') or {}).get('settings',{}),'by':'creator'})
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(422,str(e))
    return state(ident)

@router.post('/clips/jobs/{ident}/make')
def make(ident:str,body:dict=Body(...)):
    """Make shorts from the chosen moments (numbers), with this job's settings plus any changed here."""
    path=folder(ident)
    if not (path/'moments.json').exists():raise HTTPException(409,'Find the moments first.')
    picks=[int(n) for n in body.get('moments') or []]
    if not picks:raise HTTPException(422,'Choose at least one moment.')
    job=clipper.read(path,'job.json');changed={k:body[k] for k in ['framing','track','preset','edit'] if k in body}
    if changed.get('framing',clipper.FRAMINGS[0]) not in clipper.FRAMINGS or changed.get('track','fast') not in shorts.TRACKING:raise HTTPException(400,'Unknown setting')
    job['settings']={**settings_of(path),**changed};clipper.write(path,'job.json',job)
    start(path,'make','Making your shorts',lambda status:run_shorts(path,set(picks),status));return state(ident)

@router.post('/clips/jobs/{ident}/cancel')
def cancel(ident:str):
    folder(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running for this video.')
    cancels[ident].set()
    for _ in range(60):
        if not busy(ident):break
        time.sleep(.05)
    return state(ident)

@router.delete('/clips/jobs/{ident}')
def delete(ident:str):
    """Remove the download and the moments. The shorts already made stay in Videos."""
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish before deleting.')
    shutil.rmtree(path);return {'deleted':ident}
