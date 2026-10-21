"""HTTP routes for the motion graphics workflow (mounted by app.py)."""
from pathlib import Path
import threading,shutil,json,time,tempfile
from fastapi import APIRouter,UploadFile,File,Form,HTTPException,Body
from fastapi.responses import FileResponse
import graphics,shorts
ROOT=Path(__file__).resolve().parent
router=APIRouter();active={};cancels={};lock=threading.Lock()

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=graphics.RUNS/ident
    if not (path/'job.json').exists():raise HTTPException(404)
    return path

def busy(ident):return bool(active.get(ident) and active[ident].is_alive())

def save_status(path,state,message,**extra):
    data={'state':state,'status':message,**extra};tmp=path/'status.tmp'
    tmp.write_text(json.dumps(data));tmp.replace(path/'status.json');return data

def status_of(path):
    saved=graphics.read(path,'status.json',{'state':'idle','status':''})
    if saved['state']=='running' and not busy(path.name):
        saved=save_status(path,'error','Interrupted because the app was restarted. Try again.',action=saved.get('action'))
    return saved

def stage(path):
    for done,label in [((path/'renders/final.mp4').exists(),'Final ready'),((path/'renders/draft.mp4').exists(),'Draft ready'),
                       ((path/'brief.json').exists(),'Brief written')]:
        if done:return label
    return 'New'

def state(path):
    job=graphics.read(path,'job.json');brief=graphics.read(path,'brief.json')
    try:content=graphics.content(path);problem=None
    except ValueError as e:content=[];problem=str(e)
    edited=(path/'index.html').stat().st_mtime  # compared with render times: "changed since the last render"
    renders={o['file'].split('/')[-1][:-4]:(path/o['file']).stat().st_mtime for o in graphics.outputs(path)}
    return {'id':path.name,**job,**status_of(path),'stage':stage(path),'content':content,'content_problem':problem,'brief':brief,
            'images':graphics.images(path),'music':graphics.music(path),'duration':graphics.duration(path),'outputs':graphics.outputs(path),
            'edited':edited,'renders':renders,'prompt':graphics.prompt(path) if brief else None,'runs':graphics.claude_runs(path),'path':str(graphics.shown(path))}

def start(path,action,message,work,**extra):
    """One background task per project; progress and the result are persisted for reloads."""
    with lock:
        if busy(path.name):raise HTTPException(409,'This project is still busy. Wait for the current step to finish.')
        started=time.time();info={'action':action,**extra};save_status(path,'running',message,progress=None,started=started,**info);stop=threading.Event()
        def status(m,p=None):  # every progress update is also a place where Cancel takes effect
            if stop.is_set():raise shorts.Cancelled()
            save_status(path,'running',m,progress=p,started=started,**info)
        status.cancelled=stop
        def run():
            try:save_status(path,'done',work(status) or 'Done',started=started,finished=time.time(),**info)
            except Exception as e:
                if stop.is_set():save_status(path,'cancelled','Stopped. Start again whenever you like.',finished=time.time(),**info)
                else:save_status(path,'error',str(e),started=started,finished=time.time(),**info)
        cancels[path.name]=stop;active[path.name]=threading.Thread(target=run,daemon=True);active[path.name].start()

def saved_upload(file,tmp):
    src=Path(tmp)/(Path(file.filename or 'upload').name)
    with src.open('wb') as out:shutil.copyfileobj(file.file,out)
    return src

@router.get('/graphics')
def page():return FileResponse(ROOT/'static/graphics.html')

@router.get('/graphics/setup')
def setup():
    return {'ready':graphics.HF.exists(),'skills':(ROOT/'.claude/skills/hyperframes').exists(),'claude':bool(graphics.claude_bin()),'models':graphics.MODELS}

@router.get('/graphics/jobs')
def list_jobs():
    if not graphics.RUNS.exists():return []
    jobs=[]
    for p in graphics.RUNS.iterdir():
        job=graphics.read(p,'job.json')
        if job:
            s=status_of(p);thumb=f'/runs/graphics/{p.name}/thumb.jpg?v={int((p/"thumb.jpg").stat().st_mtime)}' if (p/'thumb.jpg').exists() else None
            jobs.append({'id':p.name,'title':job['title'],'created':job['created'],'size':job['size'],'stage':stage(p),'thumb':thumb,'state':s['state'],'progress':s.get('progress'),'status':s.get('status','')})
    return sorted(jobs,key=lambda j:-j['created'])

@router.post('/graphics/jobs')
def create(title:str=Form(''),size:str=Form('portrait'),images:list[UploadFile]=File([]),music:UploadFile|None=File(None)):
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path=graphics.create(title,size)
            try:
                for f in images:graphics.add_image(path,saved_upload(f,tmp),f.filename)
                if music and music.filename:graphics.add_music(path,saved_upload(music,tmp),music.filename)
            except Exception:shutil.rmtree(path);raise
    except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.get('/graphics/jobs/{ident}')
def get(ident:str):return state(folder(ident))

