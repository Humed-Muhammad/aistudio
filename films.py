"""Motion Studio: promos, product films and explainers drawn entirely in code with Remotion, rendered on this Mac.
A film is one JSON file (runs/films/JOB/film.json): format, graphic style, colours, backdrop, transitions, camera, sound
and a list of scenes. Every scene is a template from motion/src/film/scenes (app screens, phones, browsers, charts, type,
brand) with its own words, so nothing needs a photo, and words, colours and order change without new code.
Claude Code (the creator's plan, never an API key) directs: it writes a detailed spec, then the film, checks stills of
every scene and fixes them. The chat beside the preview is the same Claude Code session, editing film.json live.

  python films.py new "Nimbo launch" [--format portrait|square|feed|landscape] [--starter ID]
  python films.py make JOB "a 20 s launch film for my invoicing app"   Claude Code writes spec.md and film.json
  python films.py chat JOB "make the second scene coral"               one chat turn (Claude Code edits film.json)
  python films.py check JOB [--stills] [--scenes 1,3]                  validate film.json; review stills in review/
  python films.py render JOB [--final]                                 draft (half size) or final MP4 in renders/
  python films.py scenes | starters                                    list scene templates / starter films
  python films.py scene-check ID                                       check a custom scene in scenes/mine
"""
from pathlib import Path
import argparse,json,re,shutil,subprocess,sys,time,uuid
import graphics,shorts
from shorts import Cancelled,finished,say,spawn
from config import ROOT,setting

RUNS=ROOT/'runs'/'films'
MOTION=shorts.MOTION
FILM_DIR=MOTION/'src'/'film'
SCENES=FILM_DIR/'scenes';PACK=SCENES/'pack';MINE=SCENES/'mine';HISTORY=MINE/'.history'
CATALOG=FILM_DIR/'catalog.gen.json'
STARTERS=FILM_DIR/'starters'
GUIDE=ROOT/'docs'/'motion-studio.md'
FPS=30
FORMATS={'portrait':(1080,1920),'square':(1080,1080),'feed':(1080,1350),'landscape':(1920,1080)}
STYLES=shorts.GRAPHIC_STYLES
BACKDROPS=['aurora','mesh','grid','dots','spotlight','rays','plain','paper','cartoon']
CAMERAS=['still','drift','world']
# Frames each hand-over overlaps two scenes: keep in step with motion/src/film/transitions.tsx (FRAMES) and World.tsx.
TRANSITIONS={'push':18,'slide':18,'zoom':16,'blur':18,'whip':12,'wipe':18,'iris':20,'flip':22,'fade':16,'cut':0}
WORLD_FRAMES=26
LANGUAGES=['am','en','om']
# The sound each cue plays: the Shorts sound library (the creator's picks, their files, Mixkit defaults), levelled per family.
SOUND_FILES={'whoosh':'whoosh-soft','pop':'pop','click':'ui-click','success':'success','impact':'impact','riser':'riser-bass','hit':'hit','camera':'camera-click'}
REL_DB={'whoosh':-13,'pop':-10,'click':-11,'success':-9,'impact':-8,'riser':-10,'hit':-8,'camera':-11}
AUDIO=('.mp3','.wav','.m4a','.aac','.ogg','.flac')
IMAGES=('.png','.jpg','.jpeg','.webp','.svg')
HEX=re.compile(r'^#[0-9a-fA-F]{6}$')
MODELS=graphics.MODELS
DEFAULT_FILM={'version':1,'title':'','format':'portrait','style':'glass','mode':'dark','accent':'#6EC1FF','accent2':'#B79CFF',
              'backdrop':'aurora','transition':'push','camera':'drift','brand':{'name':'','logo':''},'language':'en',
              'sound':{'auto':True,'music':'','music_volume':0.5,'voice':''},'scenes':[]}

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def write(folder,name,data):
    tmp=Path(folder)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(folder)/name)

# ---- scene templates ---------------------------------------------------------------------------------------------

def sync():
    """Refresh the renderer's list of scene templates (new or removed files in motion/src/film/scenes)."""
    r=subprocess.run(['node','scripts/scenes.mjs'],cwd=MOTION,capture_output=True,text=True)
    return r.stdout+r.stderr

def stale():
    if not CATALOG.exists():return True
    made=CATALOG.stat().st_mtime
    return any(p.stat().st_mtime>made for d in (PACK,MINE) if d.exists() for p in d.iterdir() if p.suffix in ('.json','.tsx'))

def catalog():
    """{'scenes': {id: meta}, 'icons': [names]} from motion/src/film (rebuilt when a scene file changed)."""
    if stale():sync()
    return read(CATALOG.parent,CATALOG.name,{'scenes':{},'icons':[]})

