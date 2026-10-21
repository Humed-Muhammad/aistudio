"""Audio cleaner and transcriber: remove background noise from any recording and/or write its transcript.
Works on audio (mp3, wav, m4a, …) and video; a video gets its picture copied unchanged with the cleaned sound.
Uses the shorts editor's engines: RNNoise or ElevenLabs Voice Isolator, then ElevenLabs Scribe or whisper.cpp.

  python cleaner.py FILE [--noise light|strong|off] [--language am|om|en|auto] [--no-transcript]
"""
from pathlib import Path
import argparse,json,re,shutil,time,uuid
import av,numpy as np
import shorts
from shorts import SR,say
from config import ROOT,setting
RUNS=ROOT/'runs'/'cleaner'
NOISE=shorts.NOISE;LANGUAGES=['am','om','en','auto']  # om = Afaan Oromoo (Oromifa)
NAMES={'am':'Amharic','om':'Oromo','en':'English'}
CODES={'amh':'am','am':'am','orm':'om','om':'om','gaz':'om','hae':'om','eng':'en','en':'en'}
# Frequent Afaan Oromoo words, and Somali ones: both are Latin-script Cushitic with doubled vowels, dh, x and q.
OROMO=set("""fi kan kana kanaaf kun sun sana akka akkam akkasumas isaan inni isheen ishee ani ana nu nuti isin keessa keessatti
irraa irratti irra gara waan ni jira jiru jirti dha dhaa hin ture turan qaba qabu qabna tokko lama sadii hedduu baayyee maal maaliif
eessa yoo yommuu hundi hunda booda dura waliin wajjin osoo garuu immoo ammoo haa malee sababni sababa namni nama namoota biyya
oromoo afaan galatoomaa nagaa yeroo har'a ofii keenya keessan isaanii kee koo isaa ishii jechuun jedhe jedha akkasitti""".split())
SOMALI=set('iyo waa ka ku in oo ay uu la ah ee soo baa ayaa waxaa waxa aan ma ama haddii sidoo kale laakiin waxay wuxuu'.split())
ENGLISH=set('the and to of a is in that it you for on with this was are be have not but they we what so'.split())

def word_list(text):return [w.strip(".,!?;:\"()-…“”'’").lower() for w in text.split()]

def looks_oromo(text):
    """Latin-script text that reads as Afaan Oromoo rather than English or Somali (word-frequency check, no model)."""
    words=[w for w in word_list(text) if w]
    if len(words)<8 or sum(w.isascii() for w in words)<.8*len(words):return False
    hits=lambda vocab:sum(w in vocab for w in words)/len(words)
    doubled=sum(any(v*2 in w for v in 'aeiou') for w in words)/len(words)
    return hits(OROMO)>=.08 and hits(OROMO)>hits(SOMALI) and hits(OROMO)>hits(ENGLISH) and doubled>=.12

def spoken(code,text):
    """Our language id for a transcript: Oromo is recognised from the words when the service reports something else."""
    lang=CODES.get((code or '').lower())
    return 'om' if lang!='am' and looks_oromo(text) else lang

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def media_info(src):
    """Duration, and whether there is sound and a real picture (cover art in an mp3 is not a video)."""
    with av.open(str(src)) as inp:
        video=[s for s in inp.streams.video if not s.disposition&av.stream.Disposition.attached_pic]
        duration=float(inp.duration/av.time_base) if inp.duration else 0.
        return {'duration':round(duration,2),'audio':bool(inp.streams.audio),'video':bool(video)}