@router.post('/graphics/jobs/{ident}/images')
def add_images(ident:str,images:list[UploadFile]=File(...)):
    path=folder(ident)
    with tempfile.TemporaryDirectory() as tmp:
        try:
            for f in images:graphics.add_image(path,saved_upload(f,tmp),f.filename)
        except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.post('/graphics/jobs/{ident}/music')
def set_music(ident:str,music:UploadFile=File(...)):
    path=folder(ident)
    with tempfile.TemporaryDirectory() as tmp:
        try:graphics.add_music(path,saved_upload(music,tmp),music.filename)
        except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.delete('/graphics/jobs/{ident}/music')
def remove_music(ident:str):
    path=folder(ident);graphics.remove_music(path);return state(path)

@router.put('/graphics/jobs/{ident}/content')
def put_content(ident:str,values:dict=Body(...)):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Wait for the render to finish before changing the content.')
    try:graphics.set_content(path,values)
    except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.put('/graphics/jobs/{ident}/brief')
def put_brief(ident:str,brief:dict=Body(...)):
    path=folder(ident)
    try:graphics.save_brief(path,brief,brief.get('request'))
    except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.post('/graphics/jobs/{ident}/draft-brief')
def draft_brief(ident:str,body:dict=Body(...)):
    """Claude Code drafts the 4-part brief from the creator's own words (runs on their Claude plan)."""
    path=folder(ident);request=str(body.get('request','')).strip()
    if len(request)<8:raise HTTPException(400,'Describe what you want in a sentence or two first.')
    start(path,'brief','Claude is drafting the brief',lambda status:(graphics.draft_brief(path,request,status),'Brief and content drafted. Read them, change anything, then render or build.')[1])
    return state(path)

@router.post('/graphics/jobs/{ident}/build')
def build(ident:str,body:dict=Body({})):
    """Claude Code writes the animation from the saved brief, reviews its frames and renders a draft."""
    path=folder(ident);model=body.get('model','sonnet')
    if model not in graphics.MODELS:raise HTTPException(400,'Unknown model.')
    brief=graphics.read(path,'brief.json')
    if not brief:raise HTTPException(400,'Save the 4-part brief first.')
    if graphics.placeholders(brief):raise HTTPException(400,'Fill in the brief first: '+', '.join(graphics.placeholders(brief)))
    if graphics.content_gaps(path):raise HTTPException(400,'Fill in these content fields first: '+', '.join(graphics.content_gaps(path)))
    start(path,'build','Claude Code is starting',lambda status:(graphics.build(path,model,status),'Built by Claude Code and rendered a draft.')[1],model=model)
    return state(path)

@router.post('/graphics/jobs/{ident}/change')
def change(ident:str,body:dict=Body(...)):
    """A targeted change to the existing animation; Claude edits only that part and reviews the moments it touched."""
    path=folder(ident);request=str(body.get('request','')).strip();model=body.get('model','sonnet')
    if model not in graphics.MODELS:raise HTTPException(400,'Unknown model.')
    if len(request)<4:raise HTTPException(400,'Describe the change in a few words first.')
    start(path,'change','Claude Code is starting',lambda status:(graphics.revise(path,request,model,status),'Change made and a new draft rendered.')[1],model=model,request=request[:300])
    return state(path)

@router.post('/graphics/jobs/{ident}/undo-build')
def undo_build(ident:str):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Wait for the current step to finish.')
    try:graphics.undo_build(path)
    except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.post('/graphics/jobs/{ident}/render')
def render(ident:str,final:bool=False):
    path=folder(ident)
    start(path,'render','Rendering the final video' if final else 'Rendering a quick draft',
          lambda status:f"{'Final' if final else 'Draft'} ready: {graphics.render(path,final,status).name}",final=final)
    return state(path)

@router.post('/graphics/jobs/{ident}/preview')
def preview(ident:str):
    """Opens HyperFrames Studio on this Mac to scrub through the composition."""
    try:return {'url':graphics.preview(folder(ident))}
    except (ValueError,RuntimeError) as e:raise HTTPException(400,str(e))

@router.post('/graphics/jobs/{ident}/cancel')
def cancel(ident:str):
    path=folder(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running for this project.')
    cancels[ident].set();return state(path)

@router.delete('/graphics/jobs/{ident}')
def delete(ident:str):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Cancel the render before deleting.')
    shutil.rmtree(path);return {'deleted':ident}

@router.get('/graphics/jobs/{ident}/files/{kind}/{name}')
def download(ident:str,kind:str,name:str,download:bool=False):
    """Renders and uploaded assets; inline for the players, as a named attachment for Download links."""
    path=folder(ident)
    if kind not in ('renders','assets') or '/' in name or name.startswith('.'):raise HTTPException(404)
    target=path/kind/name
    if not target.is_file():raise HTTPException(404)
    nice=f"{graphics.read(path,'job.json')['title']}-{name}" if kind=='renders' else name
    return FileResponse(target,filename=nice,content_disposition_type='attachment' if download else 'inline')