def scene_summary():
    """The scene library in a few lines per template, for Claude and the CLI."""
    out=[]
    for sid,m in catalog()['scenes'].items():
        fields='; '.join(f"{f['key']} ({f['type']}{', '+f['label'] if '(' in f['label'] else ''})={json.dumps(f['default'],ensure_ascii=False)}" for f in m['fields'])
        out.append(f"- {sid} [{m['category']}, {m['duration']}s, min {m['min']}s]: {m['description']}\n    fields: {fields}")
    return '\n'.join(out)

def starters():
    """Starter films shipped in motion/src/film/starters (id, title, description, format, film)."""
    out=[]
    for p in sorted(STARTERS.glob('*.json')) if STARTERS.exists() else []:
        try:data=json.loads(p.read_text())
        except ValueError:continue
        out.append({'id':p.stem,'title':data.get('title',p.stem),'description':data.get('description',''),'use':data.get('use',''),'film':data['film']})
    return out

# ---- checking a film ---------------------------------------------------------------------------------------------

def words(value):
    text=' '.join(value) if isinstance(value,list) else str(value)
    return len([w for w in re.split(r'[\s|]+',text.replace('*','')) if w])

def clean_value(f,v):
    """One field value in its type and range (as shorts.element_values does for library graphics)."""
    t=f['type']
    try:
        if t=='number':return min(max(float(v),f.get('min',-1e9)),f.get('max',1e9))
        if t=='toggle':return v in (True,'true','1',1)
        if t=='list':return [str(x)[:300] for x in (v if isinstance(v,list) else str(v).split('\n')) if str(x).strip()][:12]
        if t=='select':return str(v) if str(v) in f.get('options',[]) else f['default']
        if t=='color':return str(v) if (not v or HEX.match(str(v))) else f['default']
        return str(v)[:600]
    except (TypeError,ValueError):return f['default']

def asset(folder,value,kinds):
    """A path inside the job's assets/ that exists and has one of these extensions, else ''."""
    value=str(value or '').strip()
    if not value:return ''
    if not value.startswith('assets/'):value='assets/'+Path(value).name
    path=Path(folder)/value if folder else None
    return value if path and path.is_file() and path.suffix.lower() in kinds else None

def check_film(data,folder=None):
    """A film with every value in range and every scene known, plus plain-language warnings for what was changed."""
    warn=[];data=data if isinstance(data,dict) else {}
    cat=catalog();scenes_meta=cat['scenes'];icons=set(cat['icons'])
    f={**DEFAULT_FILM,**{k:v for k,v in data.items() if k in DEFAULT_FILM}}
    f['version']=1;f['title']=str(f['title'] or '')[:80]
    def pick(key,options,default):
        if f[key] not in options:
            warn.append(f'{key} "{f[key]}" is not one of {", ".join(options)}: using {default}.');f[key]=default
    pick('format',list(FORMATS),'portrait');pick('style',STYLES,'glass');pick('mode',['dark','light'],'dark')
    pick('backdrop',BACKDROPS,'aurora');pick('transition',list(TRANSITIONS),'push');pick('camera',CAMERAS,'drift');pick('language',LANGUAGES,'en')
    for key in ('accent','accent2'):
        if not HEX.match(str(f[key])):warn.append(f'{key} must be a colour like #6EC1FF: using the default.');f[key]=DEFAULT_FILM[key]
        else:f[key]=f[key].upper()
    brand=f['brand'] if isinstance(f['brand'],dict) else {}
    logo=asset(folder,brand.get('logo'),IMAGES) if folder else str(brand.get('logo') or '')
    if logo is None:warn.append(f'The logo {brand.get("logo")} is not in assets/: the letter mark is drawn instead.');logo=''
    f['brand']={'name':str(brand.get('name') or '')[:40],'logo':logo}
    sound=f['sound'] if isinstance(f['sound'],dict) else {}
    s={'auto':sound.get('auto',True) in (True,'true',1),'music_volume':0.5,'music':'','voice':''}
    try:s['music_volume']=round(min(1.,max(0.,float(sound.get('music_volume',.5)))),2)
    except (TypeError,ValueError):pass
    for key in ('music','voice'):
        found=asset(folder,sound.get(key),AUDIO) if folder else str(sound.get(key) or '')
        if found is None:warn.append(f'The {key} file {sound.get(key)} is not in assets/: left out.');found=''
        s[key]=found
    f['sound']=s
    out=[];seen=set()
    for n,raw in enumerate(data.get('scenes') or []):
        if not isinstance(raw,dict):continue
        tid=str(raw.get('template',''));meta=scenes_meta.get(tid)
        label=f'Scene {len(out)+1}'
        if not meta:warn.append(f'{label}: there is no scene template "{tid}", so it was left out.');continue
        sid=re.sub(r'[^a-zA-Z0-9_-]','',str(raw.get('id') or ''))[:24] or f's{n+1}'
        while sid in seen:sid=f'{sid}x'
        seen.add(sid)
        try:duration=round(float(raw.get('duration',meta['duration'])),2)
        except (TypeError,ValueError):duration=meta['duration']
        if duration<meta['min']:warn.append(f'{label} ({meta["name"]}): {duration}s is too short for it, so it runs {meta["min"]}s.');duration=meta['min']
        duration=min(duration,60.)
        props=raw.get('props') if isinstance(raw.get('props'),dict) else {}
        fields={x['key']:x for x in meta['fields']}
        unknown=sorted(set(props)-set(fields))
        if unknown:warn.append(f'{label} ({meta["name"]}): it has no field {", ".join(unknown)} (dropped).')
        values={k:clean_value(fields[k],v) for k,v in props.items() if k in fields}
        for key,x in fields.items():  # icon names, alone or first in "icon | …" rows
            v=values.get(key,x['default'])
            names=[v] if key=='icon' else v if key=='icons' else [r.split('|')[0].strip() for r in v] if x['type']=='list' and '(icon' in x['label'] else []
            bad=sorted({str(i).strip().lower() for i in names if str(i).strip() and str(i).strip().lower() not in icons})
            if bad:warn.append(f'{label}: no icon called {", ".join(bad)} (a dot is drawn). Icons: see `python films.py icons`.')
        total=sum(words(values.get(k,x['default'])) for k,x in fields.items() if x['type'] in ('text','longtext','list'))
        need=round(.4+total/4.5,1)  # short-form pace: about 4-5 words a second, read while it moves
        if total and duration<need and meta['category'] in ('Type','Structure','Proof','Data'):
            warn.append(f'{label} ({meta["name"]}) shows {total} words in {duration}s: give it about {need}s so it can be read.')
        transition=str(raw.get('transition') or '')
        if transition and transition not in TRANSITIONS:warn.append(f'{label}: transition "{transition}" is not known, so the film\'s is used.');transition=''
        accent=str(raw.get('accent') or '')
        if accent and not HEX.match(accent):warn.append(f'{label}: accent must be a colour like #6EC1FF.');accent=''
        mode=str(raw.get('mode') or '')
        out.append({'id':sid,'template':tid,'duration':duration,'props':values,'transition':transition,'accent':accent.upper(),
                    'mode':mode if mode in ('dark','light') else '','note':str(raw.get('note') or '')[:300]})
    f['scenes']=out
    if not out:warn.append('The film has no scenes yet.')
    seconds=film_frames(f)/FPS
    if s['voice'] and folder:
        try:
            spoken=shorts.probe(Path(folder)/s['voice'])['duration']
            if spoken>seconds+.3:warn.append(f'The voice-over is {spoken:.1f}s but the film is {seconds:.1f}s: lengthen scenes or the end is cut off.')
        except Exception:pass
    return f,warn

