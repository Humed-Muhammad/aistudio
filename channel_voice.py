"""Voice-over for Channel videos: each script paragraph is spoken by the channel's ElevenLabs voice in one call
(/with-timestamps, so every word's timing comes back with the audio and no transcription is needed). Paragraphs are
cached by their text, voice and model: changing one paragraph re-voices only that paragraph. The pieces are joined with
short pauses into voice.wav, levelled to -14 LUFS (gain only), and words.json keeps the timing of every word, paragraph
and section for the scenes, captions, chapters and shorts. Speaking costs ElevenLabs credits: it runs only when the
creator confirms the number of credits shown."""
from pathlib import Path
import base64,hashlib,json,re,time
import numpy as np
import shorts
from shorts import SR,say

# Delivery cues. Scripts may carry ElevenLabs audio tags in square brackets ([curious], [whispers], [short pause]): Eleven v3
# and v4 perform them. Older models would read them aloud, so for those, pause tags become SSML breaks and every other tag
# is removed. Captions, word counts and planning use the words only (spoken()).
TAG=re.compile(r'\[([^\[\]\n]{1,40})\]')
PAUSES={'pause':.6,'short pause':.35,'long pause':1.2,'beat':.4}
TAG_MODELS=('eleven_v3','eleven_v4')
DELIVERY={'natural':'Natural','expressive':'Expressive (more emotion, can vary)','steady':'Steady (calm, consistent)'}
PAUSE_PARAGRAPH=.35  # seconds between paragraphs of one section
PAUSE_SECTION=.8     # between sections (a breath before a new chapter)
FORMAT='mp3_44100_128'

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def write(folder,name,data):
    tmp=Path(folder)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(folder)/name)

def performs_tags(model):return str(model or '').startswith(TAG_MODELS)

def tidy(text):
    """Spaces and punctuation left behind where a tag was removed ("FASTER. [laughs]. They" → "FASTER. They"); ellipses stay."""
    text=re.sub(r'\s+([,.!?;:])',r'\1',re.sub(r'\s+',' ',text))
    return re.sub(r'(?<!\.)\.\.(?!\.)','.',re.sub(r'([!?])\.(?!\.)',r'\1',text)).strip()

def spoken(text):
    """The words only: audio tags and break marks removed (captions, word counts, shot planning, the post)."""
    return tidy(re.sub(r'<[^>]*>',' ',TAG.sub(' ',text)))

def speakable(text,model):
    """What the voice model is sent: v3/v4 get the tags as written; older models get pauses as SSML breaks, other tags dropped."""
    if performs_tags(model):return re.sub(r'\s+',' ',text).strip()
    def swap(m):
        t=m.group(1).strip().lower()
        return f' <break time="{PAUSES[t]}s" /> ' if t in PAUSES else ' '
    return tidy(TAG.sub(swap,text))

def settings_for(voice):
    """voice_settings for the channel's delivery. v3/v4 take three stability steps (Creative 0, Natural 0.5, Robust 1);
    older models keep the voice's own settings for Natural."""
    model=voice.get('model');d=voice.get('delivery') if voice.get('delivery') in DELIVERY else 'natural'
    if performs_tags(model):return {'stability':{'expressive':0.0,'natural':0.5,'steady':1.0}[d]}
    if d=='natural':return None
    out={'expressive':{'stability':.3,'similarity_boost':.75},'steady':{'stability':.75,'similarity_boost':.8}}[d]
    if model=='eleven_multilingual_v2':out.update(style={'expressive':.45,'steady':0.}[d],use_speaker_boost=True)
    return out

def pieces(script):
    """Every paragraph in speaking order with its section, and the text around it (for natural flow between calls)."""
    flat=[(s,p) for s in script.get('sections',[]) for p in s.get('paragraphs',[])]
    return [{'section':s['id'],'id':p['id'],'text':p['text'],'previous':flat[i-1][1]['text'] if i else '','next':flat[i+1][1]['text'] if i+1<len(flat) else ''}
            for i,(s,p) in enumerate(flat)]

