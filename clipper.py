"""YouTube to Shorts: paste a link, Claude finds the moments that hook, teach or matter most, and each one becomes a
9:16 short in the Shorts editor (captions, look, graphics, sound) for the creator to review. Use it on videos you own
or have permission to reuse. Leaves this Mac: the download from YouTube, one Claude call to find the moments (or Claude
Code writes them by hand), the shorts editor's own steps, and ElevenLabs only when a video without captions is transcribed.

  python clipper.py fetch URL [--language am|en|auto]     download the video, its captions, chapters and most-replayed graph
  python clipper.py find JOB [--auto] [--count N] [--length auto|short|medium|long] [--notes TEXT] [--file MOMENTS.json]
  python clipper.py make JOB [--moments 1,3] [--framing auto|follow|fit] [--track fast|full|off] [--edit] [--notes TEXT]
"""
from pathlib import Path
from fractions import Fraction
import json,re,shutil,subprocess,time,uuid
import av,numpy as np
from PIL import Image
from pydantic import BaseModel,Field
import shorts
from shorts import FPS,SR,say
from config import ROOT,setting

RUNS=ROOT/'runs'/'clips'
FACE_PY=ROOT/'.venv-face'/'bin'/'python'
URL_RE=re.compile(r'^https?://(?:www\.|m\.|music\.)?(?:youtube\.com/(?:watch\?|shorts/|live/|embed/)|youtu\.be/)\S+$')
KINDS=['viral','informative','key','story','funny','emotional','controversial']
# Seconds a short may run, per length choice: auto lets Claude give each moment the time it needs.
LENGTHS={'auto':(20,75),'short':(15,30),'medium':(30,60),'long':(60,90)}
FRAMINGS=['auto','follow','fit']
PAD_IN=.15;PAD_OUT=.45  # breathing room before the hook and after the payoff
LIMIT_MIN=float(setting('CLIPS_MAX_MINUTES','180'))  # longest video accepted (the whole file is downloaded)

def read(path,name,default=None):
    try:return json.loads((Path(path)/name).read_text())
    except (OSError,ValueError):return default

def write(path,name,data):
    tmp=Path(path)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(path)/name)

def clock(s):s=int(s);return f'{s//3600}:{s%3600//60:02d}:{s%60:02d}' if s>=3600 else f'{s//60}:{s%60:02d}'

# ---------- 1. Download ----------

def ytdl(extra=None):
    """yt-dlp with this app's defaults: quiet, one video (never a playlist), Node for YouTube's player scripts, no ffmpeg needed."""
    import yt_dlp
    opts={'quiet':True,'no_warnings':True,'noprogress':True,'noplaylist':True,'fixup':'never','js_runtimes':{'node':{}},
          'retries':3,'socket_timeout':30,**(extra or {})}
    return yt_dlp.YoutubeDL(opts)

def check_url(url):
    url=url.strip()
    if not URL_RE.match(url):raise ValueError('Paste a YouTube video link (youtube.com/watch?v=…, youtu.be/…, or a Shorts link).')
    return url

def download(url,folder,kind,status,label,share):
    """One stream (video only or audio only) into folder; YouTube serves them separately above 360p, and joining
    them here with PyAV avoids needing ffmpeg. share=(start, size) of the overall progress bar."""
    fmt={'video':'bv*[vcodec^=avc1][height<=1080]/bv*[height<=1080]/b[height<=1080]/b',
         'audio':'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b'}[kind]
    def hook(d):
        if d.get('status')=='downloading':
            total=d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            if total:status(label,share[0]+share[1]*min(1,d.get('downloaded_bytes',0)/total))
    with ytdl({'format':fmt,'outtmpl':str(Path(folder)/f'{kind}.%(ext)s'),'progress_hooks':[hook]}) as y:
        shorts.interruptible(lambda:y.download([url]),status)
    found=[p for p in Path(folder).glob(f'{kind}.*') if not p.name.endswith(('.part','.ytdl'))]
    if not found:raise RuntimeError(f'YouTube sent no {kind} stream for this video.')
    return found[0]