def handover(film,i):
    if i>=len(film['scenes'])-1:return 'cut'
    return film['scenes'][i].get('transition') or film['transition']

def timeline(film):
    """(start frame, frames) of every scene: a scene overlaps the next by its hand-over (Film.tsx timeline())."""
    rows=[];at=0;last=len(film['scenes'])-1
    for i,s in enumerate(film['scenes']):
        frames=max(1,round(s['duration']*FPS));rows.append((at,frames))
        at+=frames-(0 if i>=last else WORLD_FRAMES if film['camera']=='world' else TRANSITIONS[handover(film,i)])
    return rows

def film_frames(film):
    rows=timeline(film)
    return rows[-1][0]+rows[-1][1] if rows else FPS

# ---- jobs ----------------------------------------------------------------------------------------------------------

def job_folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise ValueError('Expected a 32-character local job ID')
    path=RUNS/ident
    if not (path/'job.json').exists():raise ValueError(f'No film {ident}')
    return path

def load(folder):return read(folder,'film.json') or {**DEFAULT_FILM}

def save(folder,data):
    """Check and save film.json; returns (film, warnings). Warnings are kept for the editor."""
    film,warn=check_film(data,folder);write(folder,'film.json',film);write(folder,'film-warnings.json',warn)
    return film,warn

def create(title,fmt='portrait',starter=None,client=None,request='',language='en'):
    if fmt not in FORMATS:raise ValueError('Format must be one of: '+', '.join(FORMATS))
    folder=RUNS/uuid.uuid4().hex;(folder/'assets').mkdir(parents=True);(folder/'renders').mkdir()
    title=(title or '').strip()[:80] or 'Untitled film'
    base={**DEFAULT_FILM,'title':title,'brand':{'name':title.split()[0] if title!='Untitled film' else '','logo':''}}
    if starter:
        found=next((s for s in starters() if s['id']==starter),None)
        if not found:shutil.rmtree(folder);raise ValueError(f'No starter film {starter}')
        base={**DEFAULT_FILM,**found['film'],'title':title}
    base['format']=fmt;base['language']=language if language in LANGUAGES else 'en'
    write(folder,'job.json',{'title':title,'created':time.time(),'client':client,'request':request.strip()[:4000],'starter':starter})
    save(folder,base);return folder

