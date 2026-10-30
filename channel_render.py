"""Shots and the render for Channel videos. Claude plans scenes.json: each shot starts at a phrase of a paragraph
("p": paragraph id, "at": the first words it starts on), so a shot stays with its words when other paragraphs change.
check_scenes turns that into timed shots (shots.json) from words.json; gather finds the footage (channel_media); the
render is the Faceless composition (motion/src/faceless) at 1920×1080, or 1080×1920 for a short cut from the video."""
from pathlib import Path
import hashlib,json,math,re,shutil,time
import channel_media as media
import films,shorts
from shorts import FPS,Cancelled,finished,say,spawn

SIZES={'landscape':(1920,1080),'portrait':(1080,1920)}
KINDS=['stock','graphic','image','ai_clip','chapter']
MOTIONS=['push','pull','left','right','still']
MIN_SHOT,SHORT_SHOT,LONG_SHOT=1.2,2.5,12.  # seconds: dropped below, warned below, warned above
LEAD=.12   # a shot starts this much before its first word
TAIL=1.5   # seconds after the last word
BACKDROPS=films.BACKDROPS

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def write(folder,name,data):
    tmp=Path(folder)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(folder)/name)

def tokens(text):return re.findall(r"[a-z0-9]+",text.lower().replace("'",''))

def locate(words,at):
    """Index of the word where the phrase `at` starts in a paragraph's words (-1 when it is not there)."""
    want=tokens(at)
    if not want:return 0
    seq=[(tokens(w['text']) or [''])[0] for w in words]
    for n in (len(want),min(3,len(want)),min(2,len(want))):
        for i in range(len(seq)-n+1):
            if seq[i:i+n]==want[:n]:return i
    return -1

def text(v,limit):return re.sub(r'\s+',' ',str(v or '')).strip()[:limit]

