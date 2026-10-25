"""HTTP routes for Motion Studio films (mounted by app.py). The editor lives in the studio app (/shorts?view=films).
Each film has two task slots: Claude (make, chat) and render. A render works from a snapshot (film-props.json), so the
creator can keep editing and chatting while it runs; editing waits only while Claude is changing the film."""
from pathlib import Path
import json,shutil,tempfile,threading,time
from fastapi import APIRouter,Body,File,Form,HTTPException,UploadFile
from fastapi.responses import FileResponse,RedirectResponse
import films,graphics,shorts

router=APIRouter();lock=threading.Lock()
tasks={}  # (film id, slot) -> (thread, stop event)
SLOTS={'claude':'status.json','render':'render-status.json'}

def folder(ident):
    try:return films.job_folder(ident)
    except ValueError:raise HTTPException(404,'No such film.')

def busy(ident,slot):
    t=tasks.get((ident,slot));return bool(t and t[0].is_alive())

def save_status(path,slot,state,message,**extra):
    data={'state':state,'status':message,**extra};tmp=path/(SLOTS[slot]+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.replace(path/SLOTS[slot]);return data

def status_of(path,slot):
    saved=films.read(path,SLOTS[slot],{'state':'idle','status':''})
    if saved.get('state')=='running' and not busy(path.name,slot):
        saved=save_status(path,slot,'error','Interrupted because the app was restarted. Try again.',action=saved.get('action'))
    return saved

def start(path,slot,action,message,work,**extra):
    """One background task per slot; progress and the result are kept in the slot's status file for reloads."""
    with lock:
        if busy(path.name,slot):raise HTTPException(409,'Claude is still working on this film.' if slot=='claude' else 'A render is already running.')
        started=time.time();info={'action':action,**extra};save_status(path,slot,'running',message,progress=None,started=started,**info);stop=threading.Event()
        def status(m,p=None):  # every progress update is also a place where Cancel takes effect
            if stop.is_set():raise shorts.Cancelled()
            save_status(path,slot,'running',m,progress=p,started=started,**info)
        status.cancelled=stop
        def run():
            try:save_status(path,slot,'done',work(status) or 'Done',started=started,finished=time.time(),**info)
            except Exception as e:
                if stop.is_set():save_status(path,slot,'cancelled','Stopped. Nothing else changed.',finished=time.time(),**info)
                else:save_status(path,slot,'error',str(e),started=started,finished=time.time(),**info)
        tasks[(path.name,slot)]=(threading.Thread(target=run,daemon=True),stop);tasks[(path.name,slot)][0].start()

def mtime(path,name):
    p=path/name;return p.stat().st_mtime if p.exists() else None

def stage(path):
    for name,label in [('renders/final.mp4','Final ready'),('renders/draft.mp4','Draft ready')]:
        if (path/name).exists():return label
    return 'Draft' if films.load(path).get('scenes') else 'New'

def summary(path):
    job=films.read(path,'job.json') or {};film=films.load(path);claude=status_of(path,'claude');render=status_of(path,'render')
    running=claude if claude.get('state')=='running' else render if render.get('state')=='running' else claude
    thumb=f'/runs/films/{path.name}/thumb.jpg?v={int(mtime(path,"thumb.jpg"))}' if (path/'thumb.jpg').exists() else None
    return {'id':path.name,'title':job.get('title') or film.get('title') or 'Untitled film','created':job.get('created',0),'client':job.get('client'),
            'format':film.get('format','portrait'),'scenes':len(film.get('scenes',[])),'duration':films.film_frames(films.check_film(film,path)[0])/films.FPS if film.get('scenes') else 0,
            'stage':stage(path),'thumb':thumb,'state':running.get('state','idle'),'action':running.get('action'),'progress':running.get('progress'),
            'status':running.get('status',''),'updated':max(filter(None,[mtime(path,'film.json'),mtime(path,'job.json')]),default=0),'delivery':job.get('delivery','')}

def state(path):
    film=films.load(path);job=films.read(path,'job.json') or {}
    spec=(path/'spec.md').read_text() if (path/'spec.md').exists() else ''
    renders={n[:-4]:mtime(path,f'renders/{n}') for n in ('draft.mp4','final.mp4') if (path/'renders'/n).exists()}
    runs=films.read(path,'claude-runs.json',[])
    return {**summary(path),'job':job,'film':film,'warnings':films.read(path,'film-warnings.json',[]),'spec':spec,'assets':films.assets(path),
            'renders':renders,'edited':mtime(path,'film.json'),'claude':status_of(path,'claude'),'render':status_of(path,'render'),
            'can_undo':any(r.get('backup') and not r.get('undone') for r in runs),'runs':runs[-10:]}

def saved_upload(file,tmp):
    src=Path(tmp)/(Path(file.filename or 'upload').name)
    with src.open('wb') as out:shutil.copyfileobj(file.file,out)
    return src

def use_asset(path,rel,role):
    """Put an uploaded file to work: the brand logo, the music bed or the voice-over (images otherwise just wait in assets/)."""
    film=films.load(path)
    if role=='logo':film['brand']={**film.get('brand',{}),'logo':rel}
    elif role in ('music','voice'):film['sound']={**film.get('sound',{}),role:rel}
    else:return
    films.save(path,film)

def editable(path):
    if busy(path.name,'claude'):raise HTTPException(409,'Claude is changing this film right now. Wait a moment, or stop it.')

@router.get('/motion')
def page():return RedirectResponse('/shorts?view=films')

@router.get('/motion/setup')
def setup():
    return {'claude':bool(graphics.claude_bin()),'models':films.MODELS,'formats':{k:list(v) for k,v in films.FORMATS.items()},'styles':films.STYLES,
            'backdrops':films.BACKDROPS,'transitions':list(films.TRANSITIONS),'cameras':films.CAMERAS,'palette':shorts.PALETTE}

@router.get('/motion/scenes')
def scenes():return films.catalog()

@router.get('/motion/starters')
def starters():return films.starters()

@router.get('/motion/films')
def list_films():
    if not films.RUNS.exists():return []
    out=[summary(p) for p in films.RUNS.iterdir() if (p/'job.json').exists()]
    return sorted(out,key=lambda j:-j['created'])

@router.post('/motion/films')
def create(title:str=Form(''),format:str=Form('portrait'),starter:str=Form(''),client:str=Form(''),request:str=Form(''),language:str=Form('en'),
           model:str=Form('sonnet'),make:bool=Form(False),logo:UploadFile|None=File(None),music:UploadFile|None=File(None),
           voice:UploadFile|None=File(None),images:list[UploadFile]=File([])):
    if make and len(request.strip())<8:raise HTTPException(400,'Describe the film in a sentence or two, or start from a starter film.')
    if make and model not in films.MODELS:raise HTTPException(400,'Unknown model.')
    try:
        path=films.create(title,format,starter or None,client or None,request,language)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                for role,f in (('logo',logo),('music',music),('voice',voice)):
                    if f and f.filename:use_asset(path,films.add_asset(path,saved_upload(f,tmp),f.filename),role)
                for f in images:
                    if f.filename:films.add_asset(path,saved_upload(f,tmp),f.filename)
        except Exception:shutil.rmtree(path);raise
    except ValueError as e:raise HTTPException(400,str(e))
    if make:start(path,'claude','make','Claude is planning your film',lambda status:(films.make(path,request,model,status),'Your film is ready. Watch it, then tell Claude what to change.')[1],model=model)
    return state(path)

@router.get('/motion/films/{ident}')
def get(ident:str):return state(folder(ident))

@router.patch('/motion/films/{ident}')
def patch(ident:str,body:dict=Body(...)):
    path=folder(ident);job=films.read(path,'job.json') or {}
    if 'title' in body:
        job['title']=str(body['title']).strip()[:80] or job.get('title','Untitled film')
        film=films.load(path);film['title']=job['title'];films.save(path,film)
    if 'client' in body:job['client']=body['client'] or None
    if 'delivery' in body and body['delivery'] in ('','sent','delivered'):job['delivery']=body['delivery']
    films.write(path,'job.json',job);return state(path)

@router.delete('/motion/films/{ident}')
def delete(ident:str):
    path=folder(ident)
    if busy(ident,'claude') or busy(ident,'render'):raise HTTPException(409,'Stop what is running first.')
    shutil.rmtree(path);return {'deleted':ident}

@router.put('/motion/films/{ident}/film')
def put_film(ident:str,film:dict=Body(...)):
    path=folder(ident);editable(path);films.save(path,film);return state(path)

@router.put('/motion/films/{ident}/spec')
def put_spec(ident:str,body:dict=Body(...)):
    path=folder(ident);editable(path);(path/'spec.md').write_text(str(body.get('spec',''))[:60000]);return state(path)

@router.get('/motion/films/{ident}/props')
def get_props(ident:str):
    path=folder(ident);data,_=films.props(path,f'/runs/films/{ident}/');return data

@router.post('/motion/films/{ident}/assets')
def add_assets(ident:str,role:str=Form('image'),files:list[UploadFile]=File(...)):
    path=folder(ident);editable(path)
    if role not in ('image','logo','music','voice'):raise HTTPException(400,'Unknown file role.')
    with tempfile.TemporaryDirectory() as tmp:
        try:
            for f in files:use_asset(path,films.add_asset(path,saved_upload(f,tmp),f.filename),role)
        except ValueError as e:raise HTTPException(400,str(e))
    return state(path)

@router.delete('/motion/films/{ident}/assets/{name}')
def remove_asset(ident:str,name:str):
    path=folder(ident);editable(path)
    try:films.remove_asset(path,name)
    except ValueError as e:raise HTTPException(404,str(e))
    return state(path)

@router.post('/motion/films/{ident}/make')
def make(ident:str,body:dict=Body(...)):
    """Claude Code directs the film from the creator's words (spec, then film, then review stills). Plan usage, not an API key."""
    path=folder(ident);request=str(body.get('request','')).strip();model=str(body.get('model','sonnet'))
    if len(request)<8:raise HTTPException(400,'Describe the film in a sentence or two.')
    if model not in films.MODELS:raise HTTPException(400,'Unknown model.')
    start(path,'claude','make','Claude is planning your film',lambda status:(films.make(path,request,model,status),'Your film is ready. Watch it, then tell Claude what to change.')[1],model=model)
    return state(path)

@router.post('/motion/films/{ident}/render')
def render(ident:str,body:dict=Body({})):
    path=folder(ident);final=bool(body.get('final'))
    if not films.load(path).get('scenes'):raise HTTPException(400,'Add a scene first.')
    start(path,'render','render','Rendering the final film' if final else 'Rendering a quick draft',
          lambda status:f"{'Final' if final else 'Draft'} ready ({films.render(path,final,status)[0].name})",final=final)
    return state(path)

@router.post('/motion/films/{ident}/cancel')
def cancel(ident:str,body:dict=Body({})):
    path=folder(ident);slot=body.get('slot','claude')
    if slot not in SLOTS or not busy(ident,slot):raise HTTPException(409,'Nothing is running.')
    tasks[(ident,slot)][1].set()
    for _ in range(50):
        if not busy(ident,slot):break
        time.sleep(.1)
    return state(path)

@router.post('/motion/films/{ident}/undo')
def undo(ident:str):
    path=folder(ident);editable(path)
    try:films.undo(path)
    except ValueError as e:raise HTTPException(409,str(e))
    return state(path)

def chat_state(path):
    chat=films.read(path,'chat.json',{'messages':[]})
    return {'messages':chat.get('messages',[]),'claude':bool(graphics.claude_bin()),'status':status_of(path,'claude'),'film':state(path)}

@router.get('/motion/films/{ident}/chat')
def get_chat(ident:str):return chat_state(folder(ident))

@router.post('/motion/films/{ident}/chat')
def post_chat(ident:str,body:dict=Body(...)):
    """One chat message: Claude Code edits film.json in place (the preview follows the file) and answers."""
    path=folder(ident);text=str(body.get('message','')).strip();model=str(body.get('model','sonnet'))
    if not text:raise HTTPException(400,'Write what you want changed.')
    if model not in films.MODELS:raise HTTPException(400,'Unknown model.')
    start(path,'claude','chat','Claude is reading your message',lambda status:(films.send(path,text,model,status),'Done')[1],model=model,message=text[:300])
    return chat_state(path)

@router.delete('/motion/films/{ident}/chat')
def clear_chat(ident:str):
    path=folder(ident);editable(path);films.clear_chat(path);return chat_state(path)

@router.get('/motion/films/{ident}/files/{name}')
def download(ident:str,name:str,download:bool=False):
    path=folder(ident)
    if name not in ('draft.mp4','final.mp4'):raise HTTPException(404)
    target=path/'renders'/name
    if not target.is_file():raise HTTPException(404)
    title=(films.read(path,'job.json') or {}).get('title','film')
    return FileResponse(target,filename=f'{title}-{name}',content_disposition_type='attachment' if download else 'inline')