def voice_key(text,voice):
    parts=[voice.get('id'),voice.get('model'),text]
    if voice.get('delivery') in DELIVERY and voice['delivery']!='natural':parts.append(voice['delivery'])  # Natural keeps the keys of takes made before
    return hashlib.sha1(json.dumps(parts,ensure_ascii=False).encode()).hexdigest()[:20]

def estimate(folder,script,voice,models):
    """What speaking the script would cost now: only paragraphs without a cached take count."""
    rate=models.get(voice.get('model'),{}).get('rate',1.0);d=Path(folder)/'voice';todo=[];chars=0
    for p in pieces(script):
        if not (d/f'{voice_key(p["text"],voice)}.mp3').exists():todo.append(p['id']);chars+=len(speakable(p['text'],voice.get('model')))
    total=sum(len(speakable(p['text'],voice.get('model'))) for p in pieces(script))
    return {'paragraphs':len(pieces(script)),'todo':todo,'chars':chars,'credits':int(round(chars*rate)),'total_chars':total,
            'total_credits':int(round(total*rate)),'ready':not todo and (Path(folder)/'voice.wav').exists()}

def tts(text,voice,previous,following,status):
    model=voice.get('model') or 'eleven_multilingual_v2'
    body={'text':speakable(text,model),'model_id':model}
    if not performs_tags(model):body.update(previous_text=spoken(previous)[-1000:],next_text=spoken(following)[:1000])  # v3/v4 do not take them
    settings=settings_for(voice)
    if settings:body['voice_settings']=settings
    r=shorts.elevenlabs(f'/v1/text-to-speech/{voice["id"]}/with-timestamps?output_format={FORMAT}',status,json=body)
    if r.status_code>=400:
        detail=r.text[:400]
        if 'quota_exceeded' in detail or r.status_code==401 and 'credits' in detail:raise RuntimeError('ElevenLabs: not enough credits left this month for this voice-over.')
        raise RuntimeError(f'ElevenLabs voice-over failed ({r.status_code}): {detail}')
    data=r.json();audio=base64.b64decode(data.get('audio_base64') or '')
    if not audio:raise RuntimeError('ElevenLabs returned no audio.')
    return audio,data.get('alignment') or data.get('normalized_alignment') or {}

def speak(folder,script,voice,models,status=say,allowed=None):
    """Voice every paragraph that has no cached take, then join them. allowed: the credits the creator agreed to;
    the call refuses when the script changed and would cost more than that."""
    folder=Path(folder);d=folder/'voice';d.mkdir(exist_ok=True)
    if not voice.get('id'):raise ValueError('Choose the narrator voice in the channel profile first.')
    cost=estimate(folder,script,voice,models)
    if cost['credits'] and (allowed is None or cost['credits']>int(allowed)):
        raise ValueError(f'This voice-over needs {cost["credits"]:,} ElevenLabs credits. Confirm that amount to go ahead.')
    todo=[p for p in pieces(script) if p['id'] in cost['todo']]
    for i,p in enumerate(todo):
        status(f'Voicing paragraph {i+1} of {len(todo)} with ElevenLabs',i/max(1,len(todo))*.9)
        audio,align=tts(p['text'],voice,p['previous'],p['next'],status)
        key=voice_key(p['text'],voice)
        (d/f'{key}.json').write_text(json.dumps({'text':p['text'],'sent':speakable(p['text'],voice.get('model')),'voice':voice.get('id'),'model':voice.get('model'),
                                                 'delivery':voice.get('delivery','natural'),'alignment':align,'made':time.time()}))
        (d/f'{key}.part').write_bytes(audio);(d/f'{key}.part').replace(d/f'{key}.mp3')
    status('Joining and levelling the voice-over',.92)
    return assemble(folder,script,voice)