def add_asset(folder,src,name=None):
    """Copy a logo, image, music or voice file into assets/ (images are kept as they are; never changed)."""
    folder=Path(folder);name=Path(name or Path(src).name).name;ext=Path(name).suffix.lower()
    if ext not in IMAGES+AUDIO:raise ValueError('Use an image (PNG, JPG, WebP, SVG) or audio (MP3, WAV, M4A).')
    stem=re.sub(r'[^a-zA-Z0-9_-]+','-',Path(name).stem).strip('-')[:40] or 'file';dst=folder/'assets'/f'{stem}{ext}';n=2
    while dst.exists():dst=folder/'assets'/f'{stem}-{n}{ext}';n+=1
    shutil.copyfile(src,dst);return 'assets/'+dst.name

def assets(folder):
    d=Path(folder)/'assets'
    return sorted('assets/'+p.name for p in d.iterdir() if p.suffix.lower() in IMAGES+AUDIO) if d.exists() else []

def remove_asset(folder,name):
    folder=Path(folder);path=folder/'assets'/Path(name).name
    if not path.is_file():raise ValueError('No such file.')
    path.unlink();film=load(folder);rel='assets/'+path.name
    if film.get('brand',{}).get('logo')==rel:film['brand']['logo']=''
    for key in ('music','voice'):
        if film.get('sound',{}).get(key)==rel:film['sound'][key]=''
    save(folder,film)

# ---- sound and render props --------------------------------------------------------------------------------------

def levels(folder,names):
    """{family: (file, peak s, rms, loudest sample)} for the sounds a film can use, from the Shorts sound library."""
    kit=shorts.sound_kit(folder,[SOUND_FILES[n] for n in names]);cache=read(Path(folder)/'sfx','levels.json',{});out={}
    for n in names:
        name=SOUND_FILES[n]
        if name not in kit:continue
        path=Path(folder)/'sfx'/f'{name}.wav';key=str(path.stat().st_mtime)
        if cache.get(name,{}).get('key')!=key:
            import numpy as np
            cache[name]={'key':key,'top':float(np.abs(shorts.decode_audio(path)).max())/32768}
        out[n]=(f'sfx/{name}.wav',*kit[name][:2],cache[name]['top'])
    write(Path(folder)/'sfx','levels.json',cache);return out

def voice_rms(folder,voice):
    """Typical loudness of the voice-over (cached by file time), so effects sit under it."""
    path=Path(folder)/voice;cache=read(folder,'.voice-level.json',{})
    key=f'{voice}:{path.stat().st_mtime}'
    if cache.get('key')!=key:cache={'key':key,'rms':shorts.voice_level(path)};write(folder,'.voice-level.json',cache)
    return cache['rms']

def props(folder,base=None,film=None):
    """Render props for the Film composition: the checked film, its size and length, and levelled sound files."""
    folder=Path(folder);warn=[]
    if film is None:film,warn=check_film(load(folder),folder)
    w,h=FORMATS[film['format']];sounds={}
    if film['sound']['auto']:
        try:
            ref=voice_rms(folder,film['sound']['voice']) if film['sound']['voice'] else .09
            for name,(file,peak,rms,top) in levels(folder,list(SOUND_FILES)).items():
                # Levelled against the voice (or a quiet reference), and never louder than -6 dB at its loudest sample.
                gain=min(1.,ref*10**(REL_DB[name]/20)/max(1e-4,rms),.5/max(1e-4,top))
                sounds[name]={'file':file,'peak':round(peak,3),'gain':round(gain,3)}
        except Exception as e:warn.append(f'Sound effects are off for now: {e}')
    return {'film':film,'fps':FPS,'width':w,'height':h,'durationInFrames':film_frames(film),'sounds':sounds,'assets':assets(folder),'base':base},warn

def write_props(folder):
    data,warn=props(folder);(Path(folder)/'film-props.json').write_text(json.dumps(data,ensure_ascii=False));return warn

def render(folder,final=False,status=say):
    """Draft (half size, quick) or final MP4 in renders/. Rendering is local (Remotion + installed Chrome)."""
    folder=Path(folder);shorts.need_motion();sync();warn=write_props(folder)
    name='final.mp4' if final else 'draft.mp4';partial=folder/'renders'/('.rendering-'+name)
    cmd=['npx','remotion','render','src/index.ts','Film',str(partial),'--props',str(folder/'film-props.json'),'--public-dir',str(folder),
         '--codec','h264','--crf','18' if final else '23','--log','info']+shorts.browser_args()+([] if final else ['--scale','0.5'])
    label='Rendering the final film (full quality)' if final else 'Rendering a quick draft (half size)';status(label,0)
    proc=spawn(cmd,status,MOTION);tail=[]
    for line in proc.stdout:
        line=line.strip();tail=(tail+[line])[-15:]
        done=re.match(r'(Rendered|Encoded) (\d+)/(\d+)',line)
        if done:status(label,(.85 if done[1]=='Rendered' else .15)*int(done[2])/max(1,int(done[3]))+(.85 if done[1]=='Encoded' else 0))
    if finished(proc,status):raise RuntimeError('Render failed:\n'+'\n'.join(tail))
    partial.replace(folder/'renders'/name);thumb(folder)
    return folder/'renders'/name,warn

