"""Graphics library for the Shorts editor: make, change, undo, delete and hide library graphics.

A graphic is two files in motion/src/elements (see AGENTS.md, "Graphics library"). Pack graphics ship with the
project and are never edited here; changing one makes your own copy in elements/mine. Claude Code (your plan, not
an API key) writes new graphics and changes, limited to elements/mine and the check command below. Every graphic
must typecheck and render a still before it joins the library; a broken one is moved aside, never kept.

  python library.py check ID      registry + typecheck + review stills in elements/mine/.review (used by Claude)
  python library.py make "a glowing price tag that bounces in"
  python library.py change ID "make it bigger and slower"
  python library.py undo ID | delete ID | hide ID | show ID
"""
import argparse,json,re,shutil,subprocess,sys,time
from pathlib import Path
import graphics,shorts
from config import ROOT

MOTION=shorts.MOTION
ELEMENTS=shorts.ELEMENTS_DIR
PACK=ELEMENTS/'pack'
MINE=ELEMENTS/'mine'
HISTORY=MINE/'.history'
REVIEW=MINE/'.review'
HIDDEN=MINE/'hidden.json'
MODELS=graphics.MODELS
MINUTES=float(shorts.setting('LIBRARY_MINUTES','15'))

def say(message,progress=None):print(message,flush=True)

def files(gid,where=None):
    """(json, tsx) of a graphic in mine, or in the given folder."""
    d=where or MINE;return d/f'{gid}.json',d/f'{gid}.tsx'

def find(gid):
    """'mine' or 'pack' for an existing graphic, else None."""
    if all(p.exists() for p in files(gid,MINE)):return 'mine'
    if all(p.exists() for p in files(gid,PACK)):return 'pack'
    return None

def slug(text):
    skip={'a','an','the','that','with','and','of','for','to','in','on','my','me','i','it','its','make','create','graphic','animation'}
    words=[w for w in re.findall(r'[a-z0-9]+',text.lower()) if w not in skip][:4] or ['graphic']
    base='-'.join(words)[:40].strip('-') or 'graphic';gid=base;n=2
    while find(gid) or (HISTORY/gid).exists():gid=f'{base}-{n}';n+=1
    return gid

def hidden():
    try:return json.loads(HIDDEN.read_text())
    except (OSError,ValueError):return []

def set_hidden(gid,hide=True):
    if not find(gid):raise ValueError(f'No graphic called {gid}.')
    now=[h for h in hidden() if h!=gid]+([gid] if hide else [])
    MINE.mkdir(parents=True,exist_ok=True);HIDDEN.write_text(json.dumps(now,indent=1))
    return now

def node(*args,timeout=300):
    return subprocess.run(['node',*args],cwd=MOTION,capture_output=True,text=True,timeout=timeout)

def check(gid,stills=(0.3,0.6,0.9)):
    """Registry, typecheck and review stills for one graphic. Returns (ok, report) in plain words."""
    if not find(gid):return False,f'No graphic called {gid} (expected elements/mine/{gid}.json and .tsx).'
    reg=node('scripts/elements.mjs')
    skipped=[l for l in (reg.stdout+reg.stderr).splitlines() if 'skipped' in l and f'/{gid}' in l]
    if skipped:return False,'\n'.join(skipped)
    meta=json.loads(files(gid,MINE if find(gid)=='mine' else PACK)[0].read_text())
    problems=meta_problems(meta)
    if problems:return False,'Fix the JSON: '+'; '.join(problems)
    tsc=subprocess.run(['npx','tsc','--noEmit'],cwd=MOTION,capture_output=True,text=True,timeout=300)
    errors=[l for l in tsc.stdout.splitlines() if 'error' in l]
    mine=[l for l in errors if f'{gid}.tsx' in l or f'{gid}.json' in l]
    if mine or (errors and tsc.returncode):return False,'TypeScript errors:\n'+'\n'.join((mine or errors)[:20])
    REVIEW.mkdir(parents=True,exist_ok=True);shots=[]
    for at in stills:
        out=REVIEW/f'{gid}-{int(at*100)}'
        r=node('scripts/element-stills.mjs',str(out),gid,'--at',str(at),timeout=600)
        if r.returncode:return False,'It does not render:\n'+(r.stderr or r.stdout)[-1500:]
        png=out/f'{gid}.png';final=REVIEW/f'{gid}-{int(at*100)}.png';png.replace(final);shutil.rmtree(out,ignore_errors=True);shots.append(final)
    return True,'Typecheck and render OK. Look at these stills: '+', '.join(str(s) for s in shots)