def join_streams(video,audio,dst):
    """Video and audio packets copied unchanged into one MP4."""
    tmp=Path(dst).with_suffix('.part.mp4')
    with av.open(str(video)) as vin,av.open(str(audio)) as ain,av.open(str(tmp),'w') as out:
        vs=out.add_stream_from_template(vin.streams.video[0])
        streams=[(vin,vin.streams.video[0],vs)]
        if ain.streams.audio:streams.append((ain,ain.streams.audio[0],out.add_stream_from_template(ain.streams.audio[0])))
        for inp,src,dst_stream in streams:
            for p in inp.demux(src):
                if p.dts is None:continue
                p.stream=dst_stream;out.mux(p)
    tmp.replace(dst)

def pick_captions(info,language):
    """The video's own captions in the spoken language: the creator's uploaded ones first, then YouTube's automatic
    ones in the original language (never one of YouTube's machine translations). Returns (url, kind) or None."""
    want=None if language=='auto' else language
    orig=(info.get('language') or '').split('-')[0] or None
    def best(tracks,lang_ok):
        for lang,items in tracks.items():
            if lang_ok(lang):
                for it in items:
                    if it.get('ext')=='json3':return it['url']
    manual=info.get('subtitles') or {};auto=info.get('automatic_captions') or {}
    base=lambda lang:lang.split('-')[0]
    url=best(manual,lambda l:base(l)==(want or orig) and l!='live_chat')
    if url:return url,'youtube-captions'
    # Automatic captions in the original language are marked -orig (or carry the video's own language code);
    # every other language there is a translation of them.
    url=best(auto,lambda l:l.endswith('-orig') and (not want or base(l)==want)) or best(auto,lambda l:l==orig and (not want or base(l)==want))
    return (url,'youtube-auto') if url else None

