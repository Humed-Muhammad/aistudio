"""9:16 shorts editor: cut a raw recording down to what matters, then add captions, motion graphics,
zooms and images that follow hands/face. Local except the optional Claude cut/graphics planners.
Speech is never regenerated: the cut only removes parts of the original audio.

  python shorts.py prepare VIDEO [--preset bold|minimal|boxed|none]   # transcribe the full recording
  python shorts.py cut JOB [--auto] [--notes TEXT] [--file CUT.json] [--apply]
  python shorts.py plan JOB [--auto] [--notes TEXT] [--file PLAN.json]
  python shorts.py render JOB [--final]
"""
from pathlib import Path
from fractions import Fraction
from typing import Literal
import json,subprocess,shutil,wave,base64,os
import av,numpy as np
from pydantic import BaseModel,Field
from config import ROOT,setting
FPS=30;MOTION=ROOT/'motion'
PRESETS=['bold','minimal','boxed','none']
SOUNDS=['whoosh','whip','pop','ding','switch','mouse-click','shutter-modern','vine-boom','record-scratch','page-turn','anime-wow','yippee']
GESTURES=['open_palm','fist','point','pinch','peace','thumbs_up','rock']

class Event(BaseModel):
    """One timeline item. Fields that do not apply to a type are ignored."""
    type:Literal['text','sticker','zoom','shake','flash','sfx']
    start:float=Field(description='seconds')
    end:float=Field(description='seconds; for flash/sfx use start+0.3')
    text:str=Field('',description='text: words to show; keep to 1-5 words')
    style:Literal['pop','slide','type']='pop'
    color:str=Field('#FFFFFF',description='text color as hex')
    background:Literal['none','pill']='none'
    size:float=Field(1.0,description='text: 1 = 96px headline. sticker: 1 = one hand length (hand anchor) or full frame width x 0.3 (screen/face anchor)')
    x:float=Field(0.5,description='screen anchor / text: horizontal centre 0-1')
    y:float=Field(0.3,description='screen anchor / text: vertical centre 0-1')
    behind_subject:bool=Field(False,description='text only: place behind the person (person cutout drawn on top)')
    asset:str=Field('',description='sticker: uploaded image filename from assets/')
    emoji:str=Field('',description='sticker: emoji to use when no asset')
    anchor:Literal['screen','hand','face']='screen'
    hand:Literal['any','left','right']=Field('any',description='screen side of the hand as seen by the viewer')
    point:Literal['palm','above_palm','fingertip','above_head','beside_face']='above_palm'
    trigger:Literal['time','open_palm','fist','point','pinch','peace','thumbs_up','rock']=Field('time',description='hand stickers: appear on first matching gesture inside start-end')
    animation:Literal['pop','spin','drop','fade']='pop'
    idle:Literal['float','pulse','spin','none']='float'
    scale:float=Field(1.2,description='zoom: 1.05 subtle to 1.4 strong punch-in')
    focus:Literal['face','center']='face'
    intensity:float=Field(1.0,description='shake strength 0.3-2')
    sound:Literal['whoosh','whip','pop','ding','switch','mouse-click','shutter-modern','vine-boom','record-scratch','page-turn','anime-wow','yippee']='whoosh'
    volume:float=0.5

class Plan(BaseModel):
    caption_preset:Literal['bold','minimal','boxed','none']='bold'
    caption_y:float=Field(0.72,description='vertical centre of captions 0-1; keep clear of face and hand graphics')
    highlight_color:str='#FFE14D'
    progress_bar:bool=False
    events:list[Event]=[]
    notes:str=Field('',description='one short paragraph explaining the edit choices to the creator')

FILLERS={'um','umm','uh','uhh','uhm','er','erm','ah','ahh','hmm','mm','mhm'}
SR=48000;PAD_IN=.06;PAD_OUT=.12  # audio rate and breathing room kept around each cut

class CutPlan(BaseModel):
    keep:list[int]=Field(description='ids of transcript parts to keep, in playback order')
    tighten:bool=Field(True,description='also remove filler words and shorten pauses longer than max_pause')
    max_pause:float=.35
    removed:list[dict]=[]  # [{"id":3,"why":"retake"}] shown to the creator
    summary:str=''

class Removal(BaseModel):
    id:int
    why:str=Field(description='2-6 words, e.g. "retake of part 4", "repeats point", "tangent", "dead air"')

class CutDecision(BaseModel):
    keep:list[int]=Field(description='ids of parts to keep, in playback order (normally ascending)')
    removed:list[Removal]
    summary:str=Field(description='one or two sentences for the creator: what the short is about and what was cut')