TYPES={'text','longtext','color','number','select','toggle','list'}
SOUNDS={'whoosh','pop','click','impact','riser','success','none'}
def meta_problems(m):
    out=[]
    for k in ['id','name','category','description','duration','layout','x','y','sound','fields']:
        if k not in m:out.append(f'missing "{k}"')
    if m.get('layout') not in ('anchored','full'):out.append('layout must be "anchored" or "full"')
    if m.get('sound') not in SOUNDS:out.append('sound must be one of '+', '.join(sorted(SOUNDS)))
    for f in m.get('fields',[]):
        if not {'key','label','type','default'}<=set(f):out.append(f'field {f.get("key")}: needs key, label, type and default')
        elif f['type'] not in TYPES:out.append(f'field {f["key"]}: type must be one of '+', '.join(sorted(TYPES)))
        elif f['type']=='select' and f['default'] not in f.get('options',[]):out.append(f'field {f["key"]}: default must be one of its options')
    return out

def backup(gid,why):
    """Copy a graphic's current files into .history/ID/STAMP-why before it changes."""
    j,t=files(gid);d=HISTORY/gid/f'{time.strftime("%Y%m%d-%H%M%S")}-{why}'
    n=1
    while d.exists():n+=1;d=d.with_name(d.name+f'-{n}')
    d.mkdir(parents=True);shutil.copy2(j,d/j.name);shutil.copy2(t,d/t.name);return d

def versions(gid):
    """Saved earlier versions, oldest first (deleted and failed ones are not versions)."""
    d=HISTORY/gid
    return sorted(p for p in d.iterdir() if p.is_dir() and not p.name.endswith(('-deleted','-failed'))) if d.exists() else []

def rebuild_studio():
    """The studio is a build: rebuild so the library shows the new or changed graphic (about a second)."""
    r=subprocess.run(['npm','run','studio:build'],cwd=MOTION,capture_output=True,text=True,timeout=600)
    if r.returncode:raise RuntimeError('The studio did not rebuild:\n'+(r.stderr or r.stdout)[-1200:])

def quarantine(gid,why):
    """Move a broken graphic out of the library so the studio keeps working."""
    j,t=files(gid);d=HISTORY/gid/f'{time.strftime("%Y%m%d-%H%M%S")}-failed';d.mkdir(parents=True,exist_ok=True)
    for p in (j,t):
        if p.exists():shutil.move(p,d/p.name)
    (d/'why.txt').write_text(why);node('scripts/elements.mjs')

def example(gid):
    j,t=files(gid,PACK);return f'--- {j.name}\n{j.read_text()}\n--- {t.name}\n{t.read_text()}'

def prompt(task,gid):
    check_cmd=f'{sys.executable} {ROOT/"library.py"} check {gid}'
    return '\n'.join([*task,'',
        'How library graphics work (follow it exactly): read AGENTS.md, section "Graphics library", and motion/src/elements/types.ts and kit.tsx.',
        'Two examples from the shipped pack:',example('name-lower-third'),example('number-counter'),'',
        f'Write only these two files, with the Write and Edit tools and these absolute paths: {MINE/(gid+".json")} and {MINE/(gid+".tsx")}.',
        f'The "id" in the JSON must be "{gid}". Every visible word, number and colour comes from a field with a sensible default, so the creator can edit it.',
        'Design: bold, clean, modern short-form style; the video\'s graphic style through theme/panel/Starred; the accent colour; Ethiopic-safe fonts from the theme; '
        'designed for 1080 wide (multiply sizes by k); smooth enter (useLife/pop/ease) and exit; deterministic (random(seed) from remotion, never Math.random or Date); '
        'no yellow, no hard black text outline; long text shrinks with fit().',
        f'Then check it, exactly this command: {check_cmd}',
        f'It typechecks, renders stills to {REVIEW}, and prints their paths: open each still with Read and look at it. Fix anything that looks wrong '
        '(cut-off or overflowing text, empty frame, poor contrast, clumsy layout) and check again. Finish only when check says OK and the stills look professional.',
        'Do not run any other command. Finish with one or two sentences on what you made.'])

def run(task,gid,model,status,request):
    """Claude Code writes or edits one graphic in elements/mine; then it must pass check, or it is moved aside."""
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    MINE.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(exist_ok=True)
    root='/'+str(ROOT);mine='/'+str(MINE)
    check_cmd=f'{sys.executable} {ROOT/"library.py"} check {gid}'
    allowed=[f'Read({root}/AGENTS.md)',f'Read({root}/motion/src/**)',f'Read({root}/docs/**)',f'Read({mine}/**)',f'Write({mine}/{gid}.json)',f'Write({mine}/{gid}.tsx)',
             f'Edit({mine}/{gid}.json)',f'Edit({mine}/{gid}.tsx)','Glob','Skill',f'Bash({check_cmd})']
    denied=[f'Read({root}/.env*)','Bash(cat:*)','Bash(head:*)','Bash(tail:*)','Bash(less:*)','Bash(grep:*)']
    started=time.time()
    result=graphics.run_claude([prompt(task,gid),'--model',model,'--tools','Read,Write,Edit,Glob,Bash,Skill','--allowedTools',*allowed,'--disallowedTools',*denied,
                                '--permission-mode','dontAsk'],ROOT,status,'Claude Code is starting',log=MINE/'.claude.log',timeout=int(MINUTES*60))
    summary=(result.get('result') or '').strip()
    if not find(gid):raise RuntimeError('Claude Code finished without writing the graphic. Its note: '+summary[-1200:])
    status('Checking the graphic renders',None)
    ok,report=check(gid,stills=(0.6,))
    if not ok:
        quarantine(gid,report);raise RuntimeError('The graphic did not pass the check, so it was set aside (nothing in your library changed):\n'+report[-1500:])
    status('Adding it to your library',None);rebuild_studio()
    log=json.loads((MINE/'.runs.json').read_text()) if (MINE/'.runs.json').exists() else []
    info={'id':gid,'request':request,'model':model,'started':started,'finished':time.time(),'summary':summary}
    (MINE/'.runs.json').write_text(json.dumps(log+[info],ensure_ascii=False,indent=1))
    return info

