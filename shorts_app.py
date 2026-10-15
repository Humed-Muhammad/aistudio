"""HTTP routes for the shorts editor (mounted by app.py)."""
from pathlib import Path
import threading,uuid,shutil,json,re,time
from fastapi import APIRouter,UploadFile,File,Form,HTTPException,Body
from fastapi.responses import FileResponse
from pydantic import ValidationError
import shorts
ROOT=Path(__file__).resolve().parent;RUNS=ROOT/'runs'
router=APIRouter();active={};lock=threading.Lock()
IMAGES=['.png','.jpg','.jpeg','.webp','.gif']
# What each background action is called in the UI, and how to retry it.
ACTIONS={'transcribe':'Transcribing','autocut':'Auto-cut','apply':'Building your edit','plan':'Auto-plan','render':'Rendering'}

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=RUNS/ident
    if not (path/'upload.mp4').exists():raise HTTPException(404)
    return path

def read(path,name,default=None):
    try:return json.loads((path/name).read_text())
    except (OSError,ValueError):return default

def busy(ident):return bool(active.get(ident) and active[ident].is_alive())

def start(path,action,message,work,**extra):
    """One background task per job. Status (action, progress, start time) is persisted for reloads."""
    with lock:
        if busy(path.name):raise HTTPException(409,'This video is still busy. Wait for the current step to finish.')
        started=time.time();info={'action':action,'started':started,**extra}
        shorts.save_status(path,'running',message,progress=None,**info)
        def run():
            try:shorts.save_status(path,'done',work(lambda m,p=None:shorts.save_status(path,'running',m,progress=p,**info)) or 'Done',finished=time.time(),**info)
            except Exception as e:shorts.save_status(path,'error',str(e),finished=time.time(),**info)
        active[path.name]=threading.Thread(target=run,daemon=True);active[path.name].start()

def status_of(path):
    saved=read(path,'status.json',{'state':'idle','status':''})
    if saved['state'] not in ['done','error','idle'] and not busy(path.name):
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

def summary(path):
    s=status_of(path);info=read(path,'manifest.json') or read(path,'source-info.json') or {}
    thumb=next((f'/runs/{path.name}/{n}' for n in ['thumb.jpg','keyframes/0000.00.jpg'] if (path/n).exists()),None)
    return {'id':path.name,**meta(path),'duration':info.get('duration'),'stage':stage(path),'thumb':thumb,
            'state':s['state'],'action':s.get('action'),'progress':s.get('progress'),'status':s.get('status','')}

@router.get('/shorts')
def page():return FileResponse(ROOT/'static/shorts.html')

@router.get('/shorts/jobs')
def list_jobs():
    jobs=[summary(p) for p in RUNS.iterdir() if p.is_dir() and (read(p,'workflow-mode.json') or {}).get('mode')=='shorts' and (p/'upload.mp4').exists()]
    return sorted(jobs,key=lambda j:-j['created'])

@router.post('/shorts/jobs')
def create(video:UploadFile=File(...),preset:str=Form('bold'),title:str=Form('')):
    if preset not in shorts.PRESETS+['auto']:raise HTTPException(400,'Unknown caption style')
    path=RUNS/uuid.uuid4().hex;path.mkdir(parents=True)
    with (path/'upload.mp4').open('wb') as out:shutil.copyfileobj(video.file,out)
    name=title.strip() or re.sub(r'[_-]+',' ',Path(video.filename or '').stem).strip() or 'Untitled video'
    (path/'job.json').write_text(json.dumps({'title':name[:80],'created':time.time()}))
    (path/'workflow-mode.json').write_text(json.dumps({'mode':'shorts','preset':preset}))
    transcribe(path.name);return state(path.name)

@router.post('/shorts/jobs/{ident}/transcribe')
def transcribe(ident:str):
    path=folder(ident);preset=(read(path,'workflow-mode.json') or {}).get('preset','bold')
    def work(status):
        shorts.prepare(path/'upload.mp4',path,preset,status);return 'Transcript ready · choose what to keep'
    start(path,'transcribe','Starting',work);return state(ident)