def create(src,noise='light',language='am',transcribe=True,title='',name=None):
    """New job folder holding an untouched copy of the recording."""
    if noise not in NOISE:raise ValueError('Noise must be one of: '+', '.join(NOISE))
    if language not in LANGUAGES:raise ValueError('Language must be one of: '+', '.join(LANGUAGES))
    if noise=='off' and not transcribe:raise ValueError('Choose noise removal, a transcript, or both.')
    folder=RUNS/uuid.uuid4().hex;folder.mkdir(parents=True)
    name=name or Path(src).name;ext=Path(name).suffix.lower()[:8] or '.bin'
    shutil.copyfile(src,folder/('input'+ext))
    try:check(folder/('input'+ext))
    except Exception:shutil.rmtree(folder);raise
    title=title.strip() or re.sub(r'[_-]+',' ',Path(name).stem).strip() or 'Untitled recording'
    (folder/'job.json').write_text(json.dumps({'title':title[:80],'name':name,'input':'input'+ext,'created':time.time(),
        'noise':noise,'language':language,'transcribe':transcribe,**media_info(folder/('input'+ext))}))
    return folder

def check(src):
    try:info=media_info(src)
    except av.error.FFmpegError:raise ValueError("This file isn't an audio or video recording this tool can read.") from None
    if not info['audio']:raise ValueError('This file has no sound.')
    limit=float(setting('CLEANER_MAX_SECONDS','3600'))
    if info['duration']>limit:raise ValueError(f'Use a recording of {limit/60:g} minutes or less (CLEANER_MAX_SECONDS).')

def encode(pcm,dst,codec,bit_rate):
    with av.open(str(dst),'w') as out:
        st=out.add_stream(codec,rate=SR,layout='stereo');st.bit_rate=bit_rate
        shorts.encode_pcm(out,st,pcm)
        for p in st.encode():out.mux(p)

def with_audio(video,pcm,dst):
    """Copy the picture packets unchanged and replace the sound with the cleaned track."""
    tmp=Path(dst).with_suffix('.part.mp4')
    with av.open(str(video)) as inp, av.open(str(tmp),'w') as out:
        vin=next(s for s in inp.streams.video if not s.disposition&av.stream.Disposition.attached_pic)
        vout=out.add_stream_from_template(vin);aout=out.add_stream('aac',rate=SR,layout='stereo');aout.bit_rate=256000
        for p in inp.demux(vin):
            if p.dts is None:continue
            p.stream=vout;out.mux(p)
        shorts.encode_pcm(out,aout,pcm)
        for p in aout.encode():out.mux(p)
    tmp.replace(dst)

def clean(folder,status=say):
    """clean.wav (lossless, aligned to the original), clean.mp3 to share, and clean-video.mp4 for a video."""
    folder=Path(folder);job=read(folder,'job.json');src=folder/job['input'];mode=job['noise']
    status('Reading the recording',None);ref=shorts.decode_audio(src)
    status('Removing background noise'+(' with ElevenLabs (cloud)' if mode=='strong' else ' (runs on this Mac)'),None)
    pcm=shorts.align_to(shorts.denoise_strong(ref,folder,status) if mode=='strong' else shorts.denoise_light(ref),ref)
    status('Saving the cleaned audio',None)
    shorts.write_wav(pcm,folder/'clean.part.wav');(folder/'clean.part.wav').replace(folder/'clean.wav')
    encode(pcm,folder/'clean.part.mp3','libmp3lame',192000);(folder/'clean.part.mp3').replace(folder/'clean.mp3')
    if job.get('video'):status('Putting the cleaned sound back on the video',None);with_audio(src,pcm,folder/'clean-video.mp4')
    return folder/'clean.wav'