def check_scenes(folder,budget=None,art=None):
    """Clean scenes.json and time every shot from words.json. Returns (shots, warnings); writes shots.json.
    art: {'mascot': the channel has a mascot image, 'stock': stock footage is part of the look}."""
    art=art or {'mascot':False,'stock':True}
    folder=Path(folder);data=read(folder,'scenes.json') or {'shots':[]};words=read(folder,'words.json')
    if not words:raise ValueError('Voice the script first: shots follow the timing of the voice-over.')
    paras={}
    for w in words['words']:paras.setdefault(w['p'],[]).append(w)
    titles={s['id']:s.get('title','') for s in words.get('sections',[])};psec={p['id']:p['section'] for p in words.get('paragraphs',[])}
    cat=films.catalog()['scenes'];warn=[];clean=[];seen=set();timed=[]
    for i,raw in enumerate(data.get('shots') or []):
        if not isinstance(raw,dict):continue
        sid=text(raw.get('id'),24)
        if not re.fullmatch(r'[A-Za-z0-9_-]+',sid) or sid in seen:sid=next(f'sh{n}' for n in range(1,9999) if f'sh{n}' not in seen)
        seen.add(sid);kind=raw.get('kind') if raw.get('kind') in KINDS else 'stock';p=str(raw.get('p',''))
        label=f'Shot {sid}'
        if p not in paras:warn.append(f'{label}: paragraph {p or "?"} is not in the voice-over (dropped).');continue
        shot={'id':sid,'p':p,'at':text(raw.get('at'),120),'kind':kind}
        if kind=='stock':
            shot['query']=text(raw.get('query'),80)
            if not shot['query']:warn.append(f'{label}: a stock shot needs a search query (dropped).');continue
        elif kind=='graphic':
            meta=cat.get(raw.get('template'))
            if not meta:warn.append(f'{label}: there is no scene template "{raw.get("template")}" (dropped).');continue
            fields={f['key']:f for f in meta['fields']};props=raw.get('props') if isinstance(raw.get('props'),dict) else {}
            shot.update(template=raw['template'],props={k:films.clean_value(fields[k],v) for k,v in props.items() if k in fields})
            if not any(fields[k]['type'] in ('text','longtext','list') for k in shot['props']):
                warn.append(f'{label}: give the graphic its own words in props, or it shows the template\'s sample text.')
        elif kind in ('image','ai_clip'):
            shot['prompt']=text(raw.get('prompt'),600);shot['query']=text(raw.get('query'),80)
            if not shot['prompt']:warn.append(f'{label}: an AI {kind.replace("_"," ")} needs a prompt (dropped).');continue
            if raw.get('mascot'):
                shot['mascot']=True  # kept in the plan; drawn once the channel has a mascot
                if not art.get('mascot'):warn.append(f'{label}: the channel has no mascot yet, so it is drawn without one.')
            if kind=='ai_clip':shot['animate']=text(raw.get('animate'),300)
        elif kind=='chapter':shot['title']=text(raw.get('title') or titles.get(psec.get(p),''),80)
        if kind in ('stock','image','ai_clip'):shot['motion']=raw.get('motion') if raw.get('motion') in MOTIONS else 'push'
        if raw.get('note'):shot['note']=text(raw.get('note'),200)
        clean.append(shot)
        at=locate(paras[p],shot['at'])
        if at<0:warn.append(f'{label}: "{shot["at"]}" is not in paragraph {p}; it starts with the paragraph.');at=0
        timed.append({**shot,'start':max(0.,paras[p][at]['start']-LEAD)})
        if not art.get('mascot'):timed[-1].pop('mascot',None)
    write(folder,'scenes.json',{'shots':clean})
    timed.sort(key=lambda s:s['start'])
    out=[]
    for s in timed:
        if out and s['start']-out[-1]['start']<MIN_SHOT:warn.append(f'Shot {s["id"]} starts {s["start"]-out[-1]["start"]:.1f} s after shot {out[-1]["id"]}: too close, skipped.');continue
        out.append(s)
    if out:out[0]['start']=0.
    end=words['duration']+TAIL
    for i,s in enumerate(out):
        s['end']=round(out[i+1]['start'] if i+1<len(out) else end,3);s['start']=round(s['start'],3)
        d=s['end']-s['start']
        if d<SHORT_SHOT:warn.append(f'Shot {s["id"]} lasts only {d:.1f} s.')
        if s['kind']=='chapter' and d>4.5:warn.append(f'Chapter card {s["id"]} stays {d:.0f} s: start the next shot about 3 s after it.')
        if d>LONG_SHOT and s['kind'] not in ('graphic','chapter'):warn.append(f'Shot {s["id"]} lasts {d:.0f} s: split it so the picture changes every few seconds.')
    run=0
    for s in out:
        run=run+1 if s['kind']=='stock' else 0
        if run==4:warn.append(f'Four stock shots in a row up to {s["id"]}: put a graphic in between.')
    if budget is not None:
        left=budget;ai=[s for s in out if s['kind'] in ('image','ai_clip')]
        for s in ai:
            cost=media.cost_of(s['kind'])
            if cost>left+1e-9:
                why='AI visuals are off for this video (no FAL_KEY, or no AI budget left)' if budget<=0 else 'over the AI budget'
                warn.append(f'Shot {s["id"]}: {why}; shown as stock footage instead.' if s.get('query') and art.get('stock') else f'Shot {s["id"]}: {why}; its words are shown instead.')
                s['fallback']=True
            else:left-=cost
    if not out:warn.append('No shots yet.')
    write(folder,'shots.json',{'shots':out,'duration':round(end,3),'checked':time.time()});return out,warn

# ---- gather the footage ----------------------------------------------------------------------------------------------

def full_prompt(shot,art):
    """What the image model is asked: the shot's scene, the mascot instruction, and the channel's art style."""
    parts=[shot['prompt'].rstrip('. ')+'.']
    if shot.get('mascot'):parts.append('The character from the reference image appears in this scene: keep its exact design, colours and proportions.')
    if (art or {}).get('prompt'):parts.append('Style: '+art['prompt'])
    return ' '.join(parts)

