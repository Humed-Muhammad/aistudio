"""HTTP routes for the shorts editor (mounted by app.py)."""
from pathlib import Path
import threading,uuid,shutil,json,re
from fastapi import APIRouter,UploadFile,File,Form,HTTPException,Body
from fastapi.responses import FileResponse
from pydantic import ValidationError
import shorts
ROOT=Path(__file__).resolve().parent;RUNS=ROOT/'runs'
router=APIRouter();active={};lock=threading.Lock()
IMAGES=['.png','.jpg','.jpeg','.webp','.gif']

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=RUNS/ident
    if not (path/'upload.mp4').exists():raise HTTPException(404)
    return path

def start(path,state,message,work):
    """One background task per job; status is persisted so the page survives reloads."""
    with lock:
        if active.get(path.name) and active[path.name].is_alive():raise HTTPException(409,'This job is still busy.')
        shorts.save_status(path,state,message)
        def run():
            try:shorts.save_status(path,'done',work(lambda m:shorts.save_status(path,state,m)) or 'Done')
            except Exception as e:shorts.save_status(path,'error',str(e))
        active[path.name]=threading.Thread(target=run,daemon=True);active[path.name].start()

@router.get('/shorts')
def page():return FileResponse(ROOT/'static/shorts.html')

@router.post('/shorts/jobs')
def create(video:UploadFile=File(...),preset:str=Form('bold')):
    if preset not in shorts.PRESETS+['auto']:raise HTTPException(400,'Unknown caption style')
    path=RUNS/uuid.uuid4().hex;path.mkdir(parents=True)
    with (path/'upload.mp4').open('wb') as out:shutil.copyfileobj(video.file,out)
    def work(status):
        shorts.prepare(path/'upload.mp4',path,preset,status);return 'Ready · choose what to keep'
    start(path,'preparing','Starting',work);return state(path.name)

@router.get('/shorts/jobs/{ident}')
def state(ident:str):
    path=folder(ident);saved=json.loads(shorts.status_file(path).read_text()) if shorts.status_file(path).exists() else {'state':'idle','status':''}
    if saved['state'] not in ['done','error','idle'] and not (active.get(ident) and active[ident].is_alive()):
        saved=shorts.save_status(path,'error','Interrupted (server restarted). Run that step again.')
    read=lambda name,default=None:json.loads((path/name).read_text()) if (path/name).exists() else default
    tracks=read('tracks.json');captions=read('captions.json',{})
    files=[n for n in ['source.mp4','tracking-preview.mp4','shorts-draft.mp4','shorts-final.mp4'] if (path/n).exists()]
    cut=read('cut.json')
    try:summary=shorts.cut_summary(path) if cut else None
    except (OSError,ValueError,KeyError):summary=None
    return {**saved,'id':ident,'manifest':read('manifest.json'),'plan':read('plan.json'),'warnings':read('plan-warnings.json',[]),
     'assets':sorted(p.name for p in (path/'assets').iterdir() if p.suffix.lower() in IMAGES) if (path/'assets').exists() else [],
     'files':{n:(path/n).stat().st_mtime for n in files},
     'units':[{k:u[k] for k in ['id','start','end','text']} for u in read('units.json',[])],'cut':cut,'cut_summary':summary,
     'tracking':{'frames':tracks['frames'],'cuts':len(tracks['cuts']),'face':sum(map(bool,tracks['face'])),
       'left':sum(map(bool,tracks['hands']['left'])),'right':sum(map(bool,tracks['hands']['right']))} if tracks else None,
     'transcript':{'language':captions.get('language'),'text':''.join(c['text'] for c in captions.get('captions',[])).strip()}}

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

@router.put('/shorts/jobs/{ident}/plan')
def put_plan(ident:str,plan:dict=Body(...)):
    path=folder(ident)
    if not (path/'tracks.json').exists():raise HTTPException(409,'Prepare the video first.')
    try:shorts.save_plan(path,plan)
    except ValidationError as e:raise HTTPException(422,'; '.join(f"{'.'.join(map(str,x['loc']))}: {x['msg']}" for x in e.errors()[:6]))
    return state(ident)

@router.post('/shorts/jobs/{ident}/plan/auto')
def auto_plan(ident:str,notes:str=Form('')):
    path=folder(ident)
    if not (path/'tracks.json').exists():raise HTTPException(409,'Prepare the video first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env to use the automatic planner, or ask Claude Code to write the plan.')
    def work(status):
        status('Claude is planning your edit…');plan,warnings=shorts.plan_auto(path,notes)
        return f'Plan ready · {len(plan.events)} graphics'+(f' · {len(warnings)} warnings' if warnings else '')
    start(path,'planning','Planning',work);return state(ident)

@router.post('/shorts/jobs/{ident}/render')
def render(ident:str,final:bool=Form(False)):
    path=folder(ident)
    if not (path/'plan.json').exists():raise HTTPException(409,'Create or save a plan first.')
    def work(status):
        out,_=shorts.render(path,final,status);return ('Final 1080p ready' if final else 'Draft ready')+' · original audio kept'
    start(path,'rendering','Starting render',work);return state(ident)

@router.put('/shorts/jobs/{ident}/cut')
def put_cut(ident:str,cut:dict=Body(...)):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Transcribe the video first.')
    try:shorts.save_cut(path,cut)
    except ValidationError as e:raise HTTPException(422,'; '.join(f"{'.'.join(map(str,x['loc']))}: {x['msg']}" for x in e.errors()[:6]))
    except ValueError as e:raise HTTPException(422,str(e))
    return state(ident)

@router.post('/shorts/jobs/{ident}/cut/auto')
def auto_cut(ident:str,notes:str=Form('')):
    path=folder(ident)
    if not (path/'units.json').exists():raise HTTPException(409,'Transcribe the video first.')
    if not shorts.setting('ANTHROPIC_API_KEY'):raise HTTPException(400,'Set ANTHROPIC_API_KEY in .env for the automatic cut, or ask Claude Code to choose the parts.')
    def work(status):
        status('Claude is reading your transcript and choosing what matters…');cut=shorts.cut_auto(path,notes)
        summary=shorts.cut_summary(path)
        return f"Cut suggested · {summary['kept']:.0f}s of {summary['original']:.0f}s · review, then apply"
    start(path,'cutting','Cutting',work);return state(ident)

@router.post('/shorts/jobs/{ident}/cut/apply')
def apply_cut(ident:str):
    path=folder(ident)
    if not (path/'cut.json').exists():raise HTTPException(409,'Transcribe the video first.')
    def work(status):
        shorts.apply_cut(path,status);return 'Cut ready · review tracking, then plan graphics'
    start(path,'preparing','Applying cut',work);return state(ident)
