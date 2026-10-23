"""9:16 shorts editor: cut a raw recording down to what matters, then add captions, motion graphics,
zooms and images that follow hands/face. Local except the optional Claude cut/graphics planners.
Speech is never regenerated: the cut only removes parts of the original audio.

  python shorts.py prepare VIDEO [--preset bold|minimal|boxed|none]   # transcribe the full recording
  python shorts.py cut JOB [--auto] [--notes TEXT] [--file CUT.json] [--apply]
  python shorts.py plan JOB [--auto] [--notes TEXT] [--file PLAN.json]
  python shorts.py render JOB [--final]
  python shorts.py auto JOB [--notes TEXT]   # Claude cuts, picks the look, plans graphics, renders a draft
"""
from pathlib import Path
from fractions import Fraction
from typing import Literal,get_args,get_origin
import json,subprocess,shutil,wave,base64,os,re,signal,threading
import av,numpy as np
from pydantic import BaseModel,Field,ValidationError
from config import ROOT,setting,credential
FPS=30;MOTION=ROOT/'motion'
PRESETS=['duo','karaoke','pill','typewriter','quiet','float','stack','clean','editorial','rise','bold','minimal','boxed','none']
CAPTION_FONTS=['noto_black','noto_condensed','noto_bold','menbere','agbalumo','abyssinica','classic']
CAPTION_MOTIONS=['pop','word','rise']
GRAPHIC_STYLES=['glass','bold','editorial','minimal','tech','brutal','aurora','candy','noir','swiss','clay']
# Hosted Remotion sounds, then family names resolved by sound_source() (the creator's sfx-library/ first).
SOUNDS=['whoosh','whip','pop','ding','switch','mouse-click','shutter-modern','vine-boom','record-scratch','page-turn','anime-wow','yippee',
        'whoosh-soft','whoosh-deep','whoosh-long','riser-bass','riser-metal','hit','impact','ui-click','scifi-click','gears','camera-click','success']
Sound=Literal[tuple(SOUNDS)]
ACCENT='#6EC1FF'  # default accent: sky blue. The creator does not want yellow (2026-10-23)
# Accents Claude picks from per video, chosen to stand out from the look; never yellow.
PALETTE={'sky':'#6EC1FF','mint':'#5EEAD4','coral':'#FF7A59','pink':'#FF6FAE','lavender':'#B79CFF','lime':'#B8F35A','white':'#FFFFFF'}
ACCENT_BLUE='#3D7BFF'
TEMPLATES=['steps','slider','stat','icons','list','chips','quote','title','progress']
SCENES=['overlay','dim','dark','light','split']
GESTURES=['open_palm','fist','point','pinch','peace','thumbs_up','rock']

class Event(BaseModel):
    """One timeline item. Fields that do not apply to a type are ignored."""
    type:Literal['text','sticker','zoom','shake','flash','sfx','broll','card','no_captions','look']=Field(description='no_captions: hide captions for words spoken between start and end; look: switch the background look (e.g. original to show the real room) between start and end')
    look:str=Field('',description='look event: name from the looks list; original shows the real room')
    start:float=Field(description='seconds')
    end:float=Field(description='seconds; for flash/sfx use start+0.3')
    text:str=Field('',description='text: words to show; keep to 1-5 words. card: headline; wrap words in *stars* for the italic serif accent')
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
    sound:Sound='whoosh'
    volume:float=0.5
    src_start:float=Field(0.,description='broll: where to start in the screen recording, seconds')
    speed:float=Field(1.,description='broll: playback speed of the recording, 0.25-4')
    layout:Literal['full','split','bubble','front']=Field('split',description='broll: full screen, split (recording top, speaker bottom), bubble (speaker face in a corner circle) or front (speaker cut out in front)')
    corner:Literal['top_left','top_right','bottom_left','bottom_right']=Field('top_right',description='broll bubble position')
    template:Literal[tuple(TEMPLATES)]=Field('list',description='card: steps tracker, slider, stat (counting number + chart), icons (glossy tiles), list, chips (around the headline), quote box, title')
    items:list[str]=Field([],description='card: steps / list rows / chips / icons (emoji, "emoji Label" or uploaded image name)')
    value:str=Field('',description='card: stat number with unit (400%, $70,318); slider end position 0-100')
    label:str=Field('',description='card: stat caption, slider ends "Beginner|Pro", quote author, title subtitle')
    active:int=Field(1,description='card: 1-based current step / highlighted item')
    side:Literal['top','bottom','left','right']=Field('top',description='card split / broll split: edge the graphic comes from; it pushes the video the other way')
    timeline:list[tuple[float,int]]=Field([],description='card: (seconds, active item) changes inside one continuous card; filled when back-to-back cards are merged')
    scene:Literal[tuple(SCENES)]=Field('overlay',description='card: overlay on video, dim (darken+blur video behind), dark (full-screen glow), light (full-screen grid paper), split (graphic top, speaker bottom)')

BG_MODES=['original','blur','glow','color','gradient','studio','grid','image']
class Background(BaseModel):
    """What sits behind the person (needs the person cutout), plus lighting and subject treatment. 0-1 strengths."""
    mode:Literal[tuple(BG_MODES)]=Field('original',description='original footage, blur (own room blurred), glow (dark studio with a soft light), color, gradient, studio (coloured studio wall: color with a soft light pool of color2 behind the speaker), grid (light grid paper), image (an uploaded image)')
    color:str='#141518';color2:str='#2A2B31'  # color / gradient top and bottom; glow base
    image:str=Field('',description='image mode: uploaded image filename from assets/')
    blur:float=.55;dim:float=.25  # blur strength and darkening of the background
    light_color:str=ACCENT
    glow:float=.0;rim:float=.0;vignette:float=.0;spotlight:float=.0
    shadow:float=.0;outline:float=.0;outline_color:str='#FFFFFF';scale:float=1.0
    # Pro finish: wrap = the wall's colour wraps the cutout's edges and tints its shadows (match lighting);
    # reframe = punch in to a steady chest-up framing from the face track; tube = LED light tubes on the wall;
    # grade = cinematic contrast and a colour-matched tone; grain = fine moving film grain. 0-1 strengths.
    wrap:float=.0;reframe:float=.0;grade:float=.0;grain:float=.0
    tube:Literal['none','left','right','both']='none'
    look:str=''  # preset name this came from ('' = adjusted by hand)
    auto:bool=True  # Claude may pick the look; false once the creator chooses one