def json3_captions(data):
    """YouTube json3 captions to word captions. Automatic captions carry a time per word; uploaded ones a time per
    line, whose words are spread over the line by length."""
    out=[]
    for ev in data.get('events') or []:
        segs=[s for s in ev.get('segs') or [] if s.get('utf8','').strip()]
        if not segs:continue
        t0=ev.get('tStartMs',0);dur=ev.get('dDurationMs',0)
        if len(segs)>1 or 'tOffsetMs' in segs[0]:
            times=[t0+s.get('tOffsetMs',0) for s in segs]+[t0+dur]
            for s,a,b in zip(segs,times,times[1:]):
                for w in s['utf8'].split():out.append({'text':' '+w,'startMs':a,'endMs':max(a+1,b)})
        else:
            words=segs[0]['utf8'].split();chars=sum(len(w) for w in words) or 1;pos=0
            for w in words:
                a=t0+dur*pos/chars;pos+=len(w);out.append({'text':' '+w,'startMs':round(a),'endMs':round(max(a+1,t0+dur*pos/chars))})
    out.sort(key=lambda c:c['startMs'])
    for c,n in zip(out,out[1:]):c['endMs']=max(c['startMs']+1,min(c['endMs'],n['startMs']))  # auto captions overlap a little
    return [{**c,'timestampMs':(c['startMs']+c['endMs'])//2,'confidence':1} for c in out]

def fetch(url,folder,language='am',status=say):
    """Step 1: the video at up to 1080p, plus its title, chapters, most-replayed graph and captions. Then the transcript:
    from YouTube's captions when there are any (free), else transcribed here (whisper.cpp for English) or, for
    Amharic, left for the creator to approve with ElevenLabs (paid per minute)."""
    folder=Path(folder);url=check_url(url)
    status('Reading the YouTube page',None)
    with ytdl() as y:info=shorts.interruptible(lambda:y.extract_info(url,download=False),status)
    if info.get('_type')=='playlist':raise ValueError('That link is a playlist. Paste the link of one video.')
    if info.get('is_live') or info.get('live_status') in ('is_live','is_upcoming'):raise ValueError('That video is live or not out yet. Try again once it has finished.')
    duration=float(info.get('duration') or 0)
    if duration>LIMIT_MIN*60:raise ValueError(f'That video is {duration/60:.0f} minutes. Use one of {LIMIT_MIN:g} minutes or less (CLIPS_MAX_MINUTES).')
    keep={k:info.get(k) for k in ['id','title','channel','uploader','duration','description','chapters','heatmap','language','webpage_url','upload_date','view_count']}
    write(folder,'info.json',keep)
    job=read(folder,'job.json',{});job.update(title=(info.get('title') or 'YouTube video')[:120],channel=info.get('channel') or info.get('uploader') or '',duration=duration)
    write(folder,'job.json',job)
    found=pick_captions(info,language)
    video=download(url,folder,'video',status,'Downloading the video',(0,.75))
    audio=download(url,folder,'audio',status,'Downloading the sound',(.75,.2))
    status('Joining picture and sound',.96);join_streams(video,audio,folder/'source.mp4')
    video.unlink(missing_ok=True);audio.unlink(missing_ok=True)
    try:shorts.thumbnail(folder/'source.mp4',folder/'thumb.jpg')
    except Exception:pass  # the list just shows no picture
    write(folder,'source-info.json',shorts.probe(folder/'source.mp4'))
    if found:
        import httpx
        status('Reading the captions',None)
        r=shorts.interruptible(lambda:httpx.get(found[0],timeout=60),status)
        if r.status_code<400:
            path=folder/'transcript.json'
            path.write_text(json.dumps({'provider':found[1],'exact':False,'captions':json3_captions(r.json())}))
            if len(shorts.clean_captions(path))>=20:return units_from(folder)
    return transcribe(folder,status,paid_ok=False)

def transcribe(folder,status=say,paid_ok=False):
    """The whole video's words when YouTube has no captions. whisper.cpp runs here for free; ElevenLabs Scribe (needed
    for Amharic) is paid per minute, so it runs only when the creator says so. Its words are exact, so each short
    reuses them instead of paying for a second transcript."""
    folder=Path(folder);minutes=read(folder,'source-info.json',{}).get('duration',0)/60
    if shorts.transcriber()=='elevenlabs' and not paid_ok:
        write(folder,'transcript-needed.json',{'minutes':round(minutes,1)})
        return f'This video has no captions. Transcribe its {minutes:.0f} minutes with ElevenLabs Scribe (paid per minute) to find the moments.'
    if shorts.transcriber()=='whisper' and shorts.job_language(folder)=='am':
        raise ValueError('This video has no captions, and Amharic needs ElevenLabs Scribe: add ELEVENLABS_API_KEY to .env, or set the language to English if it is spoken in English.')
    shorts.transcribe(folder/'source.mp4',folder,'transcript.json',status)
    data=read(folder,'transcript.json');data.update(exact=True,provider=data.get('provider') or 'whisper');write(folder,'transcript.json',data)
    for stale in ['speech-16k.wav','speech-map.npy','transcript-check.json','transcript-needed.json']:(folder/stale).unlink(missing_ok=True)
    return units_from(folder)

def units_from(folder):
    folder=Path(folder);captions=read(folder,'transcript.json')['captions']
    if len(captions)<20:raise ValueError('This video has almost no speech to make shorts from.')
    units=shorts.make_units(captions)
    replay=replay_levels(read(folder,'info.json',{}).get('heatmap'),units)
    for u,r in zip(units,replay):u['replay']=r
    write(folder,'units.json',units)
    return f'Transcript ready · {len(units)} parts · finding the best moments next'

def replay_levels(heatmap,units):
    """How much each transcript part is replayed on YouTube (0-1, the 'Most replayed' graph), or None without one."""
    if not heatmap:return [None]*len(units)
    return [round(max([h['value'] for h in heatmap if h['end_time']>u['start'] and h['start_time']<u['end']] or [0]),2) for u in units]

# ---------- 2. Find the moments ----------

FIND_SYSTEM="""You are the best short-form video editor alive: you turn long YouTube videos into Shorts, Reels and TikToks that stop the scroll and get watched to the end.
You get the video's transcript split into numbered parts with timings, and sometimes its chapters and how often each part is replayed on YouTube (replay 0-1: 1 is the most replayed moment of the video; a strong signal of what viewers loved).
Choose the moments that work as stand-alone shorts. Look for:
- viral: a bold or surprising claim, a hot take, a counter-intuitive truth, a strong emotion, a conflict, a line people will quote or argue about.
- informative: one clear tip, method, number or explanation a viewer can use or repeat, delivered tightly.
- key: the core idea or turning point of the video, the thing it is really about.
- story: a complete mini-story with a setup, a turn and a payoff.
- funny, emotional, controversial: a genuine laugh, a moving moment, a debate starter.
Rules for every moment:
- The hook comes first. It must open on a sentence that grabs a stranger in the first 2 seconds (a claim, a question, a number, a conflict, a striking statement). Start on that sentence, not on its warm-up ("so", "and then", "as I said").
- It must make sense without the rest of the video: no "as I said earlier", no pointing at things on screen the viewer cannot see, no unexplained names.
- It ends on the payoff: the answer, the punchline, the lesson, the twist. Never stop mid-thought, and never trail on into the next topic.
- One idea per short. Skip intros, channel plugs, sponsor reads, "like and subscribe", outros and housekeeping.
- Moments must not overlap. Spread them across the video when the strength is equal; replayed parts deserve a close look.
- score honestly: 90+ only for moments you would bet on; a weak moment does not belong in the list at all.
- title and hook are in the language the moment is spoken in (Ethiopic script for Amharic, English terms as spoken). The hook is at most 8 words and makes the viewer need the answer, without lying about what follows.
The speaker may mix Amharic and English. Both languages are real content. Amharic transcripts contain recognition errors: judge by meaning.
Creator instructions override these defaults."""

class Moment(BaseModel):
    first:int=Field(description='id of the first transcript part: the hook sentence the short opens on')
    last:int=Field(description='id of the last transcript part: the payoff the short ends on')
    title:str=Field(description='working title for the creator, 3-8 words, in the spoken language')
    hook:str=Field(description='on-screen hook for the first 2 seconds, at most 8 words, in the spoken language')
    kind:str=Field(description='one of: '+', '.join(KINDS))
    score:int=Field(description='0-100: how likely this short holds a stranger who is scrolling')
    why:str=Field(description='one sentence for the creator: why this moment works as a short')

class MomentPicks(BaseModel):
    moments:list[Moment]
    summary:str=Field(description='one or two sentences for the creator: what the video is about and what you picked')

def find_context(folder,count='auto',length='auto',notes=''):
    folder=Path(folder);info=read(folder,'info.json',{});units=read(folder,'units.json');lo,hi=LENGTHS.get(length,LENGTHS['auto'])
    lines=[f"Video: {info.get('title','')} · {info.get('channel') or info.get('uploader') or ''} · {(info.get('duration') or 0)/60:.0f} min"]
    if info.get('description'):lines.append('Description: '+re.sub(r'\s+',' ',info['description'])[:600])
    if info.get('chapters'):lines.append('Chapters: '+' | '.join(f"{clock(c['start_time'])} {c['title']}" for c in info['chapters']))
    has_replay=any(u.get('replay') is not None for u in units)
    lines.append(f'\nTranscript ({len(units)} parts' + (', with replay levels' if has_replay else '')+'):')
    for u in units:
        r=f" (replay {u['replay']:.2f})" if u.get('replay') is not None and u['replay']>=.3 else ''
        lines.append(f"[{u['id']}] {clock(u['start'])}-{clock(u['end'])}{r}: {u['text']}")
    want='every moment that is genuinely strong (usually 3-8, at most 12)' if count in ('auto','',None,0) else f'the {int(count)} strongest moments'
    lines.append(f'\nPick {want}. Each short runs {lo}-{hi} seconds of speech'+(' (give each moment the time its idea needs)' if length=='auto' else '')+'. List them strongest first.')
    if notes.strip():lines.append('\nCreator instructions (follow these first):\n'+notes.strip())
    return '\n'.join(lines)

def find_auto(folder,count='auto',length='auto',notes='',status=None):
    """One Claude call reads the transcript (text only) and picks the moments. Streamed with room to think: an hour-long
    transcript is ~25k tokens, and Claude's thinking counts against max_tokens (16k ran out before the answer)."""
    import anthropic
    client=anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY') or None)
    def call():
        with client.beta.messages.stream(
            model=setting('CLIPS_MODEL',setting('SHORTS_PLANNER_MODEL','claude-opus-5-5')),max_tokens=64000,
            output_config={'effort':setting('CLIPS_EFFORT','high')},
            betas=['server-side-fallback-2026-07-01'],fallbacks='default',system=FIND_SYSTEM,
            messages=[{'role':'user','content':find_context(folder,count,length,notes)+'\n\nFind the moments.'}],
            output_format=MomentPicks) as stream:
            return stream.get_final_message()
    response=shorts.interruptible(call,status)
    if response.stop_reason=='refusal':raise RuntimeError('Claude declined this request.')
    if response.stop_reason=='max_tokens':raise RuntimeError('Claude ran out of room before listing the moments. Try again with fewer shorts or a note on what to look for, or set CLIPS_EFFORT=medium in .env.')
    if response.parsed_output is None:raise RuntimeError(f'Claude returned no moments ({response.stop_reason}).')
    return save_moments(folder,response.parsed_output.model_dump(),{'count':count,'length':length,'notes':notes,'by':'claude-api'})

def ids_for(units,start,end):
    """Transcript parts covering a time range in seconds (for moments written with times instead of part ids)."""
    inside=[u['id'] for u in units if u['end']>start+.2 and u['start']<end-.2]
    if not inside:raise ValueError(f'No speech between {clock(start)} and {clock(end)}.')
    return inside[0],inside[-1]

def save_moments(folder,data,settings=None):
    """Check and store moments: parts in range and in order, sensible lengths, no overlaps (the weaker one goes)."""
    folder=Path(folder);units=read(folder,'units.json');info=read(folder,'source-info.json',{});dur=info.get('duration') or units[-1]['end']
    if isinstance(data,(str,bytes)):data=json.loads(data)
    lo,hi=LENGTHS.get((settings or {}).get('length','auto'),LENGTHS['auto']);warnings=[];kept=[]
    for k,m in enumerate(data.get('moments') or []):
        name=m.get('title') or f'Moment {k+1}'
        try:
            if 'first' not in m:m['first'],m['last']=ids_for(units,float(m['start']),float(m['end']))
            first,last=int(m['first']),int(m['last'])
        except (KeyError,TypeError,ValueError) as e:warnings.append(f'{name}: left out, no usable parts or times ({e})');continue
        if not (0<=first<=last<len(units)):warnings.append(f'{name}: left out, parts {first}-{last} are not in the transcript');continue
        start=max(0.,units[first]['start']-PAD_IN);end=min(dur,units[last]['end']+PAD_OUT);length=end-start
        if length<8:warnings.append(f'{name}: left out, only {length:.0f}s');continue
        if length>180:warnings.append(f'{name}: left out, {length:.0f}s is longer than a short can be (3 min)');continue
        if not lo*.75<=length<=hi*1.3:warnings.append(f'{name}: {length:.0f}s, outside the {lo}-{hi}s asked for')
        kind=m.get('kind') if m.get('kind') in KINDS else 'key'
        kept.append({'first':first,'last':last,'start':round(start,2),'end':round(end,2),'duration':round(length,1),'title':str(name)[:80],
                     'hook':str(m.get('hook') or '')[:80],'kind':kind,'score':max(0,min(100,int(m.get('score') or 50))),'why':str(m.get('why') or '')[:300]})
    kept.sort(key=lambda m:-m['score']);final=[]
    for m in kept:
        clash=next((o for o in final if min(m['end'],o['end'])-max(m['start'],o['start'])>.3*min(m['duration'],o['duration'])),None)
        if clash:warnings.append(f"{m['title']}: left out, it overlaps the stronger “{clash['title']}”");continue
        final.append(m)
    if not final:raise ValueError('No usable moments: '+('; '.join(warnings) or 'the list was empty'))
    old={(m['first'],m['last']):m.get('job') for m in (read(folder,'moments.json') or {}).get('moments',[])}
    for n,m in enumerate(final,1):m.update(n=n,job=old.get((m['first'],m['last'])))  # a short already made stays linked
    out={'moments':final,'summary':str(data.get('summary') or ''),'warnings':warnings,'settings':settings or {},'saved':time.time()}
    write(folder,'moments.json',out);return out

# ---------- 3. Make the shorts ----------

def face_scan(src,start,end,status=say):
    """Face positions (5 a second) and shot changes in part of a wide video, from the local face tracker."""
    if not FACE_PY.exists():return None
    out=Path(src).parent/f'.faces-{start:.2f}.json'
    try:
        shorts.run_with_progress([str(FACE_PY),str(ROOT/'clipper_faces.py'),str(src),str(start),str(end),str(out)],status,'Finding the speaker')
        return json.loads(out.read_text())
    finally:out.unlink(missing_ok=True)

def shot_plan(scan,duration,framing):
    """Per shot: ('follow', centre x per output frame) or ('fit', None). A speaker who barely moves gets one steady
    crop for the whole shot (it looks filmed, not tracked); one who moves is followed smoothly. Shots with no face
    (slides, screens, wide B-roll) are shown whole over a blurred fill."""
    n=max(1,round(duration*FPS))
    if framing=='fit' or not scan:return [(0,n,'fit',None)]
    rate=scan['fps'];samples=scan['samples'];plan=[]
    cuts=[0]+sorted({round(t*FPS) for t in scan['cuts']+face_jumps(scan) if 0<t*FPS<n})+[n]
    for a,b in zip(cuts,cuts[1:]):
        if b<=a:continue
        idx=[i for i in range(len(samples)) if a<=i/rate*FPS<b]
        got=[(i,samples[i][0]) for i in idx if samples[i]]
        if not got or (framing=='auto' and len(got)<.3*max(1,len(idx))):plan.append((a,b,'fit',None));continue
        xs=np.array([x for _,x in got]);ts=np.array([i/rate*FPS for i,_ in got])
        if xs.max()-xs.min()<=.07:centre=np.full(b-a,float(np.median(xs)))
        else:
            k=max(1,round(rate*1.2));pad=np.pad(xs,(k,k),mode='edge');smooth=np.convolve(pad,np.ones(2*k+1)/(2*k+1),'valid')
            centre=np.interp(np.arange(a,b),ts,smooth)
        plan.append((a,b,'follow',centre))
    return plan

def face_jumps(scan,far=.18):
    """Shot changes the picture alone missed: the face jumps across the frame and stays there (two cameras on one set).
    Placed on the biggest picture change between the two samples, so the crop switches on the cut frame."""
    rate=scan['fps'];found=[(i,s[0]) for i,s in enumerate(scan['samples']) if s];out=[]
    cur=found[0][1] if found else None  # where the speaker is in this shot; one stray detection does not move it
    for (i,_),(j,b),nxt in zip(found,found[1:],found[2:]+[None]):
        if abs(b-cur)<=far:cur=b
        elif nxt is None or abs(nxt[1]-b)<=far:
            near=[x for x in scan.get('jolts',[]) if i/rate<x[0]<=j/rate]
            out.append(max(near,key=lambda x:x[1])[0] if near else j/rate);cur=b
    return out

def audio_slice(src,start,end):
    """Stereo PCM at SR for [start, end) seconds, counted from the start of the file (AAC times shift after a seek)."""
    a,b=round(start*SR),round(end*SR);chunks=[];pos=None
    with av.open(str(src)) as inp:
        if not inp.streams.audio:return np.zeros((2,b-a),np.int16)
        rs=av.AudioResampler(format='s16p',layout='stereo',rate=SR)
        for f in inp.decode(audio=0):
            if pos is None:pos=round(max(0.,float(f.time or 0))*SR)
            for x in rs.resample(f):
                x=x.to_ndarray();lo,hi=max(a,pos),min(b,pos+x.shape[1])
                if hi>lo:chunks.append(x[:,lo-pos:hi-pos])
                pos+=x.shape[1]
            if pos>=b:break
    pcm=np.concatenate(chunks,axis=1) if chunks else np.zeros((2,0),np.int16)
    return np.ascontiguousarray(np.pad(pcm,((0,0),(0,max(0,b-a-pcm.shape[1]))))[:,:b-a])

def cut_clip(src,dst,start,end,framing='auto',status=say):
    """One moment as a vertical 30 fps clip with its sound (re-encoded once, AAC 256k). Wide video is cropped to 9:16
    around the speaker; vertical video keeps its picture."""
    info=shorts.probe(src);wide=info['width']>info['height'];duration=end-start
    scan=face_scan(src,start,end,status) if wide and framing!='fit' else None
    shots=shot_plan(scan,duration,framing) if wide else None
    w,h=(1080,1920) if wide else shorts.output_size(info['width'],info['height'])
    tmp=Path(dst).with_suffix('.part.mp4');count=max(1,round(duration*FPS));message='Cutting the clip'
    with av.open(str(src)) as inp,av.open(str(tmp),'w') as out:
        vin=inp.streams.video[0]
        inp.seek(int(max(0,start-2)/float(vin.time_base)),stream=vin,backward=True)
        vs=out.add_stream('libx264',rate=FPS);vs.width,vs.height,vs.pix_fmt=w,h,'yuv420p';vs.options={'crf':'17','preset':'medium'}
        aus=out.add_stream('aac',rate=SR);aus.layout='stereo';aus.bit_rate=256000
        frames=inp.decode(video=0);cur=next(frames);nxt=next(frames,None);shot=0
        for i in range(count):
            t=start+i/FPS
            while nxt is not None and float(nxt.time)<=t:cur=nxt;nxt=next(frames,None)
            im=shorts.upright(cur)
            if wide:
                while shot<len(shots)-1 and i>=shots[shot][1]:shot+=1
                a,_,mode,centre=shots[shot]
                if mode=='follow':
                    cw=min(im.width,round(im.height*9/16));x=round(float(centre[min(i-a,len(centre)-1)])*im.width-cw/2)
                    x=max(0,min(im.width-cw,x));im=im.crop((x,0,x+cw,im.height)).resize((w,h),Image.Resampling.BICUBIC)
                else:im=shorts.fit_frame(im,w,h)
            elif im.size!=(w,h):im=im.resize((w,h))
            f=av.VideoFrame.from_image(im);f.pts=i;f.time_base=Fraction(1,FPS)
            for p in vs.encode(f):out.mux(p)
            if i%30==0:status(message,.9*i/count)
        for p in vs.encode():out.mux(p)
        shorts.encode_pcm(out,aus,audio_slice(src,start,end))
        for p in aus.encode():out.mux(p)
    tmp.replace(dst)
    return {'framing':'fit' if not wide else ('follow' if any(s[2]=='follow' for s in shots) else 'fit'),'shots':len(shots) if shots else 1}

def edit_notes(folder,m,notes=''):
    """What the Shorts editor's Claude steps are told about a clipped moment."""
    info=read(folder,'info.json',{})
    lines=[f"This short is a moment cut from the YouTube video “{info.get('title','')}”"+(f" ({info['channel']})" if info.get('channel') else '')+
           f", picked as a {m['kind']} moment: {m['why']}",
           'The moment was already chosen to stand alone: keep every point and the payoff, in order. Remove only dead air, false starts, stumbles and filler.']
    if m.get('hook'):lines.append(f"Open on the hook: show “{m['hook']}” as on-screen text in the first 2 seconds (one compact title card or text pop, clear of the face), then let the captions carry it.")
    if notes.strip():lines.append(notes.strip())
    return '\n'.join(lines)

def seed_words(folder,start,end):
    """The moment's words from the whole video's transcript, timed from the clip start, when that transcript is exact
    (ElevenLabs or whisper): the short then needs no second transcription. None for YouTube's captions."""
    data=read(folder,'transcript.json',{})
    if not data.get('exact'):return None
    words=[{**c,'startMs':round(c['startMs']-start*1000),'endMs':round(c['endMs']-start*1000),'timestampMs':None}
           for c in data['captions'] if c['startMs']>=start*1000-50 and c['endMs']<=end*1000+50]
    return {'language':data.get('language'),'provider':data.get('provider'),'captions':words}

def new_short(folder,m,framing='auto',track='fast',preset='duo',noise='off',language=None,client=None,edit=True,notes='',status=say):
    """Cut one moment and set it up as a Shorts editor video (runs/ID). Returns its folder; transcribing and editing
    it are the Shorts editor's own steps."""
    import clients
    folder=Path(folder);job=read(folder,'job.json',{});language=language or job.get('language') or 'am'
    path=shorts.ROOT/'runs'/uuid.uuid4().hex;path.mkdir(parents=True)
    try:
        made=cut_clip(folder/'source.mp4',path/'upload.mp4',m['start'],m['end'],framing,status)
        who=clients.get(client);kit=(who or {}).get('kit')
        source={'kind':'youtube','url':job.get('url'),'video':job.get('title'),'clips':folder.name,'moment':m['n'],'start':m['start'],'end':m['end'],
                'hook':m.get('hook'),'framing':made['framing']}
        write(path,'job.json',{'title':m['title'][:80],'created':time.time(),'client':who['id'] if who else None,'kit':kit,'source':source})
        mode={'mode':'shorts','preset':preset,'noise':noise,'tracking':track,'language':language or (kit or {}).get('language') or 'am'}
        if kit and kit.get('voice'):mode['voice']=kit['voice']
        write(path,'workflow-mode.json',mode)
        seed=seed_words(folder,m['start'],m['end'])
        if seed and noise=='off':write(path,'seed-captions.json',seed)
        if edit:write(path,'auto.json',{'notes':edit_notes(folder,m,notes)[:2000]})
        shorts.save_status(path,'idle','Waiting for the shorts before it')
    except BaseException:
        shutil.rmtree(path,ignore_errors=True);raise
    return path

def make(folder,picks=None,status=say,**settings):
    """Cut every chosen moment into its own Shorts video (all of them, strongest first, when picks is None)."""
    folder=Path(folder);data=read(folder,'moments.json')
    if not data:raise ValueError('Find the moments first.')
    chosen=[m for m in data['moments'] if (picks is None or m['n'] in picks) and not (m.get('job') and (shorts.ROOT/'runs'/m['job']/'upload.mp4').exists())]
    made=[]
    for k,m in enumerate(chosen):
        def step(message,p=None,k=k):status(f'Short {k+1} of {len(chosen)} · {message}',p)
        path=new_short(folder,m,status=step,**settings);m['job']=path.name;made.append(path)
        write(folder,'moments.json',data)
    return made

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('fetch');c.add_argument('url');c.add_argument('--language',default='am',choices=shorts.LANGUAGES)
    c=sub.add_parser('transcribe');c.add_argument('job')
    c=sub.add_parser('find');c.add_argument('job');c.add_argument('--auto',action='store_true');c.add_argument('--count',default='auto')
    c.add_argument('--length',default='auto',choices=list(LENGTHS));c.add_argument('--notes',default='');c.add_argument('--file')
    c=sub.add_parser('make');c.add_argument('job');c.add_argument('--moments');c.add_argument('--framing',default='auto',choices=FRAMINGS)
    c.add_argument('--track',default='fast',choices=shorts.TRACKING);c.add_argument('--preset',default='duo',choices=shorts.PRESETS+['auto'])
    c.add_argument('--edit',action='store_true',help='Claude edits each short (cut, look, graphics) and renders a draft: two Claude calls per short')
    c.add_argument('--notes',default='')
    a=p.parse_args()
    if a.command=='fetch':
        folder=RUNS/uuid.uuid4().hex;folder.mkdir(parents=True);print('JOB:',folder.name,flush=True)
        write(folder,'job.json',{'url':a.url,'created':time.time(),'language':a.language})
        write(folder,'workflow-mode.json',{'mode':'clips','language':a.language})
        print(fetch(a.url,folder,a.language));raise SystemExit
    if len(a.job)!=32 or any(ch not in '0123456789abcdef' for ch in a.job):p.error('Expected a 32-character local job ID')
    folder=RUNS/a.job
    if a.command=='transcribe':print(transcribe(folder,paid_ok=True));raise SystemExit
    if not (folder/'units.json').exists():p.error('This video has no transcript yet: python clipper.py transcribe JOB')
    if a.command=='find':
        if a.auto:out=find_auto(folder,a.count,a.length,a.notes)
        elif a.file:out=save_moments(folder,Path(a.file).read_text(),{'count':a.count,'length':a.length,'notes':a.notes,'by':'claude-code'})
        else:print(find_context(folder,a.count,a.length,a.notes));raise SystemExit
        for m in out['moments']:print(f"{m['n']}. [{m['score']}] {clock(m['start'])}-{clock(m['end'])} ({m['duration']:.0f}s) {m['kind']}: {m['title']} · hook: {m['hook']}")
        [print('WARNING:',w) for w in out['warnings']];raise SystemExit
    picks={int(x) for x in a.moments.split(',')} if a.moments else None
    lang=read(folder,'job.json',{}).get('language')
    for path in make(folder,picks,framing=a.framing,track=a.track,preset=a.preset,language=lang,edit=a.edit,notes=a.notes):
        print('SHORT:',path.name,flush=True)
        shorts.prepare(path/'upload.mp4',path,a.preset)
        wanted=read(path,'auto.json')
        if wanted:(path/'auto.json').unlink();print(shorts.auto_edit(path,wanted['notes']))
        shorts.save_status(path,'done','Ready to review')