def mascot_tag(art):
    m=(art or {}).get('mascot')
    return f'{m}:{Path(m).stat().st_mtime}' if m and Path(m).exists() else ''

def key_of(shot,size,art=None):
    if shot['kind'] in ('image','ai_clip') and not shot.get('fallback'):
        what=[full_prompt(shot,art),shot.get('animate',''),mascot_tag(art) if shot.get('mascot') else '']
    else:what=shot.get('query','')
    return hashlib.sha1(json.dumps([shot['kind'] if not shot.get('fallback') else 'stock',what,list(size)]).encode()).hexdigest()[:12]

def needs(shot):
    """What a shot needs from outside: stock, ai (paid) or nothing (drawn in code)."""
    if shot['kind'] in ('graphic','chapter'):return None
    if shot['kind']=='stock' or shot.get('fallback'):return 'stock'
    return 'ai'

def plan_costs(folder,shots,size='landscape',art=None,name='visuals.json'):
    """AI images and clips still to make, and what they would cost."""
    vis=read(folder,name,{});todo=[]
    for s in shots:
        if needs(s)=='ai' and vis.get(s['id'],{}).get('key')!=key_of(s,SIZES[size],art):todo.append({'id':s['id'],'kind':s['kind'],'usd':media.cost_of(s['kind'])})
    return {'todo':todo,'usd':round(sum(t['usd'] for t in todo),3)}

def gather(folder,shots,have,budget,status=say,spend=0.,size='landscape',name='visuals.json',art=None):
    """Find footage for every shot that has none for its current words: stock always (free); AI images and clips only
    within `spend` (what the creator approved) and the budget left. art: the channel's style prompt and mascot image.
    Returns a summary."""
    folder=Path(folder);vis=read(folder,name,{});dims=SIZES[size];sub='stock' if size=='landscape' else 'stock-portrait'
    used={v.get('source_id') for k,v in vis.items() if isinstance(v,dict)}
    left=min(float(spend),max(0.,budget-media.spent(folder)));made=0;missing=[];errors=[]
    stock_ok=have.get('pexels') or have.get('pixabay')
    for i,s in enumerate(shots):
        kind=needs(s)
        if not kind:continue
        k=key_of(s,dims,art);cur=vis.get(s['id'],{})
        if cur.get('key')==k and (folder/cur.get('file','-')).exists():continue
        status(f'Finding footage for shot {i+1} of {len(shots)}',i/max(1,len(shots)))
        try:
            if kind=='stock':
                if not stock_ok:missing.append(s['id']);continue
                q=s.get('query') or ''
                if not q:missing.append(s['id']);continue
                cands=media.search(q,'portrait' if size=='portrait' else 'landscape',status,have)
                c=media.pick(cands,s['end']-s['start']+.5,used-{cur.get('source_id')})
                if not c:missing.append(s['id']);continue
                file=f'assets/{sub}/{s["id"]}-{k[:8]}.mp4'
                secs=media.fetch_clip(c,folder/file,s['end']-s['start']+.5,dims,status)
                vis[s['id']]={'key':k,'kind':'stock','file':file,'seconds':secs,'source_id':c['id'],'provider':c['provider'],'credit':c['credit'],
                              'page':c['page'],'query':q,'candidates':[{x_k:x[x_k] for x_k in ('id','provider','thumb','page','credit','duration')} for x in cands[:8]]}
                used.add(c['id'])
            else:
                if not have.get('fal'):missing.append(s['id']);continue
                cost=media.cost_of(s['kind'])
                if cost>left+1e-9:missing.append(s['id']);continue
                ext='png' if s['kind']=='image' else 'mp4';file=f'assets/ai/{s["id"]}-{k[:8]}.{ext}'
                refs=[(art or {})['mascot']] if s.get('mascot') and (art or {}).get('mascot') else []
                prompt=full_prompt(s,art);media.charge(folder,s['kind'],cost,s['prompt']);left-=cost
                if s['kind']=='image':media.ai_image(prompt,folder/file,dims,status,refs);secs=None
                else:secs=media.ai_clip(prompt,s.get('animate'),folder/file,dims,status,refs)
                vis[s['id']]={'key':k,'kind':s['kind'],'file':file,'seconds':secs,'provider':'fal.ai','prompt':s['prompt'],'mascot':bool(refs)};made+=1
        except Cancelled:raise
        except Exception as e:errors.append(f'Shot {s["id"]}: {e}');missing.append(s['id'])
        write(folder,name,vis)
    live={v['file'] for v in vis.values() if isinstance(v,dict) and v.get('file')}
    for d in (folder/'assets'/sub,folder/'assets'/'ai'):
        for f in d.glob('*') if d.exists() else []:
            if f'assets/{d.name}/{f.name}' not in live and f.suffix in ('.mp4','.png'):f.unlink(missing_ok=True)
    keep={s['id'] for s in shots}
    vis={k:v for k,v in vis.items() if k in keep}
    vis['ready']=not missing;write(folder,name,vis)
    return {'missing':missing,'errors':errors,'ai_made':made,'spent':media.spent(folder)}