def thumb(folder):
    """Poster for the film list: a frame from the newest render."""
    folder=Path(folder);video=next((folder/'renders'/n for n in ('final.mp4','draft.mp4') if (folder/'renders'/n).exists()),None)
    if video:
        try:shorts.thumbnail(video,folder/'thumb.jpg')
        except Exception:pass

def stills(folder,scenes=None,at=None,status=say):
    """Review PNGs of scenes (1-based numbers) in review/; returns their paths. Used by Claude to look at its work."""
    folder=Path(folder);sync();write_props(folder);out=folder/'review';out.mkdir(exist_ok=True)
    film=load(folder);n=len(film.get('scenes',[]))
    pick=[i-1 for i in scenes if 1<=i<=n] if scenes else list(range(n))
    if not pick:return []
    for i in pick:(out/f'scene-{i+1:02d}.png').unlink(missing_ok=True)
    cmd=['node','scripts/film-stills.mjs',str(folder/'film-props.json'),str(out),'--scenes',','.join(map(str,pick)),'--public-dir',str(folder)]+(['--at',str(at)] if at is not None else [])
    proc=spawn(cmd,status,MOTION);lines=[]
    for line in proc.stdout:
        line=line.strip()
        if line.endswith('.png'):status(f'Review still {len(lines)+1} of {len(pick)}',len(lines)/len(pick));lines.append(line)
    if finished(proc,status):raise RuntimeError('Could not render review stills.')
    return [out/f'scene-{i+1:02d}.png' for i in pick if (out/f'scene-{i+1:02d}.png').exists()]

# ---- custom scenes (scenes/mine) -----------------------------------------------------------------------------------

def scene_check(sid):
    """Registry, JSON, typecheck and a still for one scene template in scenes/mine. Returns (ok, report)."""
    j,t=MINE/f'{sid}.json',MINE/f'{sid}.tsx'
    if not (j.exists() and t.exists()):return False,f'Expected {j} and {t}.'
    report=sync()
    skipped=[l for l in report.splitlines() if 'skipped' in l and f'/{sid}' in l]
    if skipped:return False,'\n'.join(skipped)
    try:meta=json.loads(j.read_text())
    except ValueError as e:return False,f'{j.name} is not valid JSON: {e}'
    problems=[f'missing "{k}"' for k in ('id','name','category','description','duration','min','sound','fields') if k not in meta]
    if meta.get('sound') not in ('none',*SOUND_FILES):problems.append('sound must be one of none, '+', '.join(SOUND_FILES))
    for x in meta.get('fields',[]):
        if not {'key','label','type','default'}<=set(x):problems.append(f'field {x.get("key")}: needs key, label, type and default')
    if problems:return False,'Fix the JSON: '+'; '.join(problems)
    tsc=subprocess.run(['npx','tsc','--noEmit'],cwd=MOTION,capture_output=True,text=True,timeout=300)
    errors=[l for l in tsc.stdout.splitlines() if 'error' in l]
    if errors:return False,'TypeScript errors:\n'+'\n'.join(([l for l in errors if sid in l] or errors)[:20])
    out=MINE/'.review';out.mkdir(exist_ok=True)
    r=subprocess.run(['node','scripts/scene-stills.mjs',str(out),sid,'--format','portrait,landscape'],cwd=MOTION,capture_output=True,text=True,timeout=600)
    if r.returncode:return False,'It does not render:\n'+(r.stderr or r.stdout)[-1500:]
    return True,'Typecheck and render OK. Look at these stills: '+', '.join(str(out/f'{sid}-{f}.png') for f in ('portrait','landscape'))

def quarantine_broken(since):
    """Move custom scenes written or changed since then that fail their check out of the library, so one bad file never
    breaks every film."""
    moved=[]
    for j in sorted(MINE.glob('*.json')) if MINE.exists() else []:
        if max(p.stat().st_mtime for p in (j,j.with_suffix('.tsx')) if p.exists())<since:continue
        ok,why=scene_check(j.stem)
        if not ok:
            d=HISTORY/j.stem/f'{time.strftime("%Y%m%d-%H%M%S")}-failed';d.mkdir(parents=True,exist_ok=True)
            for p in (j,j.with_suffix('.tsx')):
                if p.exists():shutil.move(p,d/p.name)
            (d/'why.txt').write_text(why);moved.append(j.stem)
    if moved:sync()
    return moved