# Named looks Claude (or the creator) picks from. Each is a full Background; see docs/shorts-style.md.
LOOKS={
 'original':dict(mode='original'),
 'clean_blur':dict(mode='blur',reframe=.4,grade=.4,grain=.2,blur=.55,dim=.3,shadow=.35,vignette=.2),
 'dark_glow':dict(mode='glow',wrap=.45,reframe=.5,grade=.5,grain=.3,color='#08090C',color2='#16171D',light_color='#8FB8FF',glow=.45,rim=.3,vignette=.45,shadow=.5),
 'warm_studio':dict(mode='gradient',wrap=.5,reframe=.5,grade=.6,grain=.3,color='#0C0B09',color2='#2A2219',light_color='#FF9E7A',glow=.35,spotlight=.35,vignette=.4,shadow=.45),
 'charcoal':dict(mode='gradient',wrap=.4,reframe=.5,grade=.5,grain=.25,color='#111214',color2='#2A2B31',shadow=.5,vignette=.3,rim=.15,light_color='#FFFFFF'),
 'cream':dict(mode='color',color='#EFE9DD',shadow=.3),
 'grid_paper':dict(mode='grid',shadow=.3,outline=.35,outline_color='#FFFFFF'),
 # Coloured studio walls (podcast look): wall colour, the lighter pool of light behind the speaker, soft shadow.
 'studio_blue':dict(mode='studio',color='#264C99',color2='#628CC9',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_coral':dict(mode='studio',color='#93423D',color2='#C7786B',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_teal':dict(mode='studio',color='#1A5955',color2='#4C9F95',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_violet':dict(mode='studio',color='#3C2D85',color2='#816FC5',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_rose':dict(mode='studio',color='#8A385C',color2='#C67A9B',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_forest':dict(mode='studio',color='#234931',color2='#629572',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_slate':dict(mode='studio',color='#282D37',color2='#646D7D',wrap=.6,reframe=.7,grade=.6,grain=.3,tube='left',dim=.5,shadow=.45,vignette=.3),
 'studio_sunset':dict(mode='gradient',wrap=.5,reframe=.7,grade=.6,grain=.3,color='#572F82',color2='#BF624B',glow=.15,light_color='#E8A090',shadow=.45,vignette=.35),
 'color_pop':dict(mode='color',color='#FF7A59',shadow=.35,outline=.5,outline_color='#FFFFFF'),
}
LOOK_NOTES={'original':'the real footage, untouched','clean_blur':'own room softly blurred and darkened: natural, works for everything',
 'dark_glow':'near-black studio with a soft cool light behind the head: premium, serious, tech/business',
 'warm_studio':'warm dark brown gradient with a spotlight: storytelling, personal, emotional','charcoal':'neutral dark grey gradient: calm, clean, minimal',
 'cream':'flat warm cream: friendly explainers, light mood','grid_paper':'light grid paper with a white sticker outline: teaching, step-by-step, lists',
 'studio_blue':'saturated blue studio wall with a soft light behind: podcast, tech, confident','studio_coral':'warm coral studio wall: friendly, personal, lifestyle',
 'studio_teal':'teal studio wall: calm, health, education','studio_violet':'violet studio wall: creative, AI, future',
 'studio_rose':'rose studio wall: beauty, relationships, playful','studio_forest':'green studio wall: money, growth, nature',
 'studio_slate':'cool grey studio wall: serious, business, neutral','studio_sunset':'violet-to-coral diagonal: inspiring, bold hooks',
 'color_pop':'solid coral with a white outline: loud hooks, announcements; use for short videos only'}
def look(name):return Background(**{**LOOKS[name],'look':name}) if name in LOOKS else None

class Plan(BaseModel):
    background:Background=Background()
    caption_preset:Literal[tuple(PRESETS)]='duo'
    caption_font:Literal[tuple(CAPTION_FONTS)]=Field('noto_black',description='caption typeface; classic = each preset\'s own fonts')
    caption_motion:Literal[tuple(CAPTION_MOTIONS)]=Field('pop',description='duo captions: pop (each phrase pops in), word (words appear as spoken), rise (words slide up)')
    caption_fill:Literal['glass','chrome','glow','solid']=Field('glass',description='duo letters: glass (gradient with a reflection line and a passing shine), chrome, glow (soft light in the accent), solid')
    captions_auto:bool=True  # Claude may change caption style and color; false once the creator chooses
    graphics_style:Literal[tuple(GRAPHIC_STYLES)]=Field('glass',description='design of cards and text pops: glass (liquid glass, tech/AI), bold (solid blocks, marker accents, loud), editorial (serif accents, calm, premium), minimal (no panels, big type), tech (dark panels, grid, glow), brutal (white cards, thick outline, hard shadow), aurora (violet-coral gradient cards), candy (pastel, very round), noir (black, serif accents, luxury), swiss (square, caps, poster), clay (soft 3D grey)')
    graphics_auto:bool=True  # Claude may pick the graphic style; false once the creator chooses
    caption_y:float=Field(0.72,description='vertical centre of captions 0-1 when caption_place is fixed (and with no face)')
    caption_case:Literal['capital','upper','spoken']=Field('capital',description='Latin letters in captions: capital (Each Word Capitalized), upper (ALL CAPS), spoken (as transcribed)')
    caption_place:Literal['face','fixed']=Field('face',description='face: just under the chin, following the speaker, inside the platform safe zone; fixed: at caption_y')
    highlight_color:str=ACCENT
    progress_bar:bool=False
    emphasis:list[str]=Field([],description='editorial captions: words to stress in the italic serif accent (key nouns, numbers, punchlines), as spoken')
    auto_sound:bool=Field(True,description='add whooshes, textures, risers and hits automatically from the graphics')
    events:list[Event]=[]
    notes:str=Field('',description='one short paragraph explaining the edit choices to the creator')

FILLERS={'um','umm','uh','uhh','uhm','er','erm','ah','ahh','hmm','mm','mhm','እ','እእ','እህ','ኧ','ኧኧ','እም','እምም'}
# Sentence ends and pauses, including Ethiopic (Amharic) punctuation.
SENTENCE_END='.?!።፧';CLAUSE_END=',;:፣፤፥፦،、'
# Scribe sometimes writes look-alike letters from other scripts inside Amharic words.
SCRIPT_FIXES={'ബി':'ቢ','،':'፣','、':'፣'}
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
# Structured output compiles every enum into a grammar, and too many enums make Claude reject the schema
# ("compiled grammar is too large"). Choices are plain strings listed in the description; to_plan()
# replaces anything outside the list with the full model's default.
def choice(options,note=''):return Field(description='one of: '+', '.join(options)+(f'. {note}' if note else ''))
class PText(BaseModel):
    type:Literal['text'];start:Num;end:Num
    text:str=Field(description='1-5 words');style:str=choice(['pop','slide','type']);color:str=Field(description='hex, e.g. #FFFFFF')
    background:str=choice(['none','pill']);size:Num=Field(description='1 = 96px headline');x:Num;y:Num=Field(description='vertical centre 0-1')
    behind_subject:bool
class PSticker(BaseModel):
    type:Literal['sticker'];start:Num;end:Num
    asset:str=Field(description='uploaded image filename, or empty to use emoji');emoji:str
    anchor:str=choice(['screen','hand','face']);hand:str=choice(['any','left','right'],'screen side of the hand')
    point:str=choice(['palm','above_palm','fingertip','above_head','beside_face']);trigger:str=choice(['time']+GESTURES)
    animation:str=choice(['pop','spin','drop','fade']);idle:str=choice(['float','pulse','spin','none'])
    size:Num=Field(description='hand: 1 = one hand length; screen/face: 1 = 30% of frame width');x:Num=Field(description='screen anchor only');y:Num=Field(description='screen anchor only')
class PZoom(BaseModel):
    type:Literal['zoom'];start:Num;end:Num;scale:Num=Field(description='1.05-1.4');focus:str=choice(['face','center'])
class PShake(BaseModel):
    type:Literal['shake'];start:Num;end:Num;intensity:Num=Field(description='0.3-2')
class PFlash(BaseModel):
    type:Literal['flash'];start:Num
class PSfx(BaseModel):
    type:Literal['sfx'];start:Num
    sound:str=choice(SOUNDS);volume:Num=Field(description='0.3-0.6')
class PBroll(BaseModel):
    type:Literal['broll'];start:Num;end:Num
    asset:str=Field(description='screen recording filename');src_start:Num=Field(description='seconds into the recording where the shown part starts')
    speed:Num=Field(description='1 normal, up to 3 to fit a long demo into a short moment')
    layout:str=choice(['full','split','bubble','front']);corner:str=choice(['top_left','top_right','bottom_left','bottom_right'],'bubble position; keep it off important screen content')
class PCard(BaseModel):
    type:Literal['card'];start:Num;end:Num
    template:str=choice(TEMPLATES);scene:str=choice(SCENES)
    text:str=Field(description='headline, 1-7 words, *stars* around the accent words; empty for none')
    items:list[str]=Field(description='steps, list rows, chips or icons (emoji, "emoji Label", uploaded image name); 2-6 short entries; empty for stat/slider/quote/title')
    value:str=Field(description='stat: number with unit e.g. 400% or $70,318; slider: end position 0-100; else empty')
    label:str=Field(description='stat caption; slider end labels "Beginner|Pro"; quote author; title subtitle; else empty')
    active:int=Field(description='steps/list/icons: 1-based current item, else 1');y:Num=Field(description='overlay/dim: vertical centre 0-1')
    side:str=choice(['top','bottom','left','right'],'split and full-screen scenes: edge the graphic pushes in from')
class PNoCaptions(BaseModel):
    type:Literal['no_captions'];start:Num;end:Num
class PLook(BaseModel):
    type:Literal['look'];start:Num;end:Num;look:str=choice(list(LOOKS))
class PlannerPlan(BaseModel):
    caption_preset:str=choice(PRESETS);caption_y:Num=Field(description='captions vertical centre 0-1, clear of face and stickers')
    graphics_style:str=choice(GRAPHIC_STYLES,'design of all cards and text pops for this video')
    highlight_color:str=Field(description='caption line-2 / accent color: one hex from the palette list, picked to stand out from the look and footage');progress_bar:bool
    look:str=choice(list(LOOKS),'background look for the whole video, see the looks list')
    emphasis:list[str]=Field(description='editorial captions: words to stress, as spoken (key nouns, numbers, punchlines), about one per sentence')
    events:list[PText|PSticker|PZoom|PShake|PFlash|PSfx|PBroll|PCard|PNoCaptions|PLook]
    notes:str=Field(description='one short paragraph explaining the edit choices to the creator')
    def to_plan(self):
        def fix(model,data):
            for name,f in model.model_fields.items():
                allowed=get_args(f.annotation) if get_origin(f.annotation) is Literal else None
                if allowed and name in data and data[name] not in allowed:data[name]=f.default
            return data
        events=[Event(**fix(Event,{'end':e.start+.3,**e.model_dump()})) for e in self.events]
        plan=Plan(**fix(Plan,{**self.model_dump(exclude={'events','look'}),'events':events}))
        plan.background=look(self.look) or Background();return plan

def status_file(folder):return Path(folder)/'status.json'
def save_status(folder,state,message,**extra):
    data={'id':Path(folder).name,'kind':'shorts','state':state,'status':message,**extra}
    tmp=status_file(folder).with_suffix('.tmp');tmp.write_text(json.dumps(data));tmp.replace(status_file(folder));return data

def say(message,progress=None):print(message if progress is None else f'{message} · {progress:.0%}',flush=True)

class Cancelled(Exception):
    """The creator pressed Cancel."""

def interruptible(fn,status):
    """Run a blocking call (web request) so Cancel stops waiting at once; a late result is discarded."""
    ev=getattr(status,'cancelled',None)
    if ev is None:return fn()
    box={}
    def run():
        try:box['ok']=fn()
        except BaseException as e:box['err']=e
    t=threading.Thread(target=run,daemon=True);t.start()
    while t.is_alive():
        if ev.wait(.25):raise Cancelled()
    if 'err' in box:raise box['err']
    return box['ok']

def spawn(cmd,status,cwd=None):
    """Start a helper in its own process group; Cancel stops it and everything it started (node, Chrome)."""
    proc=subprocess.Popen(cmd,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    ev=getattr(status,'cancelled',None)
    def watch():
        while proc.poll() is None:
            if ev.wait(.25):
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                return
    if ev is not None:threading.Thread(target=watch,daemon=True).start()
    return proc

def finished(proc,status):
    code=proc.wait();ev=getattr(status,'cancelled',None)
    if ev is not None and ev.is_set():raise Cancelled()
    return code

def run_with_progress(cmd,status,message,cwd=None):
    """Run a helper that prints 'PROGRESS 0.42' lines; forward them as status updates."""
    proc=spawn(cmd,status,cwd);tail=[]
    for line in proc.stdout:
        line=line.strip()
        if line.startswith('PROGRESS '):status(message,min(1.,float(line.split()[1])))
        elif line:tail=(tail+[line])[-12:]
    if finished(proc,status):raise RuntimeError(f'{message} failed: '+' | '.join(tail)[-1200:])

def thumbnail(src,dst):
    """Small poster frame for the job list."""
    with av.open(str(src)) as inp:
        for f in inp.decode(video=0):
            if float(f.time or 0)>=min(1.,probe(src)['duration']/2):break
        im=upright(f);im.thumbnail((240,240));im.convert('RGB').save(dst,quality=80)

def normalize(src,dst,audio=None,progress=lambda p:None):
    """Constant 30 fps, at most 1080 px wide; original audio packets copied unchanged."""
    with av.open(str(src)) as inp:
        vs=inp.streams.video[0]
        duration=float(vs.duration*vs.time_base) if vs.duration else float(inp.duration/av.time_base)
        limit=float(setting('SHORTS_MAX_SECONDS','600'))
        if duration>limit:raise ValueError(f'Use a clip of {limit/60:g} minutes or less (SHORTS_MAX_SECONDS).')
        frames=iter(inp.decode(video=0));cur=next(frames);nxt=next(frames,None)
        w,h=output_size(*upright(cur).size)
        if h<w:raise ValueError('This editor expects vertical (9:16) footage.')
        tmp=Path(dst).with_suffix('.part.mp4')
        with av.open(str(tmp),'w') as out:
            st=out.add_stream('libx264',rate=FPS);st.width,st.height,st.pix_fmt=w,h,'yuv420p';st.options={'crf':'17','preset':'medium'}
            ain=inp.streams.audio[0] if inp.streams.audio and not audio else None;aout=out.add_stream_from_template(ain) if ain else None
            if audio:  # cleaned audio replaces the original track, trimmed to the video
                aclean=out.add_stream('aac',rate=SR,layout='stereo');aclean.bit_rate=256000
            count=round(duration*FPS)
            for i in range(count):
                t=i/FPS  # absolute timeline keeps the untouched audio in sync
                while nxt is not None and float(nxt.time)<=t:cur=nxt;nxt=next(frames,None)
                im=upright(cur);f=av.VideoFrame.from_image(im if im.size==(w,h) else im.resize((w,h)))
                f.pts=i;f.time_base=Fraction(1,FPS)
                for p in st.encode(f):out.mux(p)
                if i%30==0:progress(.95*i/count)
            for p in st.encode():out.mux(p)
            if ain:
                inp.seek(0)
                for p in inp.demux(ain):
                    if p.dts is None:continue
                    p.stream=aout;out.mux(p)
            if audio:
                pcm=decode_audio(audio)[:,:round(count/FPS*SR)]
                encode_pcm(out,aclean,pcm)
                for p in aclean.encode():out.mux(p)
    tmp.replace(dst)
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

CLIPS=['.mp4','.mov','.m4v','.webm']

def load_clips(folder):
    path=Path(folder)/'assets'/'clips.json'
    return json.loads(path.read_text()) if path.exists() else {}

def add_clip(src,folder,stem):
    """Screen recording -> assets/<stem>.mp4 (H.264, 30 fps, muted) plus preview frames for the planner."""
    assets=Path(folder)/'assets';assets.mkdir(exist_ok=True);dst=assets/(stem+'.mp4');frames_dir=assets/'.frames'/stem
    info=probe(src);w,h=info['width'],info['height'];scale=min(1,1080/w,1920/h);w,h=int(w*scale)//2*2,int(h*scale)//2*2
    if info['duration']>600:raise ValueError('Screen recordings can be up to 10 minutes.')
    tmp=assets/('.'+stem+'.converting.mp4')
    with av.open(str(src)) as inp, av.open(str(tmp),'w') as out:
        st=out.add_stream('libx264',rate=FPS);st.width,st.height,st.pix_fmt=w,h,'yuv420p';st.options={'crf':'20','preset':'veryfast'}
        frames=iter(inp.decode(video=0));cur=next(frames);nxt=next(frames,None);count=max(1,round(info['duration']*FPS))
        for i in range(count):
            while nxt is not None and float(nxt.time)<=i/FPS:cur=nxt;nxt=next(frames,None)
            im=upright(cur);f=av.VideoFrame.from_image(im if im.size==(w,h) else im.resize((w,h)));f.pts=i;f.time_base=Fraction(1,FPS)
            for pk in st.encode(f):out.mux(pk)
        for pk in st.encode():out.mux(pk)
    tmp.replace(dst);shutil.rmtree(frames_dir,ignore_errors=True);frames_dir.mkdir(parents=True)
    times=[count/FPS*(k+.5)/6 for k in range(6)]
    with av.open(str(dst)) as inp:
        for i,f in enumerate(inp.decode(video=0)):
            if times and i/FPS>=times[0]:
                im=f.to_image();im.thumbnail((360,640));im.save(frames_dir/f'{times.pop(0):07.2f}.jpg',quality=80)
    clips=load_clips(folder);clips[dst.name]={'duration':count/FPS,'width':w,'height':h}
    (assets/'clips.json').write_text(json.dumps(clips,indent=1));return dst.name

def remove_clip(folder,name):
    assets=Path(folder)/'assets';clips=load_clips(folder);clips.pop(name,None)
    (assets/'clips.json').write_text(json.dumps(clips,indent=1));(assets/name).unlink(missing_ok=True)
    shutil.rmtree(assets/'.frames'/Path(name).stem,ignore_errors=True)

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

LANGUAGES=['am','en','auto']

def job_language(folder):
    """Spoken language for this job: Amharic (default for mixed Amharic + English), English or auto-detect.
    Auto-detect can pick English for mostly-Amharic speech and then skip every Amharic word."""
    try:lang=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('language')
    except (OSError,ValueError):lang=None
    return lang if lang in LANGUAGES else (setting('SHORTS_LANGUAGE','am').strip().lower() or 'am')

def voice_map(folder):
    """Per 10 ms of the recording: is someone speaking? (from audio energy, cached)."""
    folder=Path(folder);cache=folder/'voice.npy'
    if cache.exists():return np.load(cache)
    with wave.open(str(folder/'speech-16k.wav')) as w:a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32768
    n=len(a)//160;env=np.sqrt((a[:n*160].reshape(n,160)**2).mean(1)) if n else np.zeros(0)
    voiced=env>max(float(np.percentile(env,25))*2.5,float(env.max())*.03) if n else np.zeros(0,bool)
    np.save(cache,voiced);return voiced

def transcript_check(folder):
    """Seconds of speech, and seconds of speech no transcript word covers (wrong language, mumbling)."""
    folder=Path(folder);cache=folder/'transcript-check.json'
    if cache.exists():return json.loads(cache.read_text())
    voiced=voice_map(folder).copy();covered=np.zeros(len(voiced),bool)
    for c in json.loads((folder/'full-captions.json').read_text())['captions']:covered[max(0,int(c['startMs']//10)-15):int(c['endMs']//10)+15]=True
    # Only count stretches of at least 0.5 s: breaths and clicks are not missing words.
    missing=voiced&~covered;runs=np.diff(np.r_[0,missing.astype(np.int8),0]);starts,ends=np.nonzero(runs==1)[0],np.nonzero(runs==-1)[0]
    lost=sum(e-s for s,e in zip(starts,ends) if e-s>=50)/100
    data={'speech':round(float(voiced.sum())/100,1),'missing':round(float(lost),1)};cache.write_text(json.dumps(data));return data

def transcriber():
    """ElevenLabs Scribe when a key is set (needed for Amharic), else local whisper.cpp."""
    choice=setting('SHORTS_TRANSCRIBER','auto').lower()
    return choice if choice in ('elevenlabs','whisper') else 'elevenlabs' if setting('ELEVENLABS_API_KEY') else 'whisper'

ISO3={'am':'amh','amharic':'amh','en':'eng','english':'eng'}

def scribe_captions(data):
    """Scribe words to Remotion captions; text keeps whisper's leading space."""
    out=[]
    for w in data.get('words') or []:
        if w.get('type')!='word' or w.get('start') is None or not w.get('text','').strip():continue
        s=int(w['start']*1000);e=max(s+1,int((w.get('end') or w['start'])*1000))
        text=w['text'].strip()
        for bad,good in SCRIPT_FIXES.items():text=text.replace(bad,good)
        out.append({'text':' '+text,'startMs':s,'endMs':e,'timestampMs':(s+e)//2,'confidence':round(float(np.exp(w.get('logprob') or 0)),3)})
    return out

def elevenlabs(path,status,**kw):
    """POST to ElevenLabs; brief connection drops (Wi-Fi, DNS) are retried twice before giving up."""
    import httpx,time
    key=credential('ELEVENLABS_API_KEY')
    def call():
        for attempt in range(3):
            try:return httpx.post('https://api.elevenlabs.io'+path,headers={'xi-api-key':key},timeout=900,**kw)
            except (httpx.ConnectError,httpx.ConnectTimeout) as e:
                if attempt==2:raise RuntimeError(f"Can't reach ElevenLabs. Check your internet connection, then try again. ({e})") from None
                time.sleep(3*(attempt+1))
    return interruptible(call,status)

def transcribe_scribe(wav,out,status,language=None):
    message='Transcribing with ElevenLabs Scribe (cloud, supports Amharic)';status(message,None)
    form={'model_id':setting('SHORTS_SCRIBE_MODEL','scribe_v2'),'timestamps_granularity':'word','tag_audio_events':'false','diarize':'false'}
    lang=(language or setting('SHORTS_LANGUAGE','auto')).strip().lower()
    if lang not in ('','auto'):form['language_code']=ISO3.get(lang,lang)
    r=elevenlabs('/v1/speech-to-text',status,data=form,files={'file':(Path(wav).name,Path(wav).read_bytes(),'audio/wav')})
    if r.status_code>=400:raise RuntimeError(f'ElevenLabs transcription failed ({r.status_code}): {r.text[:400]}')
    data=r.json()
    out.write_text(json.dumps({'language':data.get('language_code'),'model':form['model_id'],'provider':'elevenlabs','captions':scribe_captions(data)},indent=1))

def transcribe(src,folder,name='full-captions.json',status=say,audio=None):
    folder=Path(folder);wav=folder/'speech-16k.wav';out=folder/name
    if not speech_wav(audio or src,wav):out.write_text(json.dumps({'language':None,'captions':[]}));return []
    language=job_language(folder)
    if transcriber()=='elevenlabs':transcribe_scribe(wav,out,status,language)
    else:run_with_progress(['node','transcribe.mjs',str(wav),str(out),setting('SHORTS_WHISPER_MODEL','small'),language],status,'Transcribing your recording (runs on this Mac)',cwd=MOTION)
    captions=clean_captions(out);data=json.loads(out.read_text());data['captions']=refine_timing(captions,wav)
    out.write_text(json.dumps(data,indent=1));(folder/'voice.npy').unlink(missing_ok=True);(folder/'transcript-check.json').unlink(missing_ok=True)
    return data['captions']

def is_filler(c):return c['text'].strip().lower().strip('.,!?;:"\'…-'+SENTENCE_END+CLAUSE_END) in FILLERS

def make_units(captions):
    """Transcript parts the cut keeps or drops: sentences, split further at pauses."""
    units=[];cur=[]
    for i,c in enumerate(captions):
        cur.append(i);word=c['text'].strip();nxt=captions[i+1] if i+1<len(captions) else None
        gap=(nxt['startMs']-c['endMs'])/1000 if nxt else 99
        if word[-1:] in SENTENCE_END or gap>.7 or (word[-1:] in CLAUSE_END and gap>.3) or len(cur)>=35:
            units.append(cur);cur=[]
    return [{'id':k,'first':u[0],'last':u[-1],'start':captions[u[0]]['startMs']/1000,'end':captions[u[-1]]['endMs']/1000,
             'text':''.join(captions[i]['text'] for i in u).strip()} for k,u in enumerate(units)]

def retime_words(old,words):
    """Timings for corrected words: the same word count keeps each word's timing; otherwise the new words
    are spread over the time the old ones were spoken (gaps between them stay silent), by length."""
    if len(words)==len(old):return [(c['startMs'],c['endMs']) for c in old]
    spans=[(c['startMs'],max(c['endMs'],c['startMs']+1)) for c in old];total=sum(b-a for a,b in spans)
    def at(t,start):  # speaking-time offset -> recording time; a boundary on a gap snaps into the word on its side
        for a,b in spans:
            if t<b-a or (not start and t<=b-a):return a+t
            t-=b-a
        return spans[-1][1]
    sizes=[max(len(w),1) for w in words];chars=sum(sizes);out=[];pos=0
    for n in sizes:
        s,e=round(at(total*pos/chars,True)),round(at(total*(pos+n)/chars,False));pos+=n;out.append((s,max(e,s+1)))
    return out

def edit_part(folder,ident,text):
    """Replace the words of one transcript part (fixing recognition errors). Part ids, the cut and the audio stay.
    Returns True when captions of an already built edit were updated in place, False when a rebuild is needed."""
    folder=Path(folder);data=json.loads((folder/'full-captions.json').read_text());captions=data['captions']
    units=json.loads((folder/'units.json').read_text())
    if not 0<=ident<len(units):raise ValueError(f'Unknown transcript part: {ident}')
    words=text.split()
    if not words:raise ValueError('A part needs at least one word. To drop it, uncheck it instead.')
    u=units[ident];old=captions[u['first']:u['last']+1]
    new=[{'text':' '+w,'startMs':s,'endMs':e,'timestampMs':(s+e)//2,'confidence':1} for w,(s,e) in zip(words,retime_words(old,words))]
    captions[u['first']:u['last']+1]=new;shift=len(new)-len(old)
    u.update(last=u['first']+len(new)-1,text=' '.join(words),edited=True)
    for later in units[ident+1:]:later['first']+=shift;later['last']+=shift
    (folder/'full-captions.json').write_text(json.dumps(data,indent=1));(folder/'units.json').write_text(json.dumps(units,indent=1))
    (folder/'transcript-check.json').unlink(missing_ok=True)
    if not (folder/'captions.json').exists():return True
    return refresh_edit_captions(folder)

def refresh_edit_captions(folder):
    """Rewrite captions.json of the built edit from the corrected transcript, if the cut it was built from is unchanged."""
    folder=Path(folder);data=json.loads((folder/'full-captions.json').read_text());captions=data['captions']
    units=json.loads((folder/'units.json').read_text());cut=load_cut(folder);info=json.loads((folder/'source-info.json').read_text())
    built=json.loads((folder/'cut-map.json').read_text()) if (folder/'cut-map.json').exists() else []
    whole=not captions or (not cut.tighten and cut.keep==list(range(len(units))))
    ranges=[] if whole else layout(cut_ranges(cut,captions,units,info['duration'],voice_or_none(folder)))
    if [{k:r[k] for k in ['start','end','out','frames']} for r in ranges]!=built:
        save_cut(folder,cut);return False  # the edit's audio no longer matches these words: newer cut.json marks it for rebuilding
    kept=[c for c in captions if not is_filler(c)] if whole else remap_captions(captions,ranges)
    (folder/'captions.json').write_text(json.dumps({'language':data.get('language'),'captions':kept},indent=1));return True

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

def cut_ranges(cut,captions,units,duration,voiced=None):
    """Source time ranges to play, in order, each with the caption indices it carries."""
    words=[]
    for k in cut.keep:words+=[i for i in range(units[k]['first'],units[k]['last']+1) if not (cut.tighten and is_filler(captions[i]))]
    groups=[]
    for i in words:
        prev=groups[-1][-1] if groups else None
        gap=(captions[i]['startMs']-captions[prev]['endMs'])/1000 if prev is not None else 0
        # A long gap is only a pause to remove when it is quiet: speech the transcript missed is kept.
        seg=voiced[int(captions[prev]['endMs']//10):int(captions[i]['startMs']//10)] if voiced is not None and prev is not None else []
        quiet=len(seg)==0 or seg.mean()<.2
        joined=prev is not None and i==prev+1 and not (cut.tighten and gap>cut.max_pause and quiet)
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

def cut_media(src,dst,ranges,progress=lambda p:None,audio=None):
    """Join source ranges into a 30 fps video; audio is cut at the same points with 8 ms fades."""
    info=probe(src);w,h=output_size(info['width'],info['height'])
    if h<w:raise ValueError('This editor expects vertical (9:16) footage.')
    total=sum(r['frames'] for r in ranges);tmp=Path(dst).with_suffix('.part.mp4')
    with av.open(str(tmp),'w') as out:
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
                    if index%30==0:progress(.9*index/total)
        for p in st.encode():out.mux(p)
        if ast:
            # Decode once from the start (as the transcript was): seeking shifts AAC timing by tens of ms.
            pcm=decode_audio(audio or src);fade=int(.008*SR);ramp=np.linspace(0,1,fade,dtype=np.float32);written=0
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
    tmp.replace(dst)
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

NOISE=['off','light','strong']
RNNOISE_URL='https://raw.githubusercontent.com/GregorR/rnnoise-models/master/somnolent-hogwash-2018-09-01/sh.rnnn'

VOICE=['level','off']
LOUDNESS=-14.  # LUFS: what TikTok, Reels and Shorts normalise to
PEAK=10**(-1.5/20)  # limiter ceiling, leaves room for the sound effects on top

def job_voice(folder):
    """Voice levelling: on by default (only the volume changes, the voice itself never does)."""
    try:mode=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('voice','level')
    except (OSError,ValueError):mode='level'
    return mode if mode in VOICE else 'level'

def loudness(x):
    """Integrated loudness (ITU-R BS.1770 / EBU R128, LUFS) of float stereo audio at 48 kHz."""
    from scipy.signal import lfilter
    y=lfilter([1.53512485958697,-2.69169618940638,1.19839281085285],[1,-1.69065929318241,.73248077421585],x,axis=1)  # K-weighting
    y=lfilter([1.,-2.,1.],[1,-1.99004745483398,.99007225036621],y,axis=1)
    block=int(.4*SR);hop=block//4
    if y.shape[1]<block:return -70.
    c=np.concatenate([[0.],np.cumsum((y.astype(np.float64)**2).sum(0))]);at=np.arange(0,y.shape[1]-block+1,hop)
    ms=(c[at+block]-c[at])/block;lufs=lambda m:-.691+10*np.log10(m+1e-12)
    ms=ms[lufs(ms)>-70]
    if not len(ms):return -70.
    ms=ms[lufs(ms)>lufs(ms.mean())-10]
    return float(lufs(ms.mean()))

def level_voice(pcm):
    """Even, platform-loud speech from int16 stereo: a slow rider lifts quiet passages and lowers loud ones
    (±8 dB, speech only, so silences are not pumped up), the whole is normalised to -14 LUFS, and a short
    look-ahead limiter catches peaks. Gain only: nothing is regenerated or reshaped."""
    from scipy.ndimage import minimum_filter1d,uniform_filter1d
    x=pcm.astype(np.float32)/32768
    if x.shape[1]<SR:return pcm
    hop=SR//10;n=x.shape[1]//hop
    db=10*np.log10((x[:,:n*hop]**2).mean(0).reshape(n,hop).mean(1)+1e-12)
    speech=db>np.percentile(db,90)-25
    if speech.sum()>5:
        aim=np.median(db[speech]);first=int(np.argmax(speech))
        idx=np.where(speech,np.arange(n),first);np.maximum.accumulate(idx,out=idx)  # pauses hold the last speech gain
        want=np.clip(aim-db,-8,8)[idx]
        gain=uniform_filter1d(uniform_filter1d(want,15,mode='nearest'),9,mode='nearest')  # ~1.5 s, smooth
        g=np.interp(np.arange(x.shape[1]),np.arange(n)*hop+hop/2,10**(gain/20)).astype(np.float32)
        x=x*g
    x*=10**((LOUDNESS-loudness(x))/20)
    peak=np.abs(x).max(0)
    lim=np.minimum(1,PEAK/np.maximum(peak,1e-9))
    lim=minimum_filter1d(lim,int(.005*SR))  # 5 ms look-ahead window
    lim=uniform_filter1d(lim,int(.003*SR))
    x=np.clip(x*np.minimum(lim,1),-PEAK,PEAK)
    return (x*32767).astype(np.int16)

def voice_track(folder):
    """The levelled voice for the render (voice-level.wav, cached against source.mp4), or None when off."""
    folder=Path(folder);src=folder/'source.mp4';dst=folder/'voice-level.wav'
    if job_voice(folder)!='level' or not src.exists() or not probe(src).get('audio'):return None
    if not dst.exists() or dst.stat().st_mtime<src.stat().st_mtime:
        write_wav(level_voice(decode_audio(src)),folder/'.voice-level.part.wav');(folder/'.voice-level.part.wav').replace(dst)
    return dst.name

def job_noise(folder):
    try:mode=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('noise','off')
    except (OSError,ValueError):mode='off'
    return mode if mode in NOISE else 'off'

def write_wav(pcm,path,rate=SR):
    with wave.open(path if hasattr(path,'write') else str(path),'wb') as w:
        w.setnchannels(pcm.shape[0]);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.ascontiguousarray(pcm.T).tobytes())

def encode_pcm(out,stream,pcm,start=0):
    """Encode int16 stereo PCM at SR into an output audio stream; returns the next pts."""
    for c in range(0,pcm.shape[1],1024):
        af=av.AudioFrame.from_ndarray(np.ascontiguousarray(pcm[:,c:c+1024]),format='s16p',layout='stereo')
        af.sample_rate=SR;af.pts=start;af.time_base=Fraction(1,SR);start+=af.samples
        for pk in stream.encode(af):out.mux(pk)
    return start

def filter_pcm(pcm,filters):
    """Run int16 stereo PCM through libavfilter filters [(name, args)]; same rate and layout out."""
    g=av.filter.Graph();chain=[g.add_abuffer(format='s16p',sample_rate=SR,layout='stereo',time_base=Fraction(1,SR))]
    for name,args in filters+[('aformat','sample_fmts=s16p:channel_layouts=stereo:sample_rates=%d'%SR)]:
        chain.append(g.add(name,args));chain[-2].link_to(chain[-1])
    chain.append(g.add('abuffersink'));chain[-2].link_to(chain[-1]);g.configure();out=[]
    def drain():
        while True:
            try:out.append(g.pull().to_ndarray())
            except (BlockingIOError,EOFError,av.error.EOFError):return
    for c in range(0,pcm.shape[1],4096):
        f=av.AudioFrame.from_ndarray(np.ascontiguousarray(pcm[:,c:c+4096]),format='s16p',layout='stereo')
        f.sample_rate=SR;f.pts=c;f.time_base=Fraction(1,SR);g.push(f);drain()
    g.push(None);drain()
    return np.concatenate(out,axis=1) if out else np.zeros((2,0),np.int16)

def align_to(clean,ref,max_shift=.5):
    """Shift cleaned audio so it lines up with the original (processing can add delay), same length."""
    n=min(ref.shape[1],clean.shape[1],60*SR);step=3  # first minute at 16 kHz is plenty
    a=ref[:,:n].mean(0)[::step].astype(np.float32);b=clean[:,:n].mean(0)[::step].astype(np.float32)
    size=1<<int(np.ceil(np.log2(len(a)+len(b))));corr=np.fft.irfft(np.fft.rfft(a,size)*np.conj(np.fft.rfft(b,size)),size)
    lim=int(max_shift*SR/step);lags=np.r_[corr[:lim],corr[-lim:]];k=int(np.argmax(lags));lag=(k if k<lim else k-2*lim)*step
    # Refine to the exact sample on full-rate audio around the coarse match.
    a=ref[:,:n].mean(0).astype(np.float32);b=clean[:,:n].mean(0).astype(np.float32);m=len(a)-2*lim*step
    if m>SR//10:
        o=lim*step;lag=max(range(lag-step,lag+step+1),key=lambda L:float(np.dot(a[o:o+m],b[o-L:o-L+m])) if 0<=o-L and o-L+m<=len(b) else -np.inf)
    clean=(np.pad(clean,((0,0),(lag,0))) if lag>0 else clean[:,-lag:])[:,:ref.shape[1]]
    return np.pad(clean,((0,0),(0,ref.shape[1]-clean.shape[1])))

def denoise_light(pcm):
    model=ROOT/'models'/'rnnoise-sh.rnnn'
    if not model.exists():
        import httpx
        model.parent.mkdir(exist_ok=True);r=httpx.get(RNNOISE_URL,timeout=60,follow_redirects=True);r.raise_for_status()
        model.with_suffix('.part').write_bytes(r.content);model.with_suffix('.part').replace(model)
    # Rumble below 70 Hz, then RNNoise (recurrent speech/noise model) for fans, hum, hiss and room noise.
    return filter_pcm(pcm,[('highpass','f=70'),('arnndn',f"m={model}")])

def denoise_strong(pcm,folder,status=say):
    """ElevenLabs Voice Isolator (cloud): keeps the voice, removes noise, music and echo."""
    import io
    voice=io.BytesIO();write_wav(pcm.mean(0).astype(np.int16)[None],voice)  # in memory: nothing to clean up on Cancel
    r=elevenlabs('/v1/audio-isolation',status,files={'audio':('voice.wav',voice.getvalue(),'audio/wav')})
    if r.status_code>=400:raise RuntimeError(f'ElevenLabs noise removal failed ({r.status_code}): {r.text[:400]}')
    got=Path(folder)/'isolate-out.bin';got.write_bytes(r.content)
    try:return decode_audio(got)
    finally:got.unlink(missing_ok=True)

def job_audio(folder,status=say):
    """Cleaned audio for this job (cached WAV at SR, aligned to upload.mp4), or None when noise removal is off."""
    folder=Path(folder);mode=job_noise(folder)
    if mode=='off':return None
    path=folder/f'clean-{mode}.wav'
    if path.exists():return path
    status('Removing background noise'+(' with ElevenLabs (cloud)' if mode=='strong' else ' (runs on this Mac)'),None)
    ref=decode_audio(folder/'upload.mp4')
    clean=denoise_strong(ref,folder,status) if mode=='strong' else denoise_light(ref)
    write_wav(align_to(clean,ref),path.with_suffix('.part.wav'));path.with_suffix('.part.wav').replace(path);return path

def join_recordings(parts,dst,status=say):
    """Several recordings, in order, as one 30 fps video (first clip's size) with re-encoded audio.
    Each part's audio is padded or trimmed to its video length so later parts stay in sync."""
    parts=[Path(x) for x in parts];infos=[probe(x) for x in parts]
    limit=float(setting('SHORTS_MAX_SECONDS','600'))
    if sum(i['duration'] for i in infos)>limit:raise ValueError(f'Together the recordings must be {limit/60:g} minutes or less (SHORTS_MAX_SECONDS).')
    for x,i in zip(parts,infos):
        if i['height']<i['width']:raise ValueError(f'{x.name} is not vertical; this editor expects 9:16 footage.')
    w,h=output_size(infos[0]['width'],infos[0]['height']);tmp=Path(dst).with_suffix('.joining.mp4')
    with av.open(str(tmp),'w') as out:
        vs=out.add_stream('libx264',rate=FPS);vs.width,vs.height,vs.pix_fmt=w,h,'yuv420p';vs.options={'crf':'17','preset':'medium'}
        aus=out.add_stream('aac',rate=SR);aus.layout='stereo';aus.bit_rate=256000
        frame_no=0;sample_no=0
        for k,(x,info) in enumerate(zip(parts,infos)):
            status(f'Joining recording {k+1} of {len(parts)}',k/len(parts))
            count=max(1,round(info['duration']*FPS))
            with av.open(str(x)) as inp:
                frames=iter(inp.decode(video=0));cur=next(frames);nxt=next(frames,None)
                for i in range(count):
                    while nxt is not None and float(nxt.time)<=i/FPS:cur=nxt;nxt=next(frames,None)
                    im=upright(cur)
                    if i%30==0:status(f'Joining recording {k+1} of {len(parts)}',(k+i/count)/len(parts))
                    if im.size!=(w,h):  # cover-fit a clip with a different size
                        sc=max(w/im.width,h/im.height);im=im.resize((max(w,round(im.width*sc)),max(h,round(im.height*sc))))
                        l,t=(im.width-w)//2,(im.height-h)//2;im=im.crop((l,t,l+w,t+h))
                    f=av.VideoFrame.from_image(im);f.pts=frame_no;f.time_base=Fraction(1,FPS);frame_no+=1
                    for pk in vs.encode(f):out.mux(pk)
            need=round(count/FPS*SR)
            pcm=decode_audio(x) if info['audio'] else np.zeros((2,0),np.int16)
            pcm=np.ascontiguousarray(np.pad(pcm,((0,0),(0,max(0,need-pcm.shape[1]))))[:,:need])
            sample_no=encode_pcm(out,aus,pcm,sample_no)
        for pk in vs.encode():out.mux(pk)
        for pk in aus.encode():out.mux(pk)
    tmp.replace(dst);return [{'name':x.name,'duration':max(1,round(i['duration']*FPS))/FPS} for x,i in zip(parts,infos)]

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

def voice_or_none(folder):
    try:return voice_map(folder)
    except (OSError,wave.Error,ValueError):return None

def cut_summary(folder):
    """Kept duration and ranges for the current cut, without touching media."""
    folder=Path(folder);captions=json.loads((folder/'full-captions.json').read_text())['captions']
    units=json.loads((folder/'units.json').read_text());cut=load_cut(folder);info=json.loads((folder/'source-info.json').read_text())
    if not captions:return {'original':info['duration'],'kept':info['duration'],'parts':0,'kept_parts':0,'whole':True}
    ranges=layout(cut_ranges(cut,captions,units,info['duration'],voice_or_none(folder)))
    whole=not cut.tighten and cut.keep==list(range(len(units)))
    return {'original':info['duration'],'kept':info['duration'] if whole else sum(r['frames'] for r in ranges)/FPS,'parts':len(units),'kept_parts':len(cut.keep),'jumps':len(ranges),'whole':whole}

def prepare(src,folder,preset='bold',status=say):
    """Step 1: check the recording and transcribe all of it so the cut can be chosen."""
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True);(folder/'assets').mkdir(exist_ok=True);check_tools()
    (folder/'workflow-mode.json').write_text(json.dumps({'mode':'shorts','preset':preset,'noise':job_noise(folder),'language':job_language(folder)}))
    status('Reading your video',0);info=probe(src)
    limit=float(setting('SHORTS_MAX_SECONDS','600'))
    if info['duration']>limit:raise ValueError(f'Use a recording of {limit/60:g} minutes or less (SHORTS_MAX_SECONDS).')
    if info['height']<info['width']:raise ValueError('This editor expects vertical (9:16) footage.')
    (folder/'source-info.json').write_text(json.dumps(info))
    try:thumbnail(src,folder/'thumb.jpg')
    except Exception:pass  # the list just shows no picture
    status('Transcribing your recording (runs on this Mac)',0)
    captions=transcribe(src,folder,status=status,audio=job_audio(folder,status));units=make_units(captions)
    (folder/'units.json').write_text(json.dumps(units,indent=1))
    save_cut(folder,CutPlan(keep=[u['id'] for u in units]))
    status('Transcript ready · choose what to keep')

def apply_cut(folder,status=say):
    """Step 2: build the edited video from the cut, then track it."""
    folder=Path(folder);check_tools();src=folder/'upload.mp4';audio=job_audio(folder,status)
    try:before=load_plan(folder)  # the look and caption choices are kept across rebuilds; graphics are reset
    except (OSError,ValueError):before=Plan()
    captions=json.loads((folder/'full-captions.json').read_text())['captions'];units=json.loads((folder/'units.json').read_text())
    cut=load_cut(folder);info=json.loads((folder/'source-info.json').read_text())
    for stale in ['tracks.json','foreground.webm','tracking-preview.mp4','shorts-draft.mp4','shorts-final.mp4','plan.json','plan-warnings.json']:(folder/stale).unlink(missing_ok=True)
    shutil.rmtree(folder/'keyframes',ignore_errors=True)
    if not captions or (not cut.tighten and cut.keep==list(range(len(units)))):
        step='Step 1 of 2 · Preparing the whole recording';status(step,0);meta=normalize(src,folder/'source.mp4',audio,lambda p:status(step,p))
        kept=[c for c in captions if not is_filler(c)];ranges=[]
    else:
        ranges=layout(cut_ranges(cut,captions,units,info['duration'],voice_or_none(folder)))
        if not ranges:raise ValueError('The cut keeps nothing. Keep at least one part.')
        step=f'Step 1 of 2 · Cutting {len(ranges)} pieces into your edit';status(step,0)
        meta=cut_media(src,folder/'source.mp4',ranges,lambda p:status(step,p),audio)
        kept=remap_captions(captions,ranges)
    language=json.loads((folder/'full-captions.json').read_text()).get('language')
    (folder/'captions.json').write_text(json.dumps({'language':language,'captions':kept},indent=1))
    (folder/'cut-map.json').write_text(json.dumps([{k:r[k] for k in ['start','end','out','frames']} for r in ranges],indent=1))
    meta['noise']=job_noise(folder);(folder/'manifest.json').write_text(json.dumps(meta,indent=2))
    status('Step 2 of 2 · Tracking face, hands and you (for graphics)',0)
    run_with_progress([str(ROOT/'.venv-face/bin/python'),str(ROOT/'shorts_worker.py'),str(folder)],status,'Step 2 of 2 · Tracking face, hands and you (for graphics)')
    preset=json.loads((folder/'workflow-mode.json').read_text()).get('preset','bold')
    preset=preset if preset in PRESETS else 'duo'
    keep={k:getattr(before,k) for k in ['caption_font','caption_motion','caption_fill','caption_place','caption_case','captions_auto','background']}
    if not before.graphics_auto:keep.update(graphics_style=before.graphics_style,graphics_auto=False)
    if not before.captions_auto:keep.update(caption_preset=before.caption_preset,highlight_color=before.highlight_color,caption_y=before.caption_y)
    save_plan(folder,Plan(**{'caption_preset':preset,'highlight_color':ACCENT,**keep}))
    status(f"Your {meta['duration']:.0f}s edit is ready to review")

CUT_SYSTEM="""You are a senior editor turning a raw talking recording into a tight short-form video.
You get the transcript split into numbered parts with timings. Decide which parts to keep.
Remove: retakes and false starts (keep only the best, usually the last complete take), repeated points, rambling or tangents that do not serve the main message, setup that never pays off, filler sentences, off-camera chatter ("is this recording?", "let me start again").
Keep: every distinct point that matters, the context needed to understand it, and the payoff/ending. Never cut in the middle of a thought; the kept parts read in order must sound natural and complete.
There is no target length: the result is as long as the substance needs. Usually that lands at 1-3 minutes, but never pad or cut substance to hit a number.
Keep the original order. Only if one part is an exceptionally strong standalone hook may you also place its id first.
The speaker often mixes Amharic and English. Both languages are real content: never drop a part because of its language. Amharic transcripts may contain recognition errors; judge by meaning, and when unsure, keep.
Creator instructions override these defaults."""

def cut_context(folder,notes=''):
    units=json.loads((Path(folder)/'units.json').read_text());info=json.loads((Path(folder)/'source-info.json').read_text())
    lines=[f"Recording: {info['duration']/60:.1f} min, {len(units)} parts."]
    for u,nxt in zip(units,units[1:]+[None]):
        pause=f" (pause {nxt['start']-u['end']:.1f}s)" if nxt and nxt['start']-u['end']>=1 else ''
        lines.append(f"[{u['id']}] {u['start']:.1f}-{u['end']:.1f}s{pause}: {u['text']}")
    if notes.strip():lines.append('\nCreator instructions (follow these first):\n'+notes.strip())
    return '\n'.join(lines)

def cut_auto(folder,notes='',status=None):
    """Ask Claude which transcript parts matter."""
    import anthropic
    client=anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY') or None)
    response=interruptible(lambda:client.beta.messages.parse(
        model=setting('SHORTS_PLANNER_MODEL','claude-opus-5-5'),max_tokens=16000,
        betas=['server-side-fallback-2026-07-01'],fallbacks='default',system=CUT_SYSTEM,
        messages=[{'role':'user','content':cut_context(folder,notes)+'\n\nDecide what to keep.'}],
        output_format=CutDecision),status)
    if response.stop_reason=='refusal':raise RuntimeError('The editor declined this request.')
    decision=response.parsed_output
    if decision is None:raise RuntimeError(f'The editor returned no cut ({response.stop_reason}).')
    old=load_cut(folder)
    return save_cut(folder,CutPlan(keep=decision.keep,tighten=old.tighten,max_pause=old.max_pause,removed=[r.model_dump() for r in decision.removed],summary=decision.summary))

def load_plan(folder):
    path=Path(folder)/'plan.json'
    return Plan.model_validate_json(path.read_text()) if path.exists() else Plan()

def merge_cards(events):
    """Back-to-back cards showing the same thing become one card whose highlighted item moves on,
    so a step tracker or list stays on screen instead of leaving and re-entering for every step."""
    out=[]
    for e in events:
        prev=next((x for x in reversed(out) if x.type=='card'),None)
        if (e.type=='card' and prev is not None and prev.template==e.template and prev.scene==e.scene
                and prev.items==e.items and e.start-prev.end<=1.0 and e.start>=prev.start):
            if not prev.timeline:prev.timeline=[(prev.start,prev.active)]
            prev.timeline.append((e.start,e.active));prev.end=max(prev.end,e.end)
            if e.text and not prev.text:prev.text=e.text
            continue
        out.append(e)
    return out

def word_key(text):return re.sub(r'[^\w%$]','',text.lower())

def reveal_times(e,captions):
    """When each list/chip/icon item should appear: the moment its first word is spoken inside the card,
    else spread evenly over the first 70% of the card. Times only move forward."""
    words=[(c['startMs']/1000,word_key(c['text'])) for c in captions if e.start-.2<=c['startMs']/1000<=e.end]
    lead=min(.6,(e.end-e.start)*.15);spread=lambda i:e.start+lead+i*max(.35,(e.end-e.start)*.7/len(e.items))
    times=[];after=e.start
    for i,item in enumerate(e.items):
        keys=[word_key(w) for w in item.split() if len(word_key(w))>=2]
        hit=next((t for t,w in words if t>=after and any(k and (k in w or w in k) and len(w)>=2 for k in keys)),None)
        t=max(after,hit-.1 if hit is not None else spread(i));times.append(min(t,e.end-.3));after=times[-1]+.25
    return [(round(t,3),i+1) for i,t in enumerate(times)]

def check_plan(plan,folder):
    """Clamp to the clip and report anything the renderer cannot honour."""
    folder=Path(folder);meta=json.loads((folder/'manifest.json').read_text());tracks=json.loads((folder/'tracks.json').read_text())
    duration=meta['duration'];warnings=[];kept=[]
    seen=lambda t:any(t);clips=load_clips(folder);broll_until=-1.
    plan.caption_y=min(max(plan.caption_y,.1),.92)
    try:captions=json.loads((folder/'captions.json').read_text())['captions']
    except (OSError,ValueError,KeyError):captions=[]
    for e in merge_cards(sorted(plan.events,key=lambda e:e.start)):
        e.start=max(0,min(e.start,duration));e.end=max(e.start+1/FPS,min(e.end,duration))
        where=f"{'screen recording' if e.type=='broll' else 'no captions' if e.type=='no_captions' else e.type} at {e.start:.2f}s"
        if e.type=='sticker':
            if e.asset and not (folder/'assets'/e.asset).exists():warnings.append(f'{where}: image "{e.asset}" is not uploaded; skipped');continue
            if not e.asset and not e.emoji:warnings.append(f'{where}: needs an image or emoji; skipped');continue
            if e.anchor=='hand':
                sides=['left','right'] if e.hand=='any' else [e.hand]
                # Stay while the hand is still up: extend past the planned end through gaps of up to 0.4 s, at most 6 s.
                up=lambda f:any(0<=f<len(tracks['hands'][s]) and tracks['hands'][s][f] for s in sides)
                f=round(e.end*FPS);limit=min(round(duration*FPS)-1,f+6*FPS);gap=0
                while f<limit and gap<=12:gap=0 if up(f) else gap+1;f+=1
                if up(round(e.end*FPS)-1):e.end=max(e.end,(f-gap)/FPS)
                if not any(seen(tracks['hands'][s][round(e.start*FPS):round(e.end*FPS)+1]) for s in sides):warnings.append(f'{where}: no {e.hand} hand is tracked in this window; it will not appear')
            if e.anchor=='face' and not seen(tracks['face'][round(e.start*FPS):round(e.end*FPS)+1]):warnings.append(f'{where}: no face tracked in this window')
        if e.type=='broll':
            clip=clips.get(e.asset)
            if not clip:warnings.append(f'{where}: screen recording "{e.asset}" is not uploaded; skipped');continue
            if e.start<broll_until:warnings.append(f'{where}: overlaps another screen recording; skipped');continue
            e.speed=min(max(e.speed,.25),4.);e.src_start=min(max(e.src_start,0.),max(0.,clip['duration']-.5))
            available=clip['duration']-e.src_start
            if (e.end-e.start)*e.speed>available:
                e.speed=max(.25,available/(e.end-e.start))
                if (e.end-e.start)*e.speed>available:e.end=e.start+available/e.speed
                warnings.append(f'{where}: the recording is too short from {e.src_start:.1f}s, so it plays at {e.speed:.2f}x until {e.end:.1f}s')
            if e.layout=='front' and not (folder/'foreground.webm').exists():e.layout='full';warnings.append(f'{where}: no person cutout, so it is shown full screen')
            broll_until=e.end
        if e.type=='text' and not e.text.strip():warnings.append(f'{where}: empty text; skipped');continue
        if e.type=='look':
            where=f'look switch at {e.start:.2f}s'
            if e.look not in LOOKS:warnings.append(f'{where}: unknown look "{e.look}"; skipped');continue
            if e.look!='original' and LOOKS[e.look].get('mode')!='blur' and not (folder/'foreground.webm').exists():warnings.append(f'{where}: no person cutout yet, so it cannot switch to {e.look}; skipped');continue
            if any(k.type=='look' and k.end>e.start for k in kept):warnings.append(f'{where}: overlaps another look switch; skipped');continue
        if e.type=='card':
            where=f'{e.template} card at {e.start:.2f}s'
            e.items=[i.strip() for i in e.items if i.strip()][:6];e.active=min(max(e.active,1),max(1,len(e.items)))
            if e.template in ('steps','list','chips','icons') and len(e.items)<(1 if e.template=='list' else 2):warnings.append(f'{where}: needs at least {1 if e.template=="list" else 2} items; skipped');continue
            if e.template=='stat' and not e.value.strip():warnings.append(f'{where}: needs a value such as 400%; skipped');continue
            if e.template in ('quote','title') and not e.text.strip():warnings.append(f'{where}: needs text; skipped');continue
            for item in e.items if e.template=='icons' else []:
                if Path(item).suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif') and not (folder/'assets'/item).exists():warnings.append(f'{where}: image "{item}" is not uploaded; a letter tile is shown instead')
            if e.template in ('list','chips','icons') and not e.timeline:e.timeline=reveal_times(e,captions)
            if e.scene in ('dark','light','split'):
                if e.start<broll_until:warnings.append(f'{where}: overlaps a full-screen graphic or recording; skipped');continue
                broll_until=e.end
        cover=tracks.get('person',[])[round(e.start*FPS):round(e.end*FPS)+1]
        if e.type=='text' and e.behind_subject and cover and sum(cover)/len(cover)>.55:warnings.append(f'{where}: the person fills ~{round(100*sum(cover)/len(cover))}% of the frame, so text behind them will be mostly hidden')
        kept.append(e)
    plan.events=sorted(kept,key=lambda e:e.start);return check_background(plan,folder,warnings),warnings

HEX=re.compile(r'^#[0-9a-fA-F]{6}$')
def check_background(plan,folder,warnings):
    bg=plan.background
    # The creator dropped the old yellow accent (2026-10-23): plans saved before then get the new colours.
    if plan.highlight_color.upper()=='#FFD60A':plan.highlight_color=ACCENT
    for k in ['color','color2','light_color']:
        if getattr(bg,k).upper()=='#FFD60A':setattr(bg,k,LOOKS.get(bg.look,{}).get(k) or getattr(Background(),k))
    for k in ['blur','dim','glow','rim','vignette','spotlight','shadow','outline','wrap','reframe','grade','grain']:setattr(bg,k,min(max(getattr(bg,k),0.),1.))
    bg.scale=min(max(bg.scale,1.),1.2)
    for k in ['color','color2','light_color','outline_color']:
        if not HEX.match(getattr(bg,k)):setattr(bg,k,getattr(Background(),k));warnings.append(f'Background: {k} must be a hex color like #6EC1FF; reset')
    if bg.mode=='image' and not (bg.image and (Path(folder)/'assets'/bg.image).exists()):
        warnings.append(f'Background: image "{bg.image}" is not uploaded, so your room is blurred instead');bg.mode='blur'
    if bg.mode!='original' and not (Path(folder)/'foreground.webm').exists():
        warnings.append('Background: no person cutout yet (rebuild your edit), so the original background is kept');bg.mode='original'
    return plan

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
    clips=load_clips(folder)
    lines.append('Screen recordings for broll (exact filename as asset): '+(', '.join(f"{n} ({c['duration']:.1f}s, {'vertical' if c['height']>=c['width'] else 'wide'})" for n,c in clips.items()) or 'none'))
    lines.append('Transcript, [start s] word:\n'+' '.join(f"[{c['startMs']/1000:.2f}]{c['text'].strip()}" for c in captions) if captions else 'No speech detected.')
    lines.append('Accent palette (field highlight_color): '+', '.join(f'{k} {v}' for k,v in PALETTE.items()))
    lines.append('Background looks (field look): '+'; '.join(f'{k} = {v}' for k,v in LOOK_NOTES.items()))
    if notes.strip():lines.append('Creator instructions (follow these first):\n'+notes.strip())
    images=[]
    frames=sorted((folder/'keyframes').glob('*.jpg'));frames=[frames[round(i*(len(frames)-1)/11)] for i in range(12)] if len(frames)>12 else frames
    clip_frames=[f for n in clips for f in sorted((folder/'assets'/'.frames'/Path(n).stem).glob('*.jpg'))][:12]
    for p in frames+[folder/'assets'/a for a in assets][:6]+clip_frames:
        media='image/png' if p.suffix.lower()=='.png' else 'image/webp' if p.suffix.lower()=='.webp' else 'image/gif' if p.suffix.lower()=='.gif' else 'image/jpeg'
        label=('Uploaded image '+p.name) if p.parent.name=='assets' else f'Screen recording {p.parent.name}.mp4 at {float(p.stem):.1f}s' if p.parent.parent.name=='.frames' else f'Frame at {float(p.stem):.2f}s'
        images+=[{'type':'text','text':label},{'type':'image','source':{'type':'base64','media_type':media,'data':base64.standard_b64encode(p.read_bytes()).decode()}}]
    return '\n'.join(lines),images

PLANNER_SYSTEM="""You are a senior short-form video editor. You plan motion graphics for a vertical talking video that is rendered with Remotion from your JSON plan.
Style goals: retention-focused like top YouTube Shorts/TikTok creators, but never cluttered. One focal element at a time.
- Captions run automatically for every word; do not duplicate them as text events. Add a no_captions event (start, end) only where the creator asks for no captions. Pick caption_preset unless the creator chose one, Captions sit just under the speaker's chin automatically (caption_place face); caption_y is only the fallback, keep it about 0.7.
- Hook: a short bold text or a title card in the first 1-2 s that teases the payoff.
- Emphasize key numbers, claims and punchlines with text pops (1-5 words), zoom punch-ins (1.1-1.3, 0.4-1.5 s) and the occasional flash or shake. Space emphasis 2-5 s apart.
- Put text behind_subject only when a large headline sits where the person overlaps it, for a premium look.
- Stickers anchored to a hand only where that hand is visible in the tracking data; prefer a gesture trigger matching what the hand does (e.g. open_palm to reveal an object on the palm). Hand left/right means screen side. Use uploaded images when they fit the words; use emoji stickers sparingly.
- Screen recordings (broll): cut to them when the speaker talks about what is on screen ("open the app", "look at this", "here's the dashboard"), usually 2-8 s each, never overlapping. Pick src_start from the recording frames so the screen shows what is being said; raise speed (up to 3) to fit a longer action. Layouts: split for demos where the speaker keeps explaining, bubble when the screen needs the whole frame but the speaker's face matters, full for quick cutaways, front for a premium intro of the app. No hand stickers or text behind the subject during broll; captions stay on top.
- Motion-graphic cards (type card) carry structure: steps for numbered points, stat for numbers, icons for tools/apps, list/chips for examples, slider for before/after, progress for 'almost finished, then stopped' moments, quote and title for key lines. Split and full-screen scenes push the speaker video out of the way from `side`. Do not use emoji (stickers or card items): they look unprofessional to this creator; use words, uploaded images or cards. About one card per 6-12 s; full-screen scenes (dark/light/split) 2-4 s, never overlapping a screen recording. Fill emphasis for editorial and rise captions.
- Captions default to duo (two short lines, line 2 in the accent color). Other styles when the content asks for it: karaoke (word by word, energetic talking), pill (punchy tips, hooks), typewriter (tutorials, tech, step-by-step), quiet (calm storytelling, reflective), float (premium, aspirational), stack (short loud statements, under 40 s). Keep one caption style for the whole video. Pick highlight_color from the palette for contrast with the chosen look and the footage: sky or mint on warm or red scenes, coral or pink on blue or cool scenes, white when the scene is busy. Never yellow.
- Pick one graphics_style for every card and text pop: glass for tech, AI and apps; bold for loud tips and hooks; editorial for calm, premium storytelling; minimal when the footage is busy or the look is strong; tech for coding and data; brutal for bold opinions and hot takes; aurora for inspiring, creative or future topics; candy for friendly, playful, lifestyle; noir for luxury, fashion, serious reflection; swiss for facts, lists and clean business; clay for calm how-tos and wellness. Make graphics big and few. A card headline must add something: never repeat the list or step text word for word.
- Pick one background look for the whole video from the looks list, matched to the topic and mood (the person is cut out and placed on it). Prefer clean_blur when unsure; dark_glow or warm_studio for a premium feel; grid_paper or cream for teaching; color_pop only for short, loud videos; original when the real location matters to the story.
- Look switches (type look, start, end, look): only where the creator asks to change the background for a part, e.g. show the real room (original) while they point at their setup. Not on your own initiative.
- Sound design is automatic (auto_sound): only add sfx for a special moment the rules would miss, such as a ding on a big number.
- The speaker may talk in Amharic, English or both. Write text events in the language being spoken at that moment (Amharic in Ethiopic script); keep them short.
- Use only times inside the clip, aligned to the word timestamps. Do not invent speech."""

STYLE_GUIDE=ROOT/'docs'/'shorts-style.md'

def planner_system():
    """Planner rules plus the creator's style guide (docs/shorts-style.md)."""
    guide=STYLE_GUIDE.read_text() if STYLE_GUIDE.exists() else ''
    return PLANNER_SYSTEM+('\n\nThe creator\'s style guide (follow it):\n'+guide if guide else '')

def plan_from_json(data):
    """Plan from the planner's JSON. Unknown choices fall back to defaults; events that still do not fit are dropped."""
    events,dropped=[],[]
    defaults={k:f.default for k,f in Event.model_fields.items() if not f.is_required()}
    for raw in data.get('events') or []:
        if isinstance(raw,dict):raw={**defaults,**raw}  # a field the planner left out takes its default
        try:events.append(PlannerPlan.model_validate({'caption_preset':'editorial','caption_y':.7,'highlight_color':ACCENT,'progress_bar':False,'look':'original','graphics_style':'glass','emphasis':[],'notes':'','events':[raw]}).events[0])
        except ValidationError:dropped.append(f"{raw.get('type','?')} at {raw.get('start','?')}s" if isinstance(raw,dict) else str(raw)[:40])
    top={'caption_preset':'editorial','caption_y':.72,'highlight_color':ACCENT,'progress_bar':False,'look':'original','graphics_style':'glass','emphasis':[],'notes':'',
         **{k:v for k,v in data.items() if k!='events'}}
    try:plan=PlannerPlan.model_validate({**top,'events':events})
    except ValidationError:plan=PlannerPlan.model_validate({'caption_preset':'editorial','caption_y':.72,'highlight_color':ACCENT,'progress_bar':False,'look':'original','graphics_style':'glass','emphasis':[],'notes':str(top.get('notes',''))[:500],'events':events})
    return plan.to_plan(),dropped

def json_from_text(text):
    """The JSON object in a reply, ignoring any code fence or words around it."""
    a,b=text.find('{'),text.rfind('}')
    if a<0 or b<a:raise ValueError('no JSON object in the reply')
    return json.loads(text[a:b+1])

def plan_auto(folder,notes='',preset=None,status=None):
    """Ask Claude for a plan from transcript, tracking summary, frames and uploaded images.
    The plan schema is too large for enforced structured output (the compiled grammar is refused), so the
    planner writes JSON against the schema in its instructions and the editor validates it, asking once to fix broken JSON."""
    import anthropic
    text,images=planner_context(folder,notes)
    mode=json.loads((Path(folder)/'workflow-mode.json').read_text()).get('preset')
    if preset or mode not in (None,'auto'):text+=f"\nCaption preset chosen by the creator: {preset or mode}"
    client=anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY') or None)
    system=planner_system()+'\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema:\n'+json.dumps(PlannerPlan.model_json_schema(),separators=(',',':'))
    messages=[{'role':'user','content':images+[{'type':'text','text':text+'\n\nReturn the complete edit plan as JSON.'}]}]
    for attempt in range(2):
        response=interruptible(lambda:client.beta.messages.create(
            model=setting('SHORTS_PLANNER_MODEL','claude-opus-5-5'),max_tokens=16000,
            betas=['server-side-fallback-2026-07-01'],fallbacks='default',system=system,messages=messages),status)
        if response.stop_reason=='refusal':raise RuntimeError('The planner declined this request.')
        reply=''.join(getattr(b,'text','') for b in response.content)
        try:data=json_from_text(reply);break
        except ValueError as e:
            if attempt:raise RuntimeError(f'The planner did not return a readable plan ({response.stop_reason}: {e}).')
            messages+=[{'role':'assistant','content':reply},{'role':'user','content':f'That was not valid JSON ({e}). Reply with the corrected JSON object only.'}]
    plan,dropped=plan_from_json(data)
    try:
        before=load_plan(folder);mine=before.background
        if not mine.auto:plan.background=mine  # the creator chose a look: keep it
        if not before.graphics_auto:plan.graphics_style,plan.graphics_auto=before.graphics_style,False
        plan.caption_font,plan.caption_motion,plan.caption_fill,plan.caption_place,plan.caption_case,plan.captions_auto=before.caption_font,before.caption_motion,before.caption_fill,before.caption_place,before.caption_case,before.captions_auto
        if not before.captions_auto:plan.caption_preset,plan.highlight_color,plan.caption_y=before.caption_preset,before.highlight_color,before.caption_y
    except (OSError,ValueError):pass
    if (preset or mode not in (None,'auto')) and plan.captions_auto:plan.caption_preset=preset or mode
    plan,warnings=save_plan(folder,plan)
    if dropped:
        warnings=[f'Planner item not understood and left out: {d}' for d in dropped]+warnings
        Path(folder,'plan-warnings.json').write_text(json.dumps(warnings))
    return plan,warnings

def auto_edit(folder,notes='',status=say):
    """The whole edit without the creator touching anything: Claude cuts, the edit is built and tracked,
    Claude picks the look and plans graphics, then a draft renders for review. Paid Claude calls: cut + plan."""
    folder=Path(folder);tc=transcript_check(folder)
    if tc and tc['speech']>0 and tc['missing']>max(5,.1*tc['speech']):
        raise RuntimeError(f"About {tc['missing']:.0f}s of speech has no transcript, so an automatic cut could drop it. Check the spoken language, transcribe again, then edit.")
    def step(n,label):
        def update(message,progress=None):status(f'Step {n} of 4 · {label} · {message}' if message and not message.startswith('Step') else f'Step {n} of 4 · {label}',progress)
        return update
    if setting('ANTHROPIC_API_KEY'):
        step(1,'Claude is choosing what to keep')('',None);cut_auto(folder,notes,status=step(1,'Claude is choosing what to keep'))
    apply_cut(folder,step(2,'Building and tracking your edit'))
    if setting('ANTHROPIC_API_KEY'):
        step(3,'Claude is picking the look and planning graphics')('',None);plan_auto(folder,notes,status=step(3,'Claude is picking the look and planning graphics'))
    render(folder,False,step(4,'Rendering your draft'))
    plan=load_plan(folder);s=cut_summary(folder)
    return f"Draft ready · {s['kept']:.0f}s edit, {plan.background.look or plan.background.mode} look, {len(plan.events)} graphics"

# Card items appear one after another: frame ITEM_START, then every ITEM_GAP frames (Cards.tsx uses the same numbers).
ITEM_START=8;ITEM_GAP=6
# Effect loudness relative to the speaker's voice (dB): every family sits clearly under the voice.
REL_DB={'whoosh':-14,'texture':-11,'riser':-9,'hit':-10}

def voice_level(src):
    """Typical loudness of the voice (RMS of the louder 50 ms blocks) in the edit's audio."""
    pcm=decode_audio(src).mean(0).astype(np.float32)/32768;n=len(pcm)//2400
    if not n:return .05
    rms=np.sqrt((pcm[:n*2400].reshape(n,2400)**2).mean(1));loud=rms[rms>max(.003,float(np.percentile(rms,40)))]
    return float(np.percentile(loud,75)) if len(loud) else .05

def auto_sounds(plan,kit,cuts=(),voice=.05):
    """Sparse sound design from the graphics, always under the voice: a whoosh on real movement (its loudest
    moment on the fastest frame), one click per new element, an impact when a full-screen scene arrives and
    a riser + hit into the occasional big change (impacts, risers and hits only from the creator's own pack)."""
    out=[];placed=[e.start for e in plan.events if e.type=='sfx'];last={}
    family=lambda sound:'whoosh' if sound.startswith('whoosh') else 'riser' if sound.startswith('riser') else 'hit' if sound=='hit' else 'texture'
    gap={'whoosh':1.5,'texture':.8,'riser':25,'hit':25}
    def add(sound,at,align='peak'):
        if sound not in kit:return False
        peak,rms,length=kit[sound];fam=family(sound);start=at-(length if align=='end' else peak)
        if start<0 or any(abs(at-t)<.3 for t in placed) or at-last.get(fam,-99)<gap[fam]:return False
        last[fam]=at;vol=min(1.,voice*10**(REL_DB[fam]/20)/max(1e-4,rms))
        out.append(Event(type='sfx',start=round(start,3),end=round(start+.3,3),sound=sound,volume=round(vol,3)));return True
    whoosh=lambda at:add('whoosh-soft',at)
    scenes=[]
    for e in plan.events:
        if e.type=='zoom' and e.scale>=1.15:whoosh(e.start+2/FPS)
        elif e.type=='text':add('pop',e.start+2/FPS)
        elif e.type=='sticker' and e.trigger=='time':add('pop',e.start+2/FPS)
        elif e.type=='flash':add('camera-click',e.start)
        elif e.type=='broll':whoosh(e.start+2/FPS);scenes.append(e.start)
        elif e.type=='card':
            if e.scene in ('dark','light','split'):whoosh(e.start+2/FPS);add('impact',e.start+4/FPS);scenes.append(e.start)
            else:add('ui-click',e.start+2/FPS)
            for t,_ in e.timeline[1:]:add('ui-click',t+3/FPS)  # next item or step
    kinds=['riser-bass','riser-metal']
    for at in sorted(set(scenes)|{c for c in cuts if 4<=c<=9}):
        if at>=2.5 and add(kinds[sum(o.sound.startswith('riser') for o in out)%2],at,'end'):add('hit',at)
    return sorted(out,key=lambda e:e.start)

EMOJI_CACHE=ROOT/'models'/'emoji-cache'
EMOJI=re.compile('[\U0001F000-\U0001FAFF\u2600-\u27BF][\uFE0F\u200D\U0001F3FB-\U0001F3FF\U0001F000-\U0001FAFF\u2600-\u27BF]*')

def animated_emoji(emoji):
    """Google's Noto animated emoji (Lottie JSON) for an emoji, cached; None when there is no animation."""
    code='_'.join(f'{ord(c):x}' for c in emoji if ord(c)!=0xfe0f);path=EMOJI_CACHE/f'{code}.json'
    if path.exists():return json.loads(path.read_text()) if path.stat().st_size>2 else None
    try:
        import httpx
        r=httpx.get(f'https://fonts.gstatic.com/s/e/notoemoji/latest/{code}/lottie.json',timeout=20)
        data=r.json() if r.status_code==200 else None
    except Exception:return None  # offline: the plain emoji is drawn instead
    EMOJI_CACHE.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data) if data else '{}')
    return data

def emoji_animations(plan):
    """Animated versions of every emoji the plan shows (stickers and card items)."""
    found={m.group() for e in plan.events for text in [e.emoji,*e.items] for m in EMOJI.finditer(text or '')}
    return {k:v for k in sorted(found) if (v:=animated_emoji(k))}

def render_props(folder):
    folder=Path(folder);plan,warnings=check_plan(load_plan(folder),folder)
    meta=json.loads((folder/'manifest.json').read_text())
    if plan.auto_sound:
        try:cuts=[r['out'] for r in json.loads((folder/'cut-map.json').read_text())][1:]
        except (OSError,ValueError,KeyError):cuts=[]
        voiced=voice_track(folder)
        voice=voice_level(folder/(voiced or 'source.mp4')) if (folder/'source.mp4').exists() else .05
        plan.events=plan.events+auto_sounds(plan,sound_kit(folder,AUTO_SOUNDS),cuts,voice)
    kit=sound_kit(folder,sorted({e.sound for e in plan.events if e.type=='sfx'}))
    missing=sorted({e.sound for e in plan.events if e.type=='sfx' and e.sound not in kit})
    if missing:warnings.append(f"No recording for sound {', '.join(missing)}: add it to sfx-library/ (skipped)")
    plan.events=sorted([e for e in plan.events if e.type!='sfx' or e.sound in kit],key=lambda e:e.start)
    return {'fps':FPS,'width':meta['width'],'height':meta['height'],'durationInFrames':meta['frames'],
     'video':'source.mp4','voice':voice_track(folder),'foreground':'foreground.webm' if (folder/'foreground.webm').exists() else None,
     'captions':json.loads((folder/'captions.json').read_text())['captions'],
     'tracks':json.loads((folder/'tracks.json').read_text()),'plan':plan.model_dump(),'clips':load_clips(folder),
     'lottie':emoji_animations(plan),
     'looks':{e.look:look(e.look).model_dump() for e in plan.events if e.type=='look' and e.look in LOOKS},
     'assets':sorted(p.name for p in (folder/'assets').iterdir() if p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif')) if (folder/'assets').exists() else []},warnings

# Sound library. Real recordings only: the creator's own pack in sfx-library/<family>/ wins, then Remotion's
# free hosted recordings (cached in models/sfx-cache). Risers, hits and impacts only play from the creator's pack.
SFX_LIBRARY=ROOT/'sfx-library';SFX_CACHE=ROOT/'models'/'sfx-cache'
HOSTED=['whoosh','whip','ding','switch','mouse-click','shutter-modern','vine-boom','record-scratch','page-turn','anime-wow','yippee']
FAMILY={'whoosh-soft':'whoosh','whoosh-deep':'whoosh','whoosh-long':'whoosh','ui-click':'click','scifi-click':'click','pop':'click',
        'gears':'click','camera-click':'camera','impact':'impact','riser-bass':'riser','riser-metal':'riser','hit':'hit','success':'success'}
FALLBACK={'whoosh':'whoosh','click':'mouse-click','camera':'shutter-modern','success':'ding'}
AUTO_SOUNDS=['whoosh-soft','pop','ui-click','camera-click','impact','riser-bass','riser-metal','hit']  # what auto_sounds() places
AUDIO_EXT=('.wav','.mp3','.m4a','.aif','.aiff','.flac','.ogg')

def hosted_sound(name):
    path=SFX_CACHE/f'{name}.wav'
    if not path.exists():
        import httpx
        SFX_CACHE.mkdir(parents=True,exist_ok=True);r=httpx.get(f'https://remotion.media/{name}.wav',timeout=30);r.raise_for_status()
        path.with_suffix('.part').write_bytes(r.content);path.with_suffix('.part').replace(path)
    return path

def sound_source(name):
    """File for a plan sound name, or None when nothing real is available for it."""
    fam=FAMILY.get(name)
    if fam:
        own=sorted(p for d in [SFX_LIBRARY/fam,SFX_LIBRARY] for p in (d.glob('*') if d.is_dir() else []) if p.suffix.lower() in AUDIO_EXT and (d.name==fam or p.stem.lower().startswith(fam)))
        if own:return own[0]
        return hosted_sound(FALLBACK[fam]) if fam in FALLBACK else None
    return hosted_sound(name) if name in HOSTED else None

def sound_info(path):
    """(seconds to the loudest 10 ms, RMS of the audible body) of a sound file."""
    a=decode_audio(path).mean(0).astype(np.float32)/32768;n=max(1,len(a)//480);b=np.sqrt((a[:n*480].reshape(n,480)**2).mean(1))
    return round(float(np.argmax(b))*.01,3),float(np.mean(np.sort(b)[-max(1,n//3):])),len(a)/SR

def sound_kit(folder,names=None):
    """Copy the sounds this edit can use into the job's sfx/ folder; returns {name: (peak s, rms, length s)}."""
    out=Path(folder)/'sfx';out.mkdir(exist_ok=True);kit={}
    for name in names or SOUNDS:
        try:src=sound_source(name)
        except Exception:src=None
        if src is None:continue
        dst=out/f'{name}.wav'
        if not dst.exists():
            if src.suffix.lower()=='.wav':shutil.copyfile(src,dst)
            else:write_wav(decode_audio(src),dst)
        kit[name]=sound_info(dst)
    return kit

def render(folder,final=False,status=say):
    folder=Path(folder);need_motion()
    props,warnings=render_props(folder);(folder/'render-props.json').write_text(json.dumps(props))
    name='shorts-final.mp4' if final else 'shorts-draft.mp4';partial=folder/('.rendering-'+name)
    cmd=['npx','remotion','render','src/index.ts','Shorts',str(partial),'--props',str(folder/'render-props.json'),'--public-dir',str(folder),'--codec','h264','--crf','18' if final else '23','--log','info']+browser_args()
    if not final:cmd+=['--scale','0.5']
    label='Rendering the final video (full quality)' if final else 'Rendering a quick draft (half resolution)';status(label,0)
    proc=spawn(cmd,status,MOTION)
    tail=[]
    for line in proc.stdout:
        line=line.strip();tail=(tail+[line])[-15:]
        done=re.match(r'(Rendered|Encoded) (\d+)/(\d+)',line)
        if done:status(label,(.85 if done[1]=='Rendered' else .15)*int(done[2])/max(1,int(done[3]))+(.85 if done[1]=='Encoded' else 0))
    if finished(proc,status):raise RuntimeError('Render failed:\n'+'\n'.join(tail))
    partial.replace(folder/name);return folder/name,warnings

if __name__=='__main__':
    import argparse,uuid
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('prepare');c.add_argument('video');c.add_argument('--preset',default='bold',choices=PRESETS+['auto'])
    c=sub.add_parser('cut');c.add_argument('job');c.add_argument('--auto',action='store_true');c.add_argument('--notes',default='');c.add_argument('--file');c.add_argument('--apply',action='store_true')
    c=sub.add_parser('plan');c.add_argument('job');c.add_argument('--auto',action='store_true');c.add_argument('--notes',default='');c.add_argument('--file')
    c=sub.add_parser('render');c.add_argument('job');c.add_argument('--final',action='store_true')
    c=sub.add_parser('auto');c.add_argument('job');c.add_argument('--notes',default='')
    a=p.parse_args()
    if a.command=='prepare':
        folder=ROOT/'runs'/uuid.uuid4().hex;folder.mkdir(parents=True);shutil.copy2(a.video,folder/'upload.mp4');print('JOB:',folder.name,flush=True)
        prepare(folder/'upload.mp4',folder,a.preset);save_status(folder,'done','Ready · choose what to keep');print(json.dumps(cut_summary(folder)));raise SystemExit
    if len(a.job)!=32 or any(ch not in '0123456789abcdef' for ch in a.job):p.error('Expected a 32-character local job ID')
    folder=ROOT/'runs'/a.job
    if a.command=='auto':
        if not (folder/'units.json').exists():p.error('Prepare this job first')
        print(auto_edit(folder,a.notes));raise SystemExit
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