def transcribe(folder,audio,status=say):
    """transcript.json (timed words), transcript.txt (paragraphs) and transcript.srt (subtitles)."""
    folder=Path(folder);job=read(folder,'job.json');language=job['language']
    engine=shorts.transcriber()
    if engine=='whisper':
        if language in ('am','om'):raise ValueError(f'{NAMES[language]} needs ElevenLabs Scribe: add ELEVENLABS_API_KEY to .env (local whisper.cpp cannot transcribe {NAMES[language]}).')
        shorts.need_motion()
    wav=folder/'speech-16k.wav';shorts.speech_wav(audio,wav);out=folder/'transcript.json'
    try:
        if engine=='elevenlabs':scribe(wav,out,status,language)
        else:shorts.run_with_progress(['node','transcribe.mjs',str(wav),str(out),setting('SHORTS_WHISPER_MODEL','small'),language],status,'Transcribing (runs on this Mac)',cwd=shorts.MOTION)
        words=shorts.refine_timing(shorts.clean_captions(out),wav)
    finally:wav.unlink(missing_ok=True)
    data=json.loads(out.read_text());text=''.join(w['text'] for w in words)
    data.update(captions=words,reported=data.get('language'),language=spoken(data.get('language'),text) or (language if language!='auto' else None))
    out.write_text(json.dumps(data,indent=1))
    (folder/'transcript.txt').write_text(paragraphs(words)+'\n');(folder/'transcript.srt').write_text(srt(words))
    return words

def scribe(wav,out,status,language):
    """Scribe does not list Oromo: ask for 'orm' and, if refused, let it transcribe without a language hint."""
    if language!='om':return shorts.transcribe_scribe(wav,out,status,language)
    try:shorts.transcribe_scribe(wav,out,status,'orm')
    except RuntimeError as e:
        if not any(f'({c})' in str(e) for c in (400,422)):raise
        shorts.transcribe_scribe(wav,out,status,'auto')

def paragraphs(words,gap=1500):
    """Plain text; a pause of 1.5 s or more after a sentence starts a new paragraph."""
    out=[];prev=None
    for w in words:
        if prev and w['startMs']-prev['endMs']>=gap and prev['text'].rstrip()[-1:] in shorts.SENTENCE_END:out.append('\n\n')
        out.append(w['text']);prev=w
    return re.sub(r' *\n\n *','\n\n',''.join(out)).strip()

def lines(words,max_words=8,max_ms=4000,gap=700):
    """Subtitle lines: split at sentence ends, pauses, or when a line gets too long."""
    out=[];cur=[]
    for w in words:
        if cur and (len(cur)>=max_words or w['endMs']-cur[0]['startMs']>max_ms or w['startMs']-cur[-1]['endMs']>gap):out.append(cur);cur=[]
        cur.append(w)
        if w['text'].rstrip()[-1:] in shorts.SENTENCE_END:out.append(cur);cur=[]
    return out+[cur] if cur else out

def stamp(ms):return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

def srt(words):
    return ''.join(f"{k}\n{stamp(int(l[0]['startMs']))} --> {stamp(int(l[-1]['endMs']))}\n{''.join(w['text'] for w in l).strip()}\n\n" for k,l in enumerate(lines(words),1))

def process(folder,status=say):
    folder=Path(folder);job=read(folder,'job.json');audio=folder/job['input'];done=[]
    if job['noise']!='off':audio=clean(folder,status);done.append('Cleaned audio')
    if job['transcribe']:
        words=transcribe(folder,audio,status)
        done.append(f'transcript ({len(words)} words)' if words else 'no speech found to transcribe')
    return ' · '.join(done)+' ready'

def outputs(folder):
    """Downloadable results that exist, in display order."""
    names={'clean.mp3':'Cleaned audio (MP3)','clean.wav':'Cleaned audio (WAV, lossless)','clean-video.mp4':'Video with cleaned sound',
           'transcript.txt':'Transcript (text)','transcript.srt':'Subtitles (SRT)','transcript.json':'Timed words (JSON)'}
    return [{'file':n,'label':l} for n,l in names.items() if (Path(folder)/n).exists()]

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('file');p.add_argument('--noise',choices=NOISE,default='light')
    default=setting('SHORTS_LANGUAGE','am').strip().lower()
    p.add_argument('--language',choices=LANGUAGES,default=default if default in LANGUAGES else 'am')
    p.add_argument('--no-transcript',action='store_true');a=p.parse_args()
    folder=create(a.file,a.noise,a.language,not a.no_transcript)
    print(process(folder));print(folder)
    for o in outputs(folder):print(f"  {o['label']}: {folder/o['file']}")

if __name__=='__main__':main()