# Planner-facing schema: one compact event per effect with every field required. Structured outputs
# reject schemas with too many optional fields, which the all-in-one Event has; to_plan() converts back.
Num=float
class PText(BaseModel):
    type:Literal['text'];start:Num;end:Num
    text:str=Field(description='1-5 words');style:Literal['pop','slide','type'];color:str=Field(description='hex, e.g. #FFFFFF')
    background:Literal['none','pill'];size:Num=Field(description='1 = 96px headline');x:Num;y:Num=Field(description='vertical centre 0-1')
    behind_subject:bool
class PSticker(BaseModel):
    type:Literal['sticker'];start:Num;end:Num
    asset:str=Field(description='uploaded image filename, or empty to use emoji');emoji:str
    anchor:Literal['screen','hand','face'];hand:Literal['any','left','right']=Field(description='screen side of the hand')
    point:Literal['palm','above_palm','fingertip','above_head','beside_face'];trigger:Literal['time','open_palm','fist','point','pinch','peace','thumbs_up','rock']
    animation:Literal['pop','spin','drop','fade'];idle:Literal['float','pulse','spin','none']
    size:Num=Field(description='hand: 1 = one hand length; screen/face: 1 = 30% of frame width');x:Num=Field(description='screen anchor only');y:Num=Field(description='screen anchor only')
class PZoom(BaseModel):
    type:Literal['zoom'];start:Num;end:Num;scale:Num=Field(description='1.05-1.4');focus:Literal['face','center']
class PShake(BaseModel):
    type:Literal['shake'];start:Num;end:Num;intensity:Num=Field(description='0.3-2')
class PFlash(BaseModel):
    type:Literal['flash'];start:Num
class PSfx(BaseModel):
    type:Literal['sfx'];start:Num
    sound:Literal['whoosh','whip','pop','ding','switch','mouse-click','shutter-modern','vine-boom','record-scratch','page-turn','anime-wow','yippee'];volume:Num=Field(description='0.3-0.6')
class PlannerPlan(BaseModel):
    caption_preset:Literal['bold','minimal','boxed','none'];caption_y:Num=Field(description='captions vertical centre 0-1, clear of face and stickers')
    highlight_color:str;progress_bar:bool
    events:list[PText|PSticker|PZoom|PShake|PFlash|PSfx]
    notes:str=Field(description='one short paragraph explaining the edit choices to the creator')
    def to_plan(self):
        events=[Event(**{'end':e.start+.3,**e.model_dump()}) for e in self.events]
        return Plan(**{**self.model_dump(exclude={'events'}),'events':events})

def status_file(folder):return Path(folder)/'status.json'
def save_status(folder,state,message,**extra):
    data={'id':Path(folder).name,'kind':'shorts','state':state,'status':message,**extra}
    status_file(folder).write_text(json.dumps(data));return data

def normalize(src,dst):
    """Constant 30 fps, at most 1080 px wide; original audio packets copied unchanged."""
    with av.open(str(src)) as inp:
        vs=inp.streams.video[0]
        duration=float(vs.duration*vs.time_base) if vs.duration else float(inp.duration/av.time_base)
        limit=float(setting('SHORTS_MAX_SECONDS','600'))
        if duration>limit:raise ValueError(f'Use a clip of {limit/60:g} minutes or less (SHORTS_MAX_SECONDS).')
        frames=iter(inp.decode(video=0));cur=next(frames);nxt=next(frames,None)
        w,h=output_size(*upright(cur).size)
        if h<w:raise ValueError('This editor expects vertical (9:16) footage.')
        with av.open(str(dst),'w') as out:
            st=out.add_stream('libx264',rate=FPS);st.width,st.height,st.pix_fmt=w,h,'yuv420p';st.options={'crf':'17','preset':'medium'}
            ain=inp.streams.audio[0] if inp.streams.audio else None;aout=out.add_stream_from_template(ain) if ain else None
            count=round(duration*FPS)
            for i in range(count):
                t=i/FPS  # absolute timeline keeps the untouched audio in sync
                while nxt is not None and float(nxt.time)<=t:cur=nxt;nxt=next(frames,None)
                im=upright(cur);f=av.VideoFrame.from_image(im if im.size==(w,h) else im.resize((w,h)))
                f.pts=i;f.time_base=Fraction(1,FPS)
                for p in st.encode(f):out.mux(p)
            for p in st.encode():out.mux(p)
            if ain:
                inp.seek(0)
                for p in inp.demux(ain):
                    if p.dts is None:continue
                    p.stream=aout;out.mux(p)
    return {'frames':count,'fps':FPS,'width':w,'height':h,'duration':count/FPS}

def upright(frame):
    """Frame as an upright PIL image (phones store portrait video as rotated landscape)."""
    im=frame.to_image()
    return im.rotate(frame.rotation,expand=True) if frame.rotation else im

def probe(src):
    with av.open(str(src)) as inp:
        vs=inp.streams.video[0];first=next(inp.decode(video=0));w,h=upright(first).size
        duration=float(vs.duration*vs.time_base) if vs.duration else float(inp.duration/av.time_base)
        return {'duration':duration,'width':w,'height':h,'audio':bool(inp.streams.audio)}