# ---- Claude Code: director and chat --------------------------------------------------------------------------------

def py(cmd,folder=None):
    """A films.py command written the way Claude must run it (absolute paths, so permissions match exactly)."""
    return f'{sys.executable} {ROOT/"films.py"} {cmd}'+(f' {Path(folder).resolve().name}' if folder else '')

def rules(folder):
    folder=Path(folder).resolve();job=read(folder,'job.json');film=load(folder)
    lang={'am':'Amharic, in Ethiopic script','om':'Afaan Oromoo','en':'English'}[film.get('language','en')]
    return [f'Film folder: {folder} (film.json, spec.md, assets/, review/). Format {film.get("format")}, on-screen language: {lang}.',
        f'Read {GUIDE} first: the film format, motion rules, design rules and how to write the spec. AGENTS.md has the house rules.',
        f'Scene templates (template id [category, default s, min s]: what it is; fields key (type)=default):\n{scene_summary()}',
        'Assets the creator uploaded (use them; never invent images): '+(', '.join(assets(folder)) or 'none'),
        *(['Client notes: '+n for n in [client_notes(job)] if n]),
        'Edit only film.json and spec.md with Write and Edit (absolute paths). Run only these commands, exactly (no cd, no pipes):',
        f'  {py("check",folder)}                       validate film.json, prints warnings',
        f'  {py("check",folder)} --stills --scenes 2,3   also renders review stills of those scenes (1 = first), prints their paths',
        f'If no template can show something essential, you may write one new scene template: {MINE}/ID.json + ID.tsx, following two pack examples you Read '
        f'(e.g. {PACK}/phone-app.tsx and {PACK}/features.tsx), then run {py("scene-check")} ID and look at its stills. Prefer templates.',
        'Never invent facts the creator did not give (prices, numbers, ratings, customer names, addresses, phone numbers): when a scene needs one, '
        'write an obvious sample and list it in spec.md under "## Check before posting".']

def client_notes(job):
    try:
        import clients
        c=clients.get((job or {}).get('client'));return (c or {}).get('notes','').strip()
    except Exception:return ''

def describe(tool,args,cwd):
    target=str(args.get('file_path') or args.get('command') or '')
    name=Path(target.split()[0] if tool=='Bash' else target).name
    if tool in ('Write','Edit','MultiEdit'):return 'Claude is writing the spec' if name=='spec.md' else 'Claude is editing the film' if name=='film.json' else f'Claude is designing a new scene ({name})'
    if tool=='Read':return 'Claude is looking at a review still' if name.endswith('.png') else f'Claude is reading {name}'
    if tool=='Bash':return 'Rendering review stills' if '--stills' in target else 'Checking a new scene' if 'scene-check' in target else 'Checking the film'
    return 'Claude is working'

def permissions(folder):
    job='/'+str(Path(folder).resolve());root='/'+str(ROOT);mine='/'+str(MINE)
    allowed=[f'Read({job}/**)',f'Read({root}/AGENTS.md)',f'Read({root}/docs/**)',f'Read({root}/motion/src/**)',
             f'Write({job}/film.json)',f'Edit({job}/film.json)',f'Write({job}/spec.md)',f'Edit({job}/spec.md)',f'Write({mine}/**)',f'Edit({mine}/**)','Glob',
             f'Bash({py("check",folder)})',f'Bash({py("check",folder)} --stills:*)',f'Bash({py("scene-check")}:*)']
    denied=[f'Read({root}/.env*)','Bash(cat:*)','Bash(head:*)','Bash(tail:*)','Bash(less:*)','Bash(grep:*)']
    return ['--tools','Read,Write,Edit,Glob,Bash','--allowedTools',*allowed,'--disallowedTools',*denied,'--permission-mode','dontAsk']

def backup(folder,why):
    """Copy film.json and spec.md to .undo/STAMP-why before Claude changes them; returns the backup name."""
    folder=Path(folder);name=f'{time.strftime("%Y%m%d-%H%M%S")}-{why}';d=folder/'.undo'/name;n=2
    while d.exists():d=folder/'.undo'/f'{name}-{n}';n+=1
    d.mkdir(parents=True)
    for f in ('film.json','spec.md'):
        if (folder/f).exists():shutil.copy2(folder/f,d/f)
    return d.name

def undo(folder):
    """Put back film.json and spec.md from before Claude's last change (one step per call)."""
    folder=Path(folder);runs=read(folder,'claude-runs.json',[])
    last=next((r for r in reversed(runs) if r.get('backup') and not r.get('undone')),None)
    if not last or not (folder/'.undo'/last['backup']).exists():raise ValueError('There is no Claude change to undo.')
    d=folder/'.undo'/last['backup']
    for f in ('film.json','spec.md'):
        if (d/f).exists():shutil.copy2(d/f,folder/f)
        elif f=='spec.md':(folder/f).unlink(missing_ok=True)
    last['undone']=True;write(folder,'claude-runs.json',runs);save(folder,load(folder))
    chat=read(folder,'chat.json',{'messages':[]})
    for m in chat['messages']:
        if m.get('backup')==last['backup']:m['undone']=True
    write(folder,'chat.json',chat);return last