def swap(folder,shots,shot_id,candidate,have,size='landscape',name='visuals.json',art=None):
    """Use another stock candidate for one shot (the creator picked it in the editor)."""
    folder=Path(folder);vis=read(folder,name,{});cur=vis.get(shot_id)
    s=next((x for x in shots if x['id']==shot_id),None)
    if not s or not cur or cur.get('kind')!='stock':raise ValueError('Only stock shots can be swapped.')
    cands=media.search(cur['query'],'portrait' if size=='portrait' else 'landscape',say,have)
    c=next((x for x in cands if x['id']==candidate),None)
    if not c:raise ValueError('That clip is no longer offered; search again.')
    k=key_of(s,SIZES[size],art);file=f'assets/{"stock" if size=="landscape" else "stock-portrait"}/{shot_id}-{c["id"][-8:]}.mp4'
    secs=media.fetch_clip(c,folder/file,s['end']-s['start']+.5,SIZES[size])
    if cur.get('file')!=file:(folder/cur['file']).unlink(missing_ok=True)
    cur.update(key=k,file=file,seconds=secs,source_id=c['id'],provider=c['provider'],credit=c['credit'],page=c['page']);write(folder,name,vis);return cur

def credits(folder):
    """Stock footage credits for the description, one per clip used."""
    vis=read(folder,'visuals.json',{});seen=[]
    for v in vis.values():
        if isinstance(v,dict) and v.get('kind')=='stock' and v.get('credit') and v['credit'] not in seen:seen.append(v['credit'])
    return seen

# ---- render ----------------------------------------------------------------------------------------------------------

def music_file(folder,profile):
    """The channel's music bed, copied into the video folder so the renderer can read it."""
    name=(profile.get('look') or {}).get('music')
    src=Path(__file__).resolve().parent/'runs'/'channel'/'music'/name if name else None
    if not src or not src.exists():return None
    dst=Path(folder)/('music'+src.suffix.lower())
    if not dst.exists() or dst.stat().st_mtime<src.stat().st_mtime:shutil.copy2(src,dst)
    return dst.name

def sound_levels(folder,ref_file):
    """Whoosh and pop from the Shorts sound library, levelled under the voice."""
    sounds={}
    try:
        ref=films.voice_rms(folder,ref_file)
        for name,(file,peak,rms,top) in films.levels(folder,['whoosh','pop']).items():
            gain=min(1.,ref*10**((films.REL_DB[name]-4)/20)/max(1e-4,rms),.5/max(1e-4,top))
            sounds[name]={'file':file,'peak':round(peak,3),'gain':round(gain,3)}
    except Exception:pass
    return sounds

