"""Clients for client work: who a video is for, with a colour, notes for Claude and an optional brand kit.
Stored in clients.json next to the app. Videos refer to a client by id in their job.json."""
from pathlib import Path
import json,uuid,threading
from config import ROOT

CLIENTS=ROOT/'clients.json'
COLORS=['#6EC1FF','#5EEAD4','#FF7A59','#FF6FAE','#B79CFF','#B8F35A','#F5A524','#94A3B8']
_lock=threading.Lock()

def load():
    try:return json.loads(CLIENTS.read_text())
    except (OSError,ValueError):return []

def _save(items):
    tmp=CLIENTS.with_suffix('.tmp');tmp.write_text(json.dumps(items,ensure_ascii=False,indent=1));tmp.replace(CLIENTS)

def get(cid):return next((c for c in load() if c['id']==cid),None) if cid else None

def _clean(name,color,notes):
    name=str(name).strip()[:60]
    if not name:raise ValueError('Give the client a name.')
    color=str(color).upper() if str(color).startswith('#') and len(str(color))==7 else COLORS[0]
    return name,color,str(notes).strip()[:2000]

def create(name,color='',notes=''):
    with _lock:
        items=load();name,color,notes=_clean(name,color or COLORS[len(items)%len(COLORS)],notes)
        client={'id':uuid.uuid4().hex[:12],'name':name,'color':color,'notes':notes,'kit':None}
        _save(items+[client]);return client

def update(cid,**fields):
    with _lock:
        items=load();c=next((c for c in items if c['id']==cid),None)
        if not c:raise KeyError(cid)
        name,color,notes=_clean(fields.get('name',c['name']),fields.get('color',c['color']),fields.get('notes',c['notes']))
        c.update(name=name,color=color,notes=notes)
        if 'kit' in fields:c['kit']=fields['kit']
        _save(items);return c

def delete(cid):
    with _lock:
        items=load();_save([c for c in items if c['id']!=cid])

def notes_for(folder):
    """The client's notes for Claude (spellings, style, audience) for a video, or ''."""
    try:cid=json.loads((Path(folder)/'job.json').read_text()).get('client')
    except (OSError,ValueError):return ''
    c=get(cid);return f"Client: {c['name']}." + (f"\nClient notes: {c['notes']}" if c['notes'] else '') if c else ''