def changes(before,after):
    """What changed between two films, in a few plain lines (for the chat)."""
    cat=catalog()['scenes'];name=lambda s:(cat.get(s['template'],{}).get('name') or s['template'])
    out=[];old={s['id']:(i,s) for i,s in enumerate(before.get('scenes',[]))};new={s['id']:(i,s) for i,s in enumerate(after.get('scenes',[]))}
    for key in ('format','style','mode','accent','accent2','backdrop','transition','camera','language'):
        if before.get(key)!=after.get(key):out.append(f'{key.capitalize()}: {before.get(key)} → {after.get(key)}')
    if before.get('brand')!=after.get('brand'):out.append('Brand changed')
    if before.get('sound')!=after.get('sound'):out.append('Sound settings changed')
    for sid,(i,s) in new.items():
        if sid not in old:out.append(f'Added scene {i+1}: {name(s)}')
        elif old[sid][1]!=s:out.append(f'Changed scene {i+1}: {name(s)}')
    for sid,(i,s) in old.items():
        if sid not in new:out.append(f'Removed {name(s)}')
    if [s['id'] for s in before.get('scenes',[]) if s['id'] in new]!=[s['id'] for s in after.get('scenes',[]) if s['id'] in old]:out.append('Scenes reordered')
    return out

def record(folder,info):
    write(folder,'claude-runs.json',read(folder,'claude-runs.json',[])+[info])

def make(folder,request,model='sonnet',status=say):
    """Claude Code directs the whole film from the creator's words: spec.md (scene by scene, with seconds), then film.json,
    then review stills of every scene, fixing what looks wrong."""
    folder=Path(folder);request=request.strip()
    if len(request)<8:raise ValueError('Describe the film in a sentence or two.')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    job=read(folder,'job.json');job['request']=request;write(folder,'job.json',job)
    saved=backup(folder,'make');before=load(folder);started=time.time()
    task=['You are the director and motion designer of a short film in Motion Studio. The creator asks:','',request,'',*rules(folder),'',
        'Work in this order:',
        f'1. Write {folder.resolve()}/spec.md: the production spec, as described in the guide (who/where/length, the look with hex colours and style, '
        'every scene with its seconds, exact on-screen words, what moves and why, sound, rules, "Check before posting"). This is what the creator reads.',
        f'2. Write {folder.resolve()}/film.json that follows the spec exactly (keep "format" as it is unless the creator asked for another; brand name; '
        'scene ids s1, s2, …). Use the creator\'s uploaded logo as brand.logo when there is one.',
        f'3. Run check and fix every warning. Then run check --stills, Read every still and fix anything that looks wrong (cut-off or crowded text, '
        'too small to read on a phone, weak hierarchy, a scene that looks empty). Check again until clean.',
        'Finish with two or three plain sentences for the creator: what the film says, how long it is, and what they should check before posting.']
    result=graphics.run_claude(['\n'.join(task),'--model',model,*permissions(folder)],ROOT,status,'Claude is planning your film',
                               log=folder/'claude.log',timeout=int(float(setting('FILMS_MAKE_MINUTES','30'))*60),describe=describe)
    moved=quarantine_broken(started)
    film,warn=save(folder,load(folder))
    summary=(result.get('result') or '').strip()
    if film==check_film(before,folder)[0] and not (folder/'spec.md').exists():
        raise RuntimeError('Claude Code finished without writing the film. Its note: '+summary[-1500:])
    info={'kind':'make','request':request,'model':model,'started':started,'finished':time.time(),'summary':summary,'backup':saved,
          'changes':changes(before,film),'warnings':warn+[f'The custom scene {m} did not pass its check and was set aside.' for m in moved]}
    record(folder,info);return info