def output_size(w,h):
    scale=min(1,1080/w);return int(w*scale)//2*2,int(h*scale)//2*2

def speech_wav(src,dst):
    """16 kHz mono for whisper.cpp."""
    with av.open(str(src)) as inp, wave.open(str(dst),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(16000)
        if not inp.streams.audio:return False
        rs=av.AudioResampler(format='s16',layout='mono',rate=16000)
        for f in inp.decode(audio=0):
            for r in rs.resample(f):out.writeframes(r.to_ndarray().tobytes())
        for r in rs.resample(None):out.writeframes(r.to_ndarray().tobytes())
    return True

def clean_captions(path):
    """Drop speaker dashes and sound annotations such as (upbeat music) or [Music]."""
    data=json.loads(Path(path).read_text());kept=[];skipping=False
    for c in data['captions']:
        word=c['text'].strip()
        if not skipping and word[:1] in '([*':skipping=True;closer={'(':')','[':']','*':'*'}[word[0]];word=word[1:]
        if skipping:
            skipping=not word.endswith(closer);continue
        if word.strip('-–—♪ '):kept.append(c)
    data['captions']=kept;Path(path).write_text(json.dumps(data,indent=1));return kept

def browser_args():
    """Remotion's bundled headless shell crashes on some macOS versions; prefer installed Chrome."""
    path=setting('SHORTS_BROWSER') or next((c for c in ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium'] if Path(c).exists()),'')
    return ['--browser-executable',path] if path else []

def need_motion():
    if not (MOTION/'node_modules').exists():raise ValueError('Install the renderer once: make shorts')

def check_tools():
    if not (ROOT/'.venv-face/bin/python').exists():raise ValueError('Hand/face tracking needs setup: make shorts')
    need_motion()

def refine_timing(captions,wav):
    """Pull word edges in to the actual voice: whisper stretches words across pauses."""
    with wave.open(str(wav)) as w:a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32768
    n=len(a)//160
    if not n:return captions
    env=np.sqrt((a[:n*160].reshape(n,160)**2).mean(1))  # 10 ms loudness
    thr=max(float(np.percentile(env,25))*2.5,float(env.max())*.03)
    for c in captions:
        s,e=int(c['startMs']//10),int(c['endMs']//10);loud=np.nonzero(env[s:e]>thr)[0]
        if len(loud):
            start=max(c['startMs'],(s+loud[0])*10-30);end=min(c['endMs'],(s+loud[-1])*10+60)
            if end-start>=80:c['startMs'],c['endMs']=int(start),int(end)
    return captions

def transcribe(src,folder,name='full-captions.json'):
    folder=Path(folder);wav=folder/'speech-16k.wav';out=folder/name
    if not speech_wav(src,wav):out.write_text(json.dumps({'language':None,'captions':[]}));return []
    subprocess.run(['node','transcribe.mjs',str(wav),str(out),setting('SHORTS_WHISPER_MODEL','small'),setting('SHORTS_LANGUAGE','auto')],cwd=MOTION,check=True)
    captions=clean_captions(out);data=json.loads(out.read_text());data['captions']=refine_timing(captions,wav)
    out.write_text(json.dumps(data,indent=1));return data['captions']

def is_filler(c):return c['text'].strip().lower().strip('.,!?;:"\'…-') in FILLERS

def make_units(captions):
    """Transcript parts the cut keeps or drops: sentences, split further at pauses."""
    units=[];cur=[]
    for i,c in enumerate(captions):
        cur.append(i);word=c['text'].strip();nxt=captions[i+1] if i+1<len(captions) else None
        gap=(nxt['startMs']-c['endMs'])/1000 if nxt else 99
        if word[-1:] in '.?!' or gap>.7 or (word[-1:] in ',;:' and gap>.3) or len(cur)>=35:
            units.append(cur);cur=[]
    return [{'id':k,'first':u[0],'last':u[-1],'start':captions[u[0]]['startMs']/1000,'end':captions[u[-1]]['endMs']/1000,
             'text':''.join(captions[i]['text'] for i in u).strip()} for k,u in enumerate(units)]

def load_cut(folder):return CutPlan.model_validate_json((Path(folder)/'cut.json').read_text())

def save_cut(folder,cut):
    if isinstance(cut,(str,bytes)):cut=CutPlan.model_validate_json(cut)
    elif isinstance(cut,dict):cut=CutPlan.model_validate(cut)
    units=json.loads((Path(folder)/'units.json').read_text())
    bad=[k for k in cut.keep if not 0<=k<len(units)]
    if bad:raise ValueError(f'Unknown transcript parts: {bad}')
    if len(set(cut.keep))!=len(cut.keep):raise ValueError('A part is kept twice.')
    cut.max_pause=min(max(cut.max_pause,.15),2.0)
    Path(folder,'cut.json').write_text(cut.model_dump_json(indent=1));return cut

def cut_ranges(cut,captions,units,duration):
    """Source time ranges to play, in order, each with the caption indices it carries."""
    words=[]
    for k in cut.keep:words+=[i for i in range(units[k]['first'],units[k]['last']+1) if not (cut.tighten and is_filler(captions[i]))]
    groups=[]
    for i in words:
        prev=groups[-1][-1] if groups else None
        joined=prev is not None and i==prev+1 and not (cut.tighten and (captions[i]['startMs']-captions[prev]['endMs'])/1000>cut.max_pause)
        # A skipped filler or dropped part breaks the group, so its audio is cut out.
        if joined:groups[-1].append(i)
        else:groups.append([i])
    ranges=[]
    for g in groups:
        a,b=g[0],g[-1]
        start=max(captions[a]['startMs']/1000-PAD_IN,captions[a-1]['endMs']/1000 if a else 0,0)
        end=min(captions[b]['endMs']/1000+PAD_OUT,captions[b+1]['startMs']/1000 if b+1<len(captions) else duration,duration)
        if ranges and abs(start-ranges[-1]['end'])<.02 and a==ranges[-1]['words'][-1]+1:ranges[-1]['end']=end;ranges[-1]['words']+=g
        elif end>start:ranges.append({'start':start,'end':end,'words':g})
    return ranges

def layout(ranges):
    """Snap ranges to whole output frames so video, audio and captions share one clock."""
    done=0;cum=0.
    for r in ranges:
        cum+=r['end']-r['start'];frames=round(cum*FPS)-done
        r.update(out=done/FPS,frames=frames);done+=frames
    return [r for r in ranges if r['frames']>0]

def cut_media(src,dst,ranges):
    """Join source ranges into a 30 fps video; audio is cut at the same points with 8 ms fades."""
    info=probe(src);w,h=output_size(info['width'],info['height'])
    if h<w:raise ValueError('This editor expects vertical (9:16) footage.')
    total=sum(r['frames'] for r in ranges)
    with av.open(str(dst),'w') as out:
        st=out.add_stream('libx264',rate=FPS);st.width,st.height,st.pix_fmt=w,h,'yuv420p';st.options={'crf':'17','preset':'medium'}
        ast=out.add_stream('aac',rate=SR,layout='stereo') if info['audio'] else None
        if ast:ast.bit_rate=192000
        index=0
        with av.open(str(src)) as vin:
            vs=vin.streams.video[0]
            for r in ranges:
                vin.seek(int(max(0,r['start']-1)/vs.time_base),stream=vs,backward=True)
                frames=vin.decode(vs);cur=next(frames);nxt=next(frames,None)
                for k in range(r['frames']):
                    t=r['start']+k/FPS
                    while nxt is not None and float(nxt.time)<=t:cur=nxt;nxt=next(frames,None)
                    im=upright(cur);f=av.VideoFrame.from_image(im if im.size==(w,h) else im.resize((w,h)))
                    f.pts=index;f.time_base=Fraction(1,FPS);index+=1
                    for p in st.encode(f):out.mux(p)
        for p in st.encode():out.mux(p)
        if ast:
            # Decode once from the start (as the transcript was): seeking shifts AAC timing by tens of ms.
            pcm=decode_audio(src);fade=int(.008*SR);ramp=np.linspace(0,1,fade,dtype=np.float32);written=0
            for r in ranges:
                need=r['frames']*SR//FPS;at=round(r['start']*SR)
                seg=pcm[:,at:at+need].astype(np.float32)/32768
                if seg.shape[1]<need:seg=np.pad(seg,((0,0),(0,need-seg.shape[1])))
                seg[:,:fade]*=ramp;seg[:,-fade:]*=ramp[::-1]
                for k in range(0,need,1024):
                    frame=av.AudioFrame.from_ndarray(np.ascontiguousarray(seg[:,k:k+1024]),format='fltp',layout='stereo')
                    frame.sample_rate=SR;frame.pts=written;frame.time_base=Fraction(1,SR);written+=frame.samples
                    for p in ast.encode(frame):out.mux(p)
            for p in ast.encode():out.mux(p)
    return {'frames':total,'fps':FPS,'width':w,'height':h,'duration':total/FPS}

def decode_audio(src):
    """Whole audio track as int16 stereo at SR, aligned so index 0 is time 0."""
    chunks=[];start=None
    with av.open(str(src)) as inp:
        rs=av.AudioResampler(format='s16p',layout='stereo',rate=SR)
        for f in inp.decode(audio=0):
            if start is None:start=max(0.,float(f.time or 0))
            chunks+=[x.to_ndarray() for x in rs.resample(f)]
        chunks+=[x.to_ndarray() for x in rs.resample(None)]
    pcm=np.concatenate(chunks,axis=1) if chunks else np.zeros((2,0),np.int16)
    return np.pad(pcm,((0,0),(round((start or 0)*SR),0)))

def remap_captions(captions,ranges):
    out=[]
    for r in ranges:
        end=r['start']+r['frames']/FPS
        for i in r['words']:
            c=captions[i]
            if is_filler(c):continue
            a=max(c['startMs']/1000,r['start']);b=min(c['endMs']/1000,end)
            if b>a:out.append({**c,'startMs':round((a-r['start']+r['out'])*1000),'endMs':round((b-r['start']+r['out'])*1000),'timestampMs':None})
    return out

def cut_summary(folder):
    """Kept duration and ranges for the current cut, without touching media."""
    folder=Path(folder);captions=json.loads((folder/'full-captions.json').read_text())['captions']
    units=json.loads((folder/'units.json').read_text());cut=load_cut(folder);info=json.loads((folder/'source-info.json').read_text())
    if not captions:return {'original':info['duration'],'kept':info['duration'],'parts':0,'kept_parts':0,'whole':True}
    ranges=layout(cut_ranges(cut,captions,units,info['duration']))
    whole=not cut.tighten and cut.keep==list(range(len(units)))
    return {'original':info['duration'],'kept':info['duration'] if whole else sum(r['frames'] for r in ranges)/FPS,'parts':len(units),'kept_parts':len(cut.keep),'jumps':len(ranges),'whole':whole}

def prepare(src,folder,preset='bold',status=print):
    """Step 1: check the recording and transcribe all of it so the cut can be chosen."""
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True);(folder/'assets').mkdir(exist_ok=True);check_tools()
    (folder/'workflow-mode.json').write_text(json.dumps({'mode':'shorts','preset':preset}))
    status('Reading video');info=probe(src)
    limit=float(setting('SHORTS_MAX_SECONDS','600'))
    if info['duration']>limit:raise ValueError(f'Use a recording of {limit/60:g} minutes or less (SHORTS_MAX_SECONDS).')
    if info['height']<info['width']:raise ValueError('This editor expects vertical (9:16) footage.')
    (folder/'source-info.json').write_text(json.dumps(info))
    status(f"Transcribing the full {info['duration']/60:.1f} min recording locally (whisper.cpp)")
    captions=transcribe(src,folder);units=make_units(captions)
    (folder/'units.json').write_text(json.dumps(units,indent=1))
    save_cut(folder,CutPlan(keep=[u['id'] for u in units]))
    status('Ready · choose what to keep')

def apply_cut(folder,status=print):
    """Step 2: build the edited video from the cut, then track it."""
    folder=Path(folder);check_tools();src=folder/'upload.mp4'
    captions=json.loads((folder/'full-captions.json').read_text())['captions'];units=json.loads((folder/'units.json').read_text())
    cut=load_cut(folder);info=json.loads((folder/'source-info.json').read_text())
    for stale in ['tracks.json','foreground.webm','tracking-preview.mp4','shorts-draft.mp4','shorts-final.mp4','plan.json','plan-warnings.json']:(folder/stale).unlink(missing_ok=True)
    shutil.rmtree(folder/'keyframes',ignore_errors=True)
    if not captions or (not cut.tighten and cut.keep==list(range(len(units)))):
        status('Keeping the whole recording · original audio untouched');meta=normalize(src,folder/'source.mp4')
        kept=[c for c in captions if not is_filler(c)];ranges=[]
    else:
        ranges=layout(cut_ranges(cut,captions,units,info['duration']))
        if not ranges:raise ValueError('The cut keeps nothing. Keep at least one part.')
        status(f'Cutting {len(ranges)} pieces from the recording');meta=cut_media(src,folder/'source.mp4',ranges)
        kept=remap_captions(captions,ranges)
    language=json.loads((folder/'full-captions.json').read_text()).get('language')
    (folder/'captions.json').write_text(json.dumps({'language':language,'captions':kept},indent=1))
    (folder/'cut-map.json').write_text(json.dumps([{k:r[k] for k in ['start','end','out','frames']} for r in ranges],indent=1))
    (folder/'manifest.json').write_text(json.dumps(meta,indent=2))
    status('Tracking hands, gestures, face and person cutout locally')
    subprocess.run([str(ROOT/'.venv-face/bin/python'),str(ROOT/'shorts_worker.py'),str(folder)],check=True)
    preset=json.loads((folder/'workflow-mode.json').read_text()).get('preset','bold')
    save_plan(folder,Plan(caption_preset=preset if preset in PRESETS else 'bold'))
    status(f"Cut ready · {meta['duration']:.0f}s · review tracking, then plan graphics")

CUT_SYSTEM="""You are a senior editor turning a raw talking recording into a tight short-form video.
You get the transcript split into numbered parts with timings. Decide which parts to keep.
Remove: retakes and false starts (keep only the best, usually the last complete take), repeated points, rambling or tangents that do not serve the main message, setup that never pays off, filler sentences, off-camera chatter ("is this recording?", "let me start again").
Keep: every distinct point that matters, the context needed to understand it, and the payoff/ending. Never cut in the middle of a thought; the kept parts read in order must sound natural and complete.
There is no target length: the result is as long as the substance needs. Usually that lands at 1-3 minutes, but never pad or cut substance to hit a number.
Keep the original order. Only if one part is an exceptionally strong standalone hook may you also place its id first.
Creator instructions override these defaults."""

def cut_context(folder,notes=''):
    units=json.loads((Path(folder)/'units.json').read_text());info=json.loads((Path(folder)/'source-info.json').read_text())
    lines=[f"Recording: {info['duration']/60:.1f} min, {len(units)} parts."]
    for u,nxt in zip(units,units[1:]+[None]):
        pause=f" (pause {nxt['start']-u['end']:.1f}s)" if nxt and nxt['start']-u['end']>=1 else ''
        lines.append(f"[{u['id']}] {u['start']:.1f}-{u['end']:.1f}s{pause}: {u['text']}")
    if notes.strip():lines.append('\nCreator instructions (follow these first):\n'+notes.strip())
    return '\n'.join(lines)

def cut_auto(folder,notes=''):
    """Ask Claude which transcript parts matter."""
    import anthropic
    client=anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY') or None)
    response=client.beta.messages.parse(
        model=setting('SHORTS_PLANNER_MODEL','claude-opus-5-5'),max_tokens=16000,
        betas=['server-side-fallback-2026-07-01'],fallbacks='default',system=CUT_SYSTEM,
        messages=[{'role':'user','content':cut_context(folder,notes)+'\n\nDecide what to keep.'}],
        output_format=CutDecision)
    if response.stop_reason=='refusal':raise RuntimeError('The editor declined this request.')
    decision=response.parsed_output
    if decision is None:raise RuntimeError(f'The editor returned no cut ({response.stop_reason}).')
    old=load_cut(folder)
    return save_cut(folder,CutPlan(keep=decision.keep,tighten=old.tighten,max_pause=old.max_pause,removed=[r.model_dump() for r in decision.removed],summary=decision.summary))

def load_plan(folder):
    path=Path(folder)/'plan.json'
    return Plan.model_validate_json(path.read_text()) if path.exists() else Plan()

def check_plan(plan,folder):
    """Clamp to the clip and report anything the renderer cannot honour."""
    folder=Path(folder);meta=json.loads((folder/'manifest.json').read_text());tracks=json.loads((folder/'tracks.json').read_text())
    duration=meta['duration'];warnings=[];kept=[]
    seen=lambda t:any(t)
    plan.caption_y=min(max(plan.caption_y,.1),.92)
    for e in plan.events:
        e.start=max(0,min(e.start,duration));e.end=max(e.start+1/FPS,min(e.end,duration))
        where=f'{e.type} at {e.start:.2f}s'
        if e.type=='sticker':
            if e.asset and not (folder/'assets'/e.asset).exists():warnings.append(f'{where}: image "{e.asset}" is not uploaded; skipped');continue
            if not e.asset and not e.emoji:warnings.append(f'{where}: needs an image or emoji; skipped');continue
            if e.anchor=='hand':
                sides=['left','right'] if e.hand=='any' else [e.hand]
                if not any(seen(tracks['hands'][s][round(e.start*FPS):round(e.end*FPS)+1]) for s in sides):warnings.append(f'{where}: no {e.hand} hand is tracked in this window; it will not appear')
            if e.anchor=='face' and not seen(tracks['face'][round(e.start*FPS):round(e.end*FPS)+1]):warnings.append(f'{where}: no face tracked in this window')
        if e.type=='text' and not e.text.strip():warnings.append(f'{where}: empty text; skipped');continue
        cover=tracks.get('person',[])[round(e.start*FPS):round(e.end*FPS)+1]
        if e.type=='text' and e.behind_subject and cover and sum(cover)/len(cover)>.55:warnings.append(f'{where}: the person fills ~{round(100*sum(cover)/len(cover))}% of the frame, so text behind them will be mostly hidden')
        kept.append(e)
    plan.events=sorted(kept,key=lambda e:e.start);return plan,warnings

def save_plan(folder,plan):
    if isinstance(plan,(str,bytes)):plan=Plan.model_validate_json(plan)
    elif isinstance(plan,dict):plan=Plan.model_validate(plan)
    plan,warnings=check_plan(plan,folder) if (Path(folder)/'tracks.json').exists() else (plan,[])
    Path(folder,'plan.json').write_text(plan.model_dump_json(indent=1))
    Path(folder,'plan-warnings.json').write_text(json.dumps(warnings))
    return plan,warnings

def runs(track,fps,label):
    """Contiguous runs of a value, as planner-readable lines."""
    out=[];start=None
    for i,v in enumerate(track+[None]):
        key=label(v)
        if start is not None and key!=cur:
            if i-start>=4 and cur:out.append(f'{start/fps:.2f}-{i/fps:.2f}s {cur}')
            start=None
        if start is None and key:start,cur=i,key
    return out

def planner_context(folder,notes=''):
    folder=Path(folder);meta=json.loads((folder/'manifest.json').read_text());tracks=json.loads((folder/'tracks.json').read_text())
    captions=json.loads((folder/'captions.json').read_text())['captions'];fps=tracks['fps']
    where=lambda v:f"{v[5]} ({['upper','middle','lower'][min(2,int(v[1]*3))]} third)" if v else None
    lines=[f"Clip: {meta['duration']:.2f}s, {meta['width']}x{meta['height']}, vertical.",
     f"Scene cuts at: {', '.join(f'{c/fps:.2f}s' for c in tracks['cuts']) or 'none'}",
     'Face visible: '+('; '.join(r.replace(' visible','') for r in runs(tracks['face'],fps,lambda v:'visible' if v else None)) or 'never')]
    if tracks.get('person'):lines.append('Person fills >55% of frame (avoid behind_subject text): '+('; '.join(r.replace(' close','') for r in runs(tracks['person'],fps,lambda v:'close' if v and v>.55 else None)) or 'never'))
    for side in ['left','right']:lines.append(f'{side} hand (screen side) gestures: '+('; '.join(runs(tracks['hands'][side],fps,where)) or 'not visible'))
    assets=sorted(p.name for p in (folder/'assets').iterdir() if p.suffix.lower() in ['.png','.jpg','.jpeg','.webp','.gif'])
    lines.append('Uploaded images (use exact filenames as asset): '+(', '.join(assets) or 'none'))
    lines.append('Transcript, [start s] word:\n'+' '.join(f"[{c['startMs']/1000:.2f}]{c['text'].strip()}" for c in captions) if captions else 'No speech detected.')
    if notes.strip():lines.append('Creator instructions (follow these first):\n'+notes.strip())
    images=[]
    frames=sorted((folder/'keyframes').glob('*.jpg'));frames=[frames[round(i*(len(frames)-1)/11)] for i in range(12)] if len(frames)>12 else frames
    for p in frames+[folder/'assets'/a for a in assets][:6]:
        media='image/png' if p.suffix.lower()=='.png' else 'image/webp' if p.suffix.lower()=='.webp' else 'image/gif' if p.suffix.lower()=='.gif' else 'image/jpeg'
        images+=[{'type':'text','text':('Uploaded image '+p.name) if p.parent.name=='assets' else f'Frame at {float(p.stem):.2f}s'},{'type':'image','source':{'type':'base64','media_type':media,'data':base64.standard_b64encode(p.read_bytes()).decode()}}]
    return '\n'.join(lines),images

PLANNER_SYSTEM="""You are a senior short-form video editor. You plan motion graphics for a vertical talking video that is rendered with Remotion from your JSON plan.
Style goals: retention-focused like top YouTube Shorts/TikTok creators, but never cluttered. One focal element at a time.
- Captions run automatically for every word; do not duplicate them as text events. Pick caption_preset unless the creator chose one, and place caption_y away from the face and from hand stickers.
- Hook: a short bold text in the first 1-2 s that teases the payoff.
- Emphasize key numbers, claims and punchlines with text pops (1-5 words), zoom punch-ins (1.1-1.3, 0.4-1.5 s) and the occasional flash or shake. Space emphasis 2-5 s apart.
- Put text behind_subject only when a large headline sits where the person overlaps it, for a premium look.
- Stickers anchored to a hand only where that hand is visible in the tracking data; prefer a gesture trigger matching what the hand does (e.g. open_palm to reveal an object on the palm). Hand left/right means screen side. Use uploaded images when they fit the words; use emoji stickers sparingly.
- Add sfx to roughly half of the visual hits (whoosh for slides/zooms, pop for stickers/text pops, ding for numbers); keep volume 0.3-0.6 under the voice.
- Use only times inside the clip, aligned to the word timestamps. Do not invent speech."""

def plan_auto(folder,notes='',preset=None):
    """Ask Claude for a plan from transcript, tracking summary, frames and uploaded images."""
    import anthropic
    text,images=planner_context(folder,notes)
    mode=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('preset')
    if preset or mode not in (None,'auto'):text+=f"\nCaption preset chosen by the creator: {preset or mode}"
    client=anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY') or None)
    response=client.beta.messages.parse(
        model=setting('SHORTS_PLANNER_MODEL','claude-opus-5-5'),max_tokens=16000,
        betas=['server-side-fallback-2026-07-01'],fallbacks='default',
        system=PLANNER_SYSTEM,
        messages=[{'role':'user','content':images+[{'type':'text','text':text+'\n\nReturn the complete edit plan.'}]}],
        output_format=PlannerPlan)
    if response.stop_reason=='refusal':raise RuntimeError('The planner declined this request.')
    if response.parsed_output is None:raise RuntimeError(f'The planner returned no plan ({response.stop_reason}).')
    plan=response.parsed_output.to_plan()
    if preset or mode not in (None,'auto'):plan.caption_preset=preset or mode
    return save_plan(folder,plan)

def render_props(folder):
    folder=Path(folder);plan,warnings=check_plan(load_plan(folder),folder)
    meta=json.loads((folder/'manifest.json').read_text())
    return {'fps':FPS,'width':meta['width'],'height':meta['height'],'durationInFrames':meta['frames'],
     'video':'source.mp4','foreground':'foreground.webm' if (folder/'foreground.webm').exists() else None,
     'captions':json.loads((folder/'captions.json').read_text())['captions'],
     'tracks':json.loads((folder/'tracks.json').read_text()),'plan':plan.model_dump()},warnings

def pop_sound(path):
    """Short synthesized pop (Remotion's hosted SFX list has none)."""
    t=np.arange(int(.12*44100))/44100;tone=np.sin(2*np.pi*(900-5200*t)*t)*np.exp(-t*38)
    with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(44100);w.writeframes((tone*.8*32767).astype('<i2').tobytes())

def render(folder,final=False,status=print):
    folder=Path(folder);need_motion()
    if not (folder/'sfx-pop.wav').exists():pop_sound(folder/'sfx-pop.wav')
    props,warnings=render_props(folder);(folder/'render-props.json').write_text(json.dumps(props))
    name='shorts-final.mp4' if final else 'shorts-draft.mp4';partial=folder/('.rendering-'+name)
    cmd=['npx','remotion','render','src/index.ts','Shorts',str(partial),'--props',str(folder/'render-props.json'),'--public-dir',str(folder),'--codec','h264','--crf','18' if final else '23','--log','info']+browser_args()
    if not final:cmd+=['--scale','0.5']
    status(('Rendering final 1080p' if final else 'Rendering draft (half resolution)')+' · original audio kept')
    proc=subprocess.Popen(cmd,cwd=MOTION,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    tail=[]
    for line in proc.stdout:
        line=line.strip();tail=(tail+[line])[-15:]
        if line.startswith(('Rendered','Encoded','Stitched')):status(line)
    if proc.wait():raise RuntimeError('Render failed:\n'+'\n'.join(tail))
    partial.replace(folder/name);return folder/name,warnings

if __name__=='__main__':
    import argparse,uuid
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('prepare');c.add_argument('video');c.add_argument('--preset',default='bold',choices=PRESETS+['auto'])
    c=sub.add_parser('cut');c.add_argument('job');c.add_argument('--auto',action='store_true');c.add_argument('--notes',default='');c.add_argument('--file');c.add_argument('--apply',action='store_true')
    c=sub.add_parser('plan');c.add_argument('job');c.add_argument('--auto',action='store_true');c.add_argument('--notes',default='');c.add_argument('--file')
    c=sub.add_parser('render');c.add_argument('job');c.add_argument('--final',action='store_true')
    a=p.parse_args()
    if a.command=='prepare':
        folder=ROOT/'runs'/uuid.uuid4().hex;folder.mkdir(parents=True);shutil.copy2(a.video,folder/'upload.mp4');print('JOB:',folder.name,flush=True)
        prepare(folder/'upload.mp4',folder,a.preset);save_status(folder,'done','Ready · choose what to keep');print(json.dumps(cut_summary(folder)));raise SystemExit
    if len(a.job)!=32 or any(ch not in '0123456789abcdef' for ch in a.job):p.error('Expected a 32-character local job ID')
    folder=ROOT/'runs'/a.job
    if a.command=='cut':
        if not (folder/'units.json').exists():p.error('Prepare this job first')
        if a.auto:cut_auto(folder,a.notes)
        elif a.file:save_cut(folder,Path(a.file).read_text())
        elif not a.apply:print(cut_context(folder,a.notes));print(load_cut(folder).model_dump_json(indent=1));raise SystemExit
        print(json.dumps(cut_summary(folder)))
        if a.apply:apply_cut(folder);save_status(folder,'done','Cut ready · review tracking, then plan graphics')
        raise SystemExit
    if not (folder/'tracks.json').exists():p.error('Apply a cut first: shorts.py cut JOB --apply')
    if a.command=='plan':
        if a.auto:plan,warnings=plan_auto(folder,a.notes)
        elif a.file:plan,warnings=save_plan(folder,Path(a.file).read_text())
        else:print(planner_context(folder,a.notes)[0]);raise SystemExit
        print(plan.model_dump_json(indent=1));[print('WARNING:',w) for w in warnings]
    else:
        out,warnings=render(folder,a.final);[print('WARNING:',w) for w in warnings];print(out)