def words_of(text,align,offset):
    """Words with start/end seconds from ElevenLabs' character timings. Audio tags and break marks in the timed text are
    skipped, and punctuation left alone by a removed tag joins the word before it."""
    chars=align.get('characters') or [];starts=align.get('character_start_times_seconds') or [];ends=align.get('character_end_times_seconds') or []
    if not chars or len(chars)!=len(starts):
        return []
    out=[];cur='';s=e=None;close=None
    def flush():
        nonlocal cur,s
        if cur:
            if out and not re.search(r'\w',cur):out[-1]['text']+=cur;out[-1]['end']=round(offset+e,3)
            else:out.append({'text':cur,'start':round(offset+s,3),'end':round(offset+e,3)})
        cur='';s=None
    for ch,a,b in zip(chars,starts,ends):
        if close:
            if ch==close:close=None
            continue
        if ch in '[<':flush();close=']' if ch=='[' else '>';continue
        if ch.isspace():flush();continue
        if s is None:s=a
        cur+=ch;e=b
    flush()
    return out

def spread(text,start,end,offset):
    """Fallback timing (no alignment): words spread evenly over the take."""
    ws=spoken(text).split();n=max(1,len(ws));step=(end-start)/n
    return [{'text':w,'start':round(offset+start+i*step,3),'end':round(offset+start+(i+1)*step,3)} for i,w in enumerate(ws)]

def assemble(folder,script,voice):
    """Join the takes in script order with pauses into voice.wav (levelled) and write words.json."""
    folder=Path(folder);d=folder/'voice';parts=[];words=[];paras=[];sections=[];t=0.;last=None
    for p in pieces(script):
        key=voice_key(p['text'],voice);mp3=d/f'{key}.mp3'
        if not mp3.exists():raise ValueError('Some paragraphs have no voice yet: run the voice-over first.')
        if last is not None:
            gap=PAUSE_SECTION if p['section']!=last else PAUSE_PARAGRAPH
            parts.append(np.zeros((2,int(gap*SR)),np.int16));t+=gap
        if p['section']!=last:
            if sections:sections[-1]['end']=round(t-(PAUSE_SECTION if last is not None else 0),3)
            sections.append({'id':p['section'],'start':round(t,3)})
        pcm=shorts.decode_audio(mp3);dur=pcm.shape[1]/SR
        meta=read(d,f'{key}.json',{})
        ws=words_of(p['text'],meta.get('alignment') or {},t) or spread(p['text'],0,dur,t)
        for w in ws:w.update(p=p['id'],s=p['section'])
        words+=ws;paras.append({'id':p['id'],'section':p['section'],'start':round(t,3),'end':round(t+dur,3),'key':key})
        parts.append(pcm);t+=dur;last=p['section']
    if not parts:raise ValueError('The script is empty.')
    if sections:sections[-1]['end']=round(t,3)
    titles={s['id']:s.get('title','') for s in script.get('sections',[])};kinds={s['id']:s.get('kind','chapter') for s in script.get('sections',[])}
    for s in sections:s.update(title=titles.get(s['id'],''),kind=kinds.get(s['id'],'chapter'))
    pcm=shorts.level_voice(np.concatenate(parts,axis=1))
    shorts.write_wav(pcm,folder/'.voice.part.wav');(folder/'.voice.part.wav').replace(folder/'voice.wav')
    data={'duration':round(pcm.shape[1]/SR,3),'voice':voice.get('id'),'model':voice.get('model'),'delivery':voice.get('delivery','natural'),'words':words,'paragraphs':paras,'sections':sections,'made':time.time()}
    write(folder,'words.json',data);return data

def srt(words,max_chars=42,max_gap=.6):
    """Subtitles for YouTube from the exact words: lines of up to 42 characters that break at pauses and sentence ends."""
    cues=[];cur=[]
    for w in words:
        if cur and (len(' '.join(x['text'] for x in cur+[w]))>max_chars or w['start']-cur[-1]['end']>max_gap or re.search(r'[.!?]$',cur[-1]['text'])):
            cues.append(cur);cur=[]
        cur.append(w)
    if cur:cues.append(cur)
    def stamp(t):
        ms=int(round(t*1000));return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    return '\n'.join(f'{i}\n{stamp(c[0]["start"])} --> {stamp(c[-1]["end"])}\n{" ".join(x["text"] for x in c)}\n' for i,c in enumerate(cues,1))
