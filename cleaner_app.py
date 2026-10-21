"""HTTP routes for the audio cleaner and transcriber (mounted by app.py)."""
from pathlib import Path
import threading,shutil,json,time,tempfile
from fastapi import APIRouter,UploadFile,File,Form,HTTPException
from fastapi.responses import FileResponse
import cleaner,shorts
ROOT=Path(__file__).resolve().parent
router=APIRouter();active={};cancels={};lock=threading.Lock()

def folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise HTTPException(404)
    path=cleaner.RUNS/ident
    if not (path/'job.json').exists():raise HTTPException(404)
    return path

def busy(ident):return bool(active.get(ident) and active[ident].is_alive())

def save_status(path,state,message,**extra):
    data={'state':state,'status':message,**extra};tmp=path/'status.tmp'
    tmp.write_text(json.dumps(data));tmp.replace(path/'status.json');return data

def status_of(path):
    saved=cleaner.read(path,'status.json',{'state':'idle','status':''})
    if saved['state']=='running' and not busy(path.name):
        saved=save_status(path,'error','Interrupted because the app was restarted. Try again.')
    return saved

def state(path):
    job=cleaner.read(path,'job.json');data=cleaner.read(path,'transcript.json') or {};words=data.get('captions')
    text=(path/'transcript.txt').read_text() if (path/'transcript.txt').exists() else None
    return {'id':path.name,**job,**status_of(path),'outputs':cleaner.outputs(path),'text':text,'words':len(words) if words is not None else None,'detected':data.get('language')}

def run(path):
    """Clean and/or transcribe in the background; progress and the result are persisted for reloads."""
    with lock:
        if busy(path.name):raise HTTPException(409,'This recording is still being processed.')
        started=time.time();save_status(path,'running','Starting',progress=None,started=started);stop=threading.Event()
        def status(m,p=None):  # every progress update is also a place where Cancel takes effect
            if stop.is_set():raise shorts.Cancelled()
            save_status(path,'running',m,progress=p,started=started)
        status.cancelled=stop
        def work():
            try:save_status(path,'done',cleaner.process(path,status),started=started,finished=time.time())
            except Exception as e:
                if stop.is_set():save_status(path,'cancelled','Stopped. Start again whenever you like.',finished=time.time())
                else:save_status(path,'error',str(e),started=started,finished=time.time())
        cancels[path.name]=stop;active[path.name]=threading.Thread(target=work,daemon=True);active[path.name].start()

@router.get('/cleaner')
def page():return FileResponse(ROOT/'static/cleaner.html')

@router.get('/cleaner/setup')
def setup():
    """Which engines will run, so the page can say what stays on this Mac (never returns key values)."""
    return {'transcriber':shorts.transcriber(),'elevenlabs':bool(shorts.setting('ELEVENLABS_API_KEY')),'local_whisper':(shorts.MOTION/'node_modules').exists()}

@router.get('/cleaner/jobs')
def list_jobs():
    if not cleaner.RUNS.exists():return []
    jobs=[]
    for p in cleaner.RUNS.iterdir():
        job=cleaner.read(p,'job.json')
        if job:s=status_of(p);jobs.append({'id':p.name,'title':job['title'],'created':job['created'],'duration':job.get('duration'),'state':s['state'],'progress':s.get('progress'),'status':s.get('status','')})
    return sorted(jobs,key=lambda j:-j['created'])

@router.post('/cleaner/jobs')
def create(file:UploadFile=File(...),noise:str=Form('light'),language:str=Form('am'),transcribe:bool=Form(True),title:str=Form('')):
    with tempfile.TemporaryDirectory() as tmp:
        src=Path(tmp)/'upload'
        with src.open('wb') as out:shutil.copyfileobj(file.file,out)
        try:path=cleaner.create(src,noise,language,transcribe,title,file.filename or 'recording')
        except ValueError as e:raise HTTPException(400,str(e))
    run(path);return state(path)

@router.get('/cleaner/jobs/{ident}')
def get(ident:str):return state(folder(ident))

@router.post('/cleaner/jobs/{ident}/retry')
def retry(ident:str):
    path=folder(ident);run(path);return state(path)

@router.post('/cleaner/jobs/{ident}/cancel')
def cancel(ident:str):
    path=folder(ident)
    if not busy(ident):raise HTTPException(409,'Nothing is running for this recording.')
    cancels[ident].set();return state(path)

@router.delete('/cleaner/jobs/{ident}')
def delete(ident:str):
    path=folder(ident)
    if busy(ident):raise HTTPException(409,'Cancel processing before deleting.')
    shutil.rmtree(path);return {'deleted':ident}

@router.get('/cleaner/jobs/{ident}/files/{name}')
def download(ident:str,name:str,download:bool=False):
    """Results and the original; inline for the players, as a named attachment for Download links."""
    path=folder(ident);job=cleaner.read(path,'job.json')
    if name not in {o['file'] for o in cleaner.outputs(path)}|{job['input']}:raise HTTPException(404)
    nice=job['name'] if name==job['input'] else f"{Path(job['name']).stem}-{name}"
    return FileResponse(path/name,filename=nice,content_disposition_type='attachment' if download else 'inline')