def props(folder,profile,size='landscape',span=None,base=None,name='visuals.json'):
    """Render props for the Faceless composition. span=(start, end) seconds renders only that part (a short)."""
    folder=Path(folder);shots=read(folder,'shots.json',{}).get('shots',[]);vis=read(folder,name,{})
    words=read(folder,'words.json');look=profile.get('look') or {}
    if not words:raise ValueError('Voice the script first.')
    lo,hi=span if span else (0.,read(folder,'shots.json',{}).get('duration') or words['duration']+TAIL)
    out=[]
    for s in shots:
        a,b=max(s['start'],lo),min(s['end'],hi)
        if b-a<.05:continue
        v=vis.get(s['id']) if isinstance(vis.get(s['id']),dict) else {}
        kind='chapter' if s['kind']=='chapter' else 'graphic' if s['kind']=='graphic' else ('image' if v.get('kind')=='image' else 'video') if v.get('file') else 'text'
        shot={'id':s['id'],'kind':kind,'from':round((a-lo)*FPS),'frames':max(1,round((b-a)*FPS)),'motion':s.get('motion','push'),'offset':round((a-s['start'])*FPS)}
        if kind in ('video','image'):shot.update(file=v['file'],seconds=v.get('seconds'))
        if kind=='graphic':shot.update(template=s['template'],props=s.get('props',{}))
        if kind=='chapter':
            n=sum(1 for x in shots if x['kind']=='chapter' and x['start']<=s['start'])
            shot.update(title=s.get('title',''),number=n)
        if kind=='text':shot['text']=' '.join(w['text'] for w in words['words'] if a<=w['start']<b)[:160]
        out.append(shot)
    for i,s in enumerate(out[:-1]):s['frames']=out[i+1]['from']-s['from']  # no gaps from rounding
    total=max(FPS,round((hi-lo)*FPS))
    if out:out[-1]['frames']=total-out[-1]['from']
    music=music_file(folder,profile)
    w,h=SIZES[size]
    return {'fps':FPS,'width':w,'height':h,'durationInFrames':total,'base':base,'voice':'voice.wav','voiceFrom':round(lo*FPS),
            'music':music,'musicVolume':float(look.get('music_volume',.12) or .12),'style':look.get('style','glass'),'mode':look.get('mode','dark'),
            'accent':look.get('accent','#6EC1FF'),'accent2':look.get('accent2','#B79CFF'),'backdrop':look.get('backdrop','aurora'),
            'shots':out,'sounds':sound_levels(folder,'voice.wav'),'captions':None}

def render(folder,profile,final=False,status=say,size='landscape',span=None,out_name=None,name='visuals.json'):
    """Draft (half size) or final MP4 in renders/ (Remotion + installed Chrome, on this Mac)."""
    folder=Path(folder);shorts.need_motion();films.sync()
    data=props(folder,profile,size,span,name=name);prop_file=folder/(('short-' if span else '')+'render-props.json')
    prop_file.write_text(json.dumps(data,ensure_ascii=False))
    out_name=out_name or ('final.mp4' if final else 'draft.mp4');(folder/'renders').mkdir(exist_ok=True);partial=folder/'renders'/('.rendering-'+out_name)
    cmd=['npx','remotion','render','src/index.ts','Faceless',str(partial),'--props',str(prop_file),'--public-dir',str(folder),
         '--codec','h264','--crf','18' if final else '23','--log','info']+shorts.browser_args()+([] if final else ['--scale','0.5'])
    label=('Rendering the final video (full quality)' if final else 'Rendering a quick draft (half size)') if not span else 'Rendering the short'
    status(label,0);proc=spawn(cmd,status,shorts.MOTION);tail=[]
    for line in proc.stdout:
        line=line.strip();tail=(tail+[line])[-15:]
        done=re.match(r'(Rendered|Encoded) (\d+)/(\d+)',line)
        if done:status(label,(.85 if done[1]=='Rendered' else .15)*int(done[2])/max(1,int(done[3]))+(.85 if done[1]=='Encoded' else 0))
    if finished(proc,status):raise RuntimeError('Render failed:\n'+'\n'.join(tail))
    partial.replace(folder/'renders'/out_name)
    if not span:
        try:shorts.thumbnail(folder/'renders'/out_name,folder/'thumb.jpg')
        except Exception:pass
    return folder/'renders'/out_name