def send(folder,text,model='sonnet',status=say):
    """One chat message: Claude Code (the same session as the last message) edits film.json in place; the preview reloads
    as soon as the file changes. Every message that changed something can be undone."""
    folder=Path(folder);text=text.strip()
    if not text:raise ValueError('Write what you want changed.')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    chat=read(folder,'chat.json',{'messages':[],'session':None})
    saved=backup(folder,'chat');before=load(folder);started=time.time()
    chat['messages'].append({'role':'user','text':text,'time':started});write(folder,'chat.json',chat)
    first=not chat.get('session')
    ask=(['You are editing a short film in Motion Studio together with the creator, who watches the live preview while you work.',
          *rules(folder),'',
          'In this chat: make exactly the change the creator asks, nothing else. Read film.json, change it with small Edit calls, run check and fix '
          'warnings. Render stills (check --stills --scenes N) only when your change affects layout, and look at them. If a request is unclear, '
          'ask one short question instead of guessing. Reply in one or two short sentences in the creator\'s language (Amharic or English, as they '
          'wrote): what you changed, or your question. No JSON, no lists of fields.','',
          'The creator says: '+text] if first else
         ['The creator says: '+text,'(film.json may have changed since your last turn, by hand in the editor: Read it again before editing.)'])
    error=None;result={}
    try:
        result=graphics.run_claude(['\n'.join(ask),'--model',model,*permissions(folder)],ROOT,status,'Claude is reading your message',
                                   log=folder/'claude.log',timeout=int(float(setting('FILMS_CHAT_MINUTES','10'))*60),
                                   keep=True,resume=chat.get('session'),describe=describe)
    except Cancelled:raise
    except Exception as e:error=e
    moved=quarantine_broken(started)
    film,warn=save(folder,load(folder));diff=changes(before,film)
    if result.get('session_id'):chat['session']=result['session_id']
    changed=bool(diff) or (folder/'.undo'/saved/'spec.md').exists() and (folder/'spec.md').read_text()!=(folder/'.undo'/saved/'spec.md').read_text()
    if not changed:shutil.rmtree(folder/'.undo'/saved,ignore_errors=True)
    answer={'role':'assistant','text':(result.get('result') or '').strip(),'changes':diff,'warnings':warn+[f'The custom scene {m} did not pass its check and was set aside.' for m in moved],
            'backup':saved if changed else None,'time':time.time()}
    if error is not None:answer['error']=str(error)
    chat=read(folder,'chat.json',chat);chat['messages'].append(answer)
    if result.get('session_id'):chat['session']=result['session_id']
    write(folder,'chat.json',chat)
    if changed:record(folder,{'kind':'chat','request':text,'model':model,'started':started,'finished':time.time(),'summary':answer['text'],'backup':saved,'changes':diff})
    if error is not None and not changed:raise error
    return answer

def clear_chat(folder):
    """Start a new conversation (Claude forgets it; the film stays as it is)."""
    write(folder,'chat.json',{'messages':[],'session':None})

# ---- CLI -----------------------------------------------------------------------------------------------------------

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter);sub=p.add_subparsers(dest='cmd',required=True)
    c=sub.add_parser('new');c.add_argument('title');c.add_argument('--format',default='portrait',choices=list(FORMATS));c.add_argument('--starter');c.add_argument('--language',default='en',choices=LANGUAGES)
    c=sub.add_parser('make');c.add_argument('job');c.add_argument('request');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('chat');c.add_argument('job');c.add_argument('message');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('check');c.add_argument('job');c.add_argument('--stills',action='store_true');c.add_argument('--scenes',default='');c.add_argument('--at',type=float)
    c=sub.add_parser('render');c.add_argument('job');c.add_argument('--final',action='store_true')
    c=sub.add_parser('undo');c.add_argument('job')
    sub.add_parser('scenes');sub.add_parser('starters');sub.add_parser('icons')
    c=sub.add_parser('scene-check');c.add_argument('id')
    a=p.parse_args()
    try:
        if a.cmd=='new':print('JOB:',create(a.title,a.format,a.starter,language=a.language).name);return 0
        if a.cmd=='scenes':print(scene_summary());return 0
        if a.cmd=='starters':[print(f"- {s['id']}: {s['title']} · {s['description']}") for s in starters()];return 0
        if a.cmd=='icons':print(', '.join(catalog()['icons']));return 0
        if a.cmd=='scene-check':ok,report=scene_check(a.id);print(('OK. ' if ok else 'NOT OK. ')+report);return 0 if ok else 1
        folder=job_folder(a.job)
        if a.cmd=='make':info=make(folder,a.request,a.model);print(info['summary']);[print('WARNING:',w) for w in info['warnings']]
        elif a.cmd=='chat':print(json.dumps(send(folder,a.message,a.model),ensure_ascii=False,indent=1))
        elif a.cmd=='undo':print('Undone:',undo(folder).get('request'))
        elif a.cmd=='check':
            film,warn=save(folder,load(folder))
            print(f"{len(film['scenes'])} scenes, {film_frames(film)/FPS:.1f}s, {film['format']} {'x'.join(map(str,FORMATS[film['format']]))}")
            print('\n'.join('WARNING: '+w for w in warn) or 'No warnings.')
            if a.stills:
                nums=[int(x) for x in re.findall(r'\d+',a.scenes)] or None
                for s in stills(folder,nums,a.at,status=lambda m,p=None:None):print('STILL:',s)
                print('Read each still and fix what looks wrong.')
        elif a.cmd=='render':out,warn=render(folder,a.final);[print('WARNING:',w) for w in warn];print(out)
    except (ValueError,RuntimeError) as e:print(e,file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