@router.patch('/shorts/jobs/{ident}')
def rename(ident:str,body:dict=Body(...)):
    path=folder(ident);title=str(body.get('title','')).strip()[:80]
    if not title:raise HTTPException(422,'Give the video a name.')
    (path/'job.json').write_text(json.dumps({**meta(path),'title':title}));return state(ident)

@router.delete('/shorts/jobs/{ident}')
def delete(ident:str):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish before deleting.')
    shutil.rmtree(path);return {'deleted':ident}

@router.get('/shorts/jobs/{ident}')
def state(ident:str):
    path=folder(ident);tracks=read(path,'tracks.json');captions=read(path,'captions.json',{});cut=read(path,'cut.json')
    files=[n for n in ['source.mp4','tracking-preview.mp4','shorts-draft.mp4','shorts-final.mp4'] if (path/n).exists()]
    try:cut_summary=shorts.cut_summary(path) if cut else None
    except (OSError,ValueError,KeyError):cut_summary=None
    return {**status_of(path),**summary(path),'id':ident,'manifest':read(path,'manifest.json'),'plan':read(path,'plan.json'),'warnings':read(path,'plan-warnings.json',[]),
     'assets':sorted(p.name for p in (path/'assets').iterdir() if p.suffix.lower() in IMAGES) if (path/'assets').exists() else [],
     'files':{n:(path/n).stat().st_mtime for n in files},
     'units':[{k:u[k] for k in ['id','start','end','text']} for u in read(path,'units.json',[])],'cut':cut,'cut_summary':cut_summary,
     'tracking':{'frames':tracks['frames'],'cuts':len(tracks['cuts']),'face':sum(map(bool,tracks['face'])),
       'left':sum(map(bool,tracks['hands']['left'])),'right':sum(map(bool,tracks['hands']['right']))} if tracks else None,
     'transcript':{'language':captions.get('language'),'text':''.join(c['text'] for c in captions.get('captions',[])).strip()},
     'cut_mtime':(path/'cut.json').stat().st_mtime if cut else None,'planner_available':bool(shorts.setting('ANTHROPIC_API_KEY'))}

@router.post('/shorts/jobs/{ident}/assets')
def add_assets(ident:str,images:list[UploadFile]=File(...)):
    path=folder(ident)/'assets';path.mkdir(exist_ok=True)
    for image in images:
        name=Path(image.filename or 'image.png');ext=name.suffix.lower()
        if ext not in IMAGES:raise HTTPException(400,f'{name.name}: use PNG, JPG, WebP or GIF (transparent PNG looks best).')
        stem=re.sub(r'[^a-z0-9_-]+','-',name.stem.lower()).strip('-') or 'image'
        with (path/(stem+ext)).open('wb') as out:shutil.copyfileobj(image.file,out)
    return state(ident)

@router.delete('/shorts/jobs/{ident}/assets/{name}')
def remove_asset(ident:str,name:str):
    path=folder(ident)/'assets'/Path(name).name
    if path.suffix.lower() in IMAGES:path.unlink(missing_ok=True)
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
        status('Claude is watching your edit and planning graphics…');plan,warnings=shorts.plan_auto(path,notes)
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

@router.post('/shorts/jobs/{ident}/cut/auto')
def auto_cut(ident:str,notes:str=Form('')):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env for the automatic cut, or ask Claude Code to choose the parts.')
    def work(status):
        status('Claude is reading your transcript and choosing what matters…');shorts.cut_auto(path,notes)
        s=shorts.cut_summary(path);return f"Suggested cut: {s['kept']:.0f}s of {s['original']:.0f}s · check it, then build your edit"
    start(path,'autocut','Auto-cut',work);return state(ident)

@router.post('/shorts/jobs/{ident}/cut/apply')
def apply_cut(ident:str):
    path=folder(ident)
    if not (path/'cut.json').exists():raise HTTPException(409,'Wait for the transcript first.')
    def work(status):
        shorts.apply_cut(path,status);return 'Your edit is ready to review'
    start(path,'apply','Building your edit',work);return state(ident)
