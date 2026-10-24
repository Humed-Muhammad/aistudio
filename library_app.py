"""HTTP routes for the graphics library (mounted by app.py): describe a graphic, change, undo, delete, hide.
One Claude Code task at a time for the whole library; its status survives page reloads (elements/mine/.status.json)."""
import json,threading,time
from fastapi import APIRouter,Body,HTTPException
import graphics,library,shorts

router=APIRouter();task={'thread':None,'stop':None};lock=threading.Lock()
STATUS=library.MINE/'.status.json'

def running():return bool(task['thread'] and task['thread'].is_alive())

def save_status(state,message,**extra):
    library.MINE.mkdir(parents=True,exist_ok=True)
    data={'state':state,'status':message,**extra};tmp=STATUS.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.replace(STATUS);return data

def status_of():
    try:saved=json.loads(STATUS.read_text())
    except (OSError,ValueError):return {'state':'idle','status':''}
    if saved.get('state')=='running' and not running():
        saved=save_status('error','Interrupted because the app was restarted. Try again.',action=saved.get('action'))
    return saved

def start(action,message,work,**extra):
    with lock:
        if running():raise HTTPException(409,'Claude is still working on a graphic. Wait for it to finish, or cancel it.')
        started=time.time();info={'action':action,**extra};save_status('running',message,progress=None,started=started,**info);stop=threading.Event()
        def status(m,p=None):  # every progress update is also a place where Cancel takes effect
            if stop.is_set():raise shorts.Cancelled()
            save_status('running',m,progress=p,started=started,**info)
        status.cancelled=stop
        def run():
            try:
                result=work(status)
                save_status('done',f'Ready: {result["id"]}' if isinstance(result,dict) else 'Done',started=started,finished=time.time(),graphic=(result or {}).get('id'),**info)
            except Exception as e:
                if stop.is_set():save_status('cancelled','Stopped. Nothing in your library changed.',finished=time.time(),**info)
                else:save_status('error',str(e),started=started,finished=time.time(),**info)
        task['stop']=stop;task['thread']=threading.Thread(target=run,daemon=True);task['thread'].start()

def state():
    hidden=library.hidden();mine=sorted(p.stem for p in library.MINE.glob('*.json') if p.stem!='hidden' and library.find(p.stem)=='mine') if library.MINE.exists() else []
    return {**status_of(),'hidden':hidden,'mine':mine,'undo':{g:len(library.versions(g)) for g in mine},
            'claude':bool(graphics.claude_bin()),'models':library.MODELS}

def known(gid):
    if not library.find(gid):raise HTTPException(404,'No graphic with that name.')
    return gid

@router.get('/shorts/library')
def get_library():return state()

@router.post('/shorts/library/make')
def make(body:dict=Body(...)):
    text=str(body.get('description','')).strip();model=str(body.get('model','sonnet'))
    if len(text)<8:raise HTTPException(422,'Describe the graphic in a sentence or two.')
    if model not in library.MODELS:raise HTTPException(422,'Unknown model.')
    start('make','Claude is designing your graphic',lambda status:library.make(text,model,status),request=text)
    return state()

@router.post('/shorts/library/{gid}/change')
def change(gid:str,body:dict=Body(...)):
    known(gid);text=str(body.get('request','')).strip();model=str(body.get('model','sonnet'))
    if len(text)<4:raise HTTPException(422,'Say what to change in a few words.')
    if model not in library.MODELS:raise HTTPException(422,'Unknown model.')
    start('change',f'Claude is changing {gid}',lambda status:library.change(gid,text,model,status),request=text,target=gid)
    return state()

@router.post('/shorts/library/cancel')
def cancel():
    if task['stop']:task['stop'].set()
    for _ in range(60):
        if not running():break
        time.sleep(.1)
    return state()

def quick(fn,gid):
    """Undo and delete rebuild the studio: refuse while Claude is working on the library."""
    if running():raise HTTPException(409,'Claude is still working on a graphic. Wait for it to finish.')
    try:fn(gid)
    except (ValueError,RuntimeError) as e:raise HTTPException(409,str(e))
    return state()

@router.post('/shorts/library/{gid}/undo')
def undo(gid:str):return quick(library.undo,known(gid))

@router.delete('/shorts/library/{gid}')
def delete(gid:str):return quick(library.delete,known(gid))

@router.post('/shorts/library/{gid}/hide')
def hide(gid:str,body:dict=Body(...)):
    library.set_hidden(known(gid),bool(body.get('hidden',True)));return state()