def make(description,model='sonnet',status=say):
    description=description.strip()
    if len(description)<8:raise ValueError('Describe the graphic in a sentence or two.')
    gid=slug(description)
    task=[f'Make a new graphic for the creator\'s graphics library (short-form vertical videos, Amharic and English): {description}',
          'Choose a short clear name, the best category (Lower thirds, Titles, Callouts, Data, Social, Sales, Fun, or a new one if none fits), '
          'a one-line description of what it is and when to use it, a duration, layout and default position that suit it.']
    try:return run(task,gid,model,status,description)
    except Exception:
        if find(gid)=='mine':quarantine(gid,'stopped')
        node('scripts/elements.mjs');raise

def change(gid,request,model='sonnet',status=say):
    request=request.strip()
    if len(request)<4:raise ValueError('Say what to change in a few words.')
    where=find(gid)
    if not where:raise ValueError(f'No graphic called {gid}.')
    if where=='pack':  # pack graphics stay as shipped: the change goes into your own copy
        meta=json.loads(files(gid,PACK)[0].read_text());new=slug(gid+' mine')
        meta.update(id=new,name=meta['name']+' (mine)');files(new)[0].parent.mkdir(parents=True,exist_ok=True)
        files(new)[0].write_text(json.dumps(meta,ensure_ascii=False,indent=1)+'\n');shutil.copy2(files(gid,PACK)[1],files(new)[1]);gid=new
    else:backup(gid,'before-change')
    task=[f'Change the library graphic "{gid}" ({MINE/(gid+".tsx")} and its JSON). The creator asks: {request}',
          'Change only what they asked; keep its id, its fields (add new fields if the change needs editable words or colours) and everything else as it is.']
    try:return run(task,gid,model,status,request)
    except Exception:
        if where=='mine':restore_last(gid,keep_current=False)
        elif find(gid)=='mine':quarantine(gid,'stopped')  # the unfinished copy of a pack graphic
        node('scripts/elements.mjs');raise

def restore_last(gid,keep_current=True):
    """Put back the newest saved version (the current files are kept in history when keep_current)."""
    saved=versions(gid)
    if not saved:raise ValueError('There is no earlier version to go back to.')
    last=saved[-1];j,t=files(gid)
    if keep_current and j.exists():backup(gid,'undone')
    for name in (j.name,t.name):shutil.copy2(last/name,MINE/name)
    shutil.rmtree(last)

def undo(gid):
    if find(gid)!='mine':raise ValueError('Only your own graphics have changes to undo.')
    restore_last(gid,keep_current=False);node('scripts/elements.mjs');rebuild_studio()

def delete(gid):
    if find(gid)!='mine':raise ValueError('Shipped graphics can only be hidden, not deleted.')
    j,t=files(gid);d=HISTORY/gid/f'{time.strftime("%Y%m%d-%H%M%S")}-deleted';d.mkdir(parents=True)
    shutil.move(j,d/j.name);shutil.move(t,d/t.name)
    if gid in hidden():set_hidden(gid,False)
    node('scripts/elements.mjs');rebuild_studio()

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter);sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('check').add_argument('id')
    m=sub.add_parser('make');m.add_argument('description');m.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('change');c.add_argument('id');c.add_argument('request');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    for name in ['undo','delete','hide','show']:sub.add_parser(name).add_argument('id')
    a=p.parse_args()
    try:
        if a.cmd=='check':ok,report=check(a.id);print(('OK. ' if ok else 'NOT OK. ')+report);return 0 if ok else 1
        if a.cmd=='make':print(make(a.description,a.model)['id'])
        elif a.cmd=='change':print(change(a.id,a.request,a.model)['id'])
        elif a.cmd=='undo':undo(a.id)
        elif a.cmd=='delete':delete(a.id)
        else:set_hidden(a.id,a.cmd=='hide')
    except (ValueError,RuntimeError) as e:print(e,file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
