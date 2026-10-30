"""Channel: a faceless YouTube channel made start to finish on this Mac: niche research, script, ElevenLabs voice-over,
visuals, the long video, shorts cut from it and the post. Claude Code (the creator's plan, never an API key) does the
writing; YouTube research reads use a free API key; paid steps (ElevenLabs, fal.ai, uploads) run only on the creator's click.

  python channel.py profiles                                       list channel profiles
  python channel.py profile NAME [--niche …] [--audience …] [--tone …] [--notes …]   create or update a channel profile
  python channel.py quota                                          YouTube API units used today (10,000 a day)
  python channel.py research "idea one, idea two" [--profile ID] [--months 12] [--searches 2] [--model sonnet]
                                                                   scan YouTube for proven videos, then Claude Code writes the niche report
  python channel.py scan RID                                       only the YouTube scan again (free quota; cached for a day)
  python channel.py report RID [--model sonnet]                    only Claude Code's report again, from the saved scan
  python channel.py show RID                                       print the report, niches and topic ideas
  python channel.py topics PROFILE [--focus …] [--competitors "@a,@b"] [--months 3]   topic research: what this channel should make next
  python channel.py new "topic" --profile ID [--minutes 3] [--hook …] [--notes …]   start a video
  python channel.py script JOB [--model sonnet]                    Claude Code researches the topic and writes sources.md + script.json
  python channel.py check-script JOB                               clean the script, print length and warnings
  python channel.py chat JOB "make the hook punchier"              one targeted change by Claude Code (undo: channel.py undo JOB)
  python channel.py perform JOB [--model sonnet]                   make it sound human: delivery cues, rhythm, emphasis (content unchanged)
  python channel.py approve JOB                                    the creator approved the script (needed before Make it for me voices it)
  python channel.py voice JOB [--yes]                              ElevenLabs voice-over (asks before spending credits): voice.wav, words.json, captions.srt
  python channel.py shots JOB [--model sonnet]                     Claude Code plans every shot from the timed narration (scenes.json)
  python channel.py check-scenes JOB                               time and check the shots (shots.json), print warnings
  python channel.py gather JOB [--spend 1.50]                      stock footage (free) and the AI visuals you allow (USD) for every shot
  python channel.py render JOB [--final]                           draft (half size) or final 1920×1080 MP4 in renders/
  python channel.py moments JOB [--model sonnet]                   Claude Code picks the moments that work alone as shorts (moments.json)
  python channel.py shorts JOB [--moments 1,3] [--edit]            render them 9:16 and add each to the Shorts editor with exact captions
  python channel.py package JOB [--model sonnet]                   titles, description with chapters/sources/credits, tags, thumbnails (post.json, thumbs/)
  python channel.py finish JOB [--spend 4]                         after you approve the script: voice, shots, footage, draft, post in one go
  python channel.py youtube-login                                  connect your YouTube channel (needs youtube-oauth.json, a Desktop app OAuth client)
  python channel.py upload JOB [--privacy private] [--publish-at ISO] [--thumb 1]   upload the final video, thumbnail and captions
"""
from pathlib import Path
import argparse,json,re,shutil,sys,threading,time,uuid
import channel_voice,channel_youtube as yt
import films,graphics
from config import ROOT,setting
from shorts import Cancelled,say

HOME=ROOT/'runs'/'channel'
RESEARCH=HOME/'research'
VIDEOS=HOME/'videos'
PROFILES=ROOT/'channels.json'
GUIDE=ROOT/'docs'/'channel-style.md'
MODELS=graphics.MODELS
STYLES=films.STYLES
VERDICTS=['go','maybe','avoid'];RISKS=['low','medium','high']
KINDS=['hook','intro','chapter','rehook','outro']
WPM=150  # spoken words per minute the scripts are written to
DEFAULT_MINUTES=3  # a new channel's usual video length
# ElevenLabs voice models: credits per character (from /v1/models), the longest text one call takes, and whether the
# model performs [audio tags] (v3 and v4) or would read them aloud (the others: tags are removed for them).
VOICE_MODELS={'eleven_v4':{'name':'Eleven v4 · most human, performs [tags]','rate':1.0,'limit':10000,'tags':True},
              'eleven_v4_turbo':{'name':'Eleven v4 Turbo · performs [tags], half the credits','rate':0.5,'limit':10000,'tags':True},
              'eleven_v3':{'name':'Eleven v3 · expressive, performs [tags]','rate':1.0,'limit':5000,'tags':True},
              'eleven_multilingual_v2':{'name':'Multilingual v2 · even, no [tags]','rate':1.0,'limit':10000,'tags':False},
              'eleven_flash_v2_5':{'name':'Flash v2.5 · fast, no [tags], half the credits','rate':0.5,'limit':40000,'tags':False},
              'eleven_turbo_v2_5':{'name':'Turbo v2.5 · no [tags], half the credits','rate':0.5,'limit':40000,'tags':False}}
DEFAULT_PROFILE={'name':'','niche':'','audience':'','tone':'clear, curious and friendly','notes':'',
                 'voice':{'id':'','name':'','model':'eleven_v4','delivery':'natural'},
                 'look':{'style':'cartoon','accent':'#FF7A59','accent2':'#6EC1FF','mode':'light','backdrop':'cartoon','music':'','music_volume':0.12},
                 'art':{'style':'flat','prompt':'','stock':False,'mascot':{'name':'','description':'','image':''}},
                 'minutes':DEFAULT_MINUTES,'ai_budget':5.0,'competitors':[],
                 'upload':{'privacy':'private','category':'27','tags':[],'made_for_kids':False}}
_lock=threading.Lock()

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def write(folder,name,data):
    tmp=Path(folder)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(folder)/name)

def keys():
    """Which optional services are set up (never the values)."""
    return {k:bool(setting(v).strip()) for k,v in [('youtube','YOUTUBE_API_KEY'),('elevenlabs','ELEVENLABS_API_KEY'),('pexels','PEXELS_API_KEY'),
                                                     ('pixabay','PIXABAY_API_KEY'),('fal','FAL_KEY')]}

# ---- ElevenLabs account: voices and credits (free calls; speaking is the paid part) ------------------------------------

def eleven_get(path,status=say):
    import httpx
    from shorts import interruptible
    from config import credential
    key=credential('ELEVENLABS_API_KEY')
    def call():
        try:return httpx.get('https://api.elevenlabs.io'+path,headers={'xi-api-key':key},timeout=30)
        except httpx.TransportError as e:raise RuntimeError(f"Can't reach ElevenLabs. Check your internet connection, then try again. ({type(e).__name__})") from None
    r=interruptible(call,status)
    if r.status_code>=400:raise RuntimeError(f'ElevenLabs refused ({r.status_code}): {r.text[:300]}')
    return r.json()

def voices():
    """The voices this ElevenLabs account can use (premade, library voices added, clones), with preview links."""
    out=[]
    for v in eleven_get('/v1/voices').get('voices',[]):
        lab=v.get('labels') or {}
        out.append({'id':v['voice_id'],'name':v.get('name',''),'category':v.get('category',''),'preview':v.get('preview_url'),
                    'labels':', '.join(x for x in [lab.get('gender'),lab.get('age'),lab.get('accent'),lab.get('description') or lab.get('descriptive'),lab.get('use_case')] if x)})
    return sorted(out,key=lambda v:(v['category']!='cloned',v['category']!='generated',v['name'].lower()))

def credits():
    """Credits left this month and whether the plan allows commercial use (the free plan does not)."""
    s=eleven_get('/v1/user/subscription');tier=str(s.get('tier','')).lower()
    used=int(s.get('character_count') or 0);limit=int(s.get('character_limit') or 0)
    return {'tier':tier,'used':used,'limit':limit,'left':max(0,limit-used),'resets':s.get('next_character_count_reset_unix'),'commercial':tier not in ('free','')}

# ---- channel profiles (channels.json, not in git) --------------------------------------------------------------------

def profiles():
    """Every channel profile, with settings added since it was saved filled in from the defaults."""
    try:items=json.loads(PROFILES.read_text())
    except (OSError,ValueError):return []
    out=[]
    for x in items:
        try:out.append({**clean_profile({},x),'id':x['id'],**({'created':x['created']} if 'created' in x else {})})
        except (ValueError,KeyError,TypeError):out.append(x)
    return out

def profile(pid):return next((p for p in profiles() if p['id']==pid),None) if pid else None

def clean_profile(data,base=None):
    """Merge edited fields into a profile and keep every value in range."""
    p=json.loads(json.dumps(base or DEFAULT_PROFILE))
    for group,default in DEFAULT_PROFILE.items():  # settings added since this profile was saved
        if isinstance(default,dict):p[group]={**json.loads(json.dumps(default)),**(p.get(group) or {})}
        else:p.setdefault(group,default)
    for k in ('name','niche','audience','tone','notes'):
        if k in data:p[k]=str(data[k] or '').strip()[:2000 if k=='notes' else 200]
    p.setdefault('art',json.loads(json.dumps(DEFAULT_PROFILE['art'])))
    for group in ('voice','look','upload','art'):
        if isinstance(data.get(group),dict):p[group]={**p[group],**{k:v for k,v in data[group].items() if k in DEFAULT_PROFILE[group]}}
    if p['voice'].get('model') not in VOICE_MODELS:p['voice']['model']=DEFAULT_PROFILE['voice']['model']
    if p['voice'].get('delivery') not in channel_voice.DELIVERY:p['voice']['delivery']='natural'
    import channel_media
    if p['art'].get('style') not in channel_media.ART_STYLES:p['art']['style']='flat'
    p['art']['prompt']=str(p['art'].get('prompt') or '').strip()[:800];p['art']['stock']=bool(p['art'].get('stock'))
    m=p['art'].get('mascot') if isinstance(p['art'].get('mascot'),dict) else {}
    p['art']['mascot']={'name':str(m.get('name') or '').strip()[:40],'description':str(m.get('description') or '').strip()[:600],'image':str(m.get('image') or '')}
    if 'minutes' in data:p['minutes']=max(1,min(30,int(float(data['minutes'] or DEFAULT_MINUTES))))
    if 'competitors' in data:p['competitors']=data['competitors'] if isinstance(data['competitors'],list) else seeds_of(data['competitors'])
    p['competitors']=list(dict.fromkeys(str(c).strip()[:120] for c in p.get('competitors') or [] if str(c).strip()))[:10]
    if 'ai_budget' in data:p['ai_budget']=round(max(0.0,min(100.0,float(data['ai_budget'] or 0))),2)
    if p['look'].get('style') not in STYLES:p['look']['style']=DEFAULT_PROFILE['look']['style']
    if p['look'].get('mode') not in ('dark','light'):p['look']['mode']='dark'
    if p['look'].get('backdrop') not in films.BACKDROPS:p['look']['backdrop']='aurora'
    try:p['look']['music_volume']=round(max(0.,min(1.,float(p['look'].get('music_volume',.12)))),2)
    except (TypeError,ValueError):p['look']['music_volume']=.12
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}',str(p['look'].get('accent2',''))):p['look']['accent2']=DEFAULT_PROFILE['look']['accent2']
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}',str(p['look'].get('accent',''))):p['look']['accent']=DEFAULT_PROFILE['look']['accent']
    if p['upload'].get('privacy') not in ('private','unlisted','public'):p['upload']['privacy']='private'
    p['upload']['tags']=[str(t).strip()[:60] for t in (p['upload'].get('tags') or []) if str(t).strip()][:30]
    p['upload']['made_for_kids']=bool(p['upload'].get('made_for_kids'))
    if not p['name']:raise ValueError('Give the channel a name.')
    return p

def save_profile(data,pid=None):
    with _lock:
        items=profiles();old=next((p for p in items if p['id']==pid),None) if pid else None
        if pid and not old:raise KeyError(pid)
        p=clean_profile(data,old);p['id']=old['id'] if old else uuid.uuid4().hex[:12];p.setdefault('created',time.time())
        items=[p if x['id']==p['id'] else x for x in items] if old else items+[p]
        tmp=PROFILES.with_suffix('.tmp');tmp.write_text(json.dumps(items,ensure_ascii=False,indent=1));tmp.replace(PROFILES)
        return p

def delete_profile(pid):
    with _lock:
        items=[p for p in profiles() if p['id']!=pid]
        tmp=PROFILES.with_suffix('.tmp');tmp.write_text(json.dumps(items,ensure_ascii=False,indent=1));tmp.replace(PROFILES)

MASCOTS=HOME/'mascots'
def art_of(p):
    """The channel's art for image prompts: the style text, the mascot reference image (absolute path) and whether stock fits."""
    import channel_media
    a=(p or {}).get('art') or DEFAULT_PROFILE['art'];m=(a.get('mascot') or {}).get('image')
    path=HOME/m if m else None
    return {'style':a.get('style','flat'),'prompt':a.get('prompt') or channel_media.ART_STYLES.get(a.get('style','flat'),''),
            'mascot':str(path) if path and path.exists() else None,'mascot_name':(a.get('mascot') or {}).get('name',''),
            'mascot_description':(a.get('mascot') or {}).get('description',''),'stock':bool(a.get('stock'))}

def design_mascots(pid,description,status=say,allowed=0.):
    """Four mascot designs to choose from in the channel's art style (paid: about 4 images on fal.ai)."""
    import channel_media
    p=profile(pid)
    if not p:raise ValueError('No such channel.')
    description=str(description or '').strip()
    if len(description)<8:raise ValueError('Describe the mascot in a sentence: who or what it is, its colours, what makes it memorable.')
    if not keys()['fal']:raise ValueError('Add FAL_KEY to .env to design a mascot (or upload your own picture).')
    cost=channel_media.IMAGE_PRICE()*4
    if float(allowed)+1e-9<cost:raise ValueError(f'Designing 4 mascots costs about ${cost:.2f}. Confirm that amount to go ahead.')
    channel_media.charge(HOME,'mascot',cost,description)
    files=channel_media.design_mascot(description,art_of(p)['prompt'],MASCOTS/pid,4,status)
    save_profile({'art':{**p['art'],'mascot':{**p['art']['mascot'],'description':description}}},pid)
    return [f'mascots/{pid}/{Path(f).name}' for f in files]

def mascot_options(pid):
    d=MASCOTS/pid;return [f'mascots/{pid}/{f.name}' for f in sorted(d.glob('option-*.png'))] if d.exists() else []

def pick_mascot(pid,option=None,upload=None):
    """The mascot every illustration keeps: one of the designs, or the creator's own picture."""
    from PIL import Image
    p=profile(pid)
    if not p:raise ValueError('No such channel.')
    d=MASCOTS/pid;d.mkdir(parents=True,exist_ok=True)
    src=Path(upload) if upload else d/Path(str(option)).name
    if not src.exists() or (not upload and not src.name.startswith('option-')):raise ValueError('No such mascot design.')
    try:im=Image.open(src).convert('RGBA')
    except Exception:raise ValueError('That file is not a picture.') from None
    im.thumbnail((1024,1024));im.save(d/'mascot.png')
    return save_profile({'art':{**p['art'],'mascot':{**p['art']['mascot'],'image':f'mascots/{pid}/mascot.png'}}},pid)

def profile_note(p):
    """The channel profile as lines for Claude."""
    if not p:return []
    return [f'Channel: {p["name"]}.',*([f'Niche: {p["niche"]}.'] if p.get('niche') else []),*([f'Audience: {p["audience"]}.'] if p.get('audience') else []),
            *([f'Tone: {p["tone"]}.'] if p.get('tone') else []),*([f'Notes from the creator: {p["notes"]}'] if p.get('notes') else [])]

# ---- niche research ------------------------------------------------------------------------------------------------

def research_folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise ValueError('Expected a 32-character research ID')
    path=RESEARCH/ident
    if not (path/'request.json').exists():raise ValueError(f'No research {ident}')
    return path

def seeds_of(text):
    return [s.strip() for s in re.split(r'[,\n;]+',str(text)) if s.strip()][:10]

def new_research(seeds,months=12,searches=2,profile_id=None,model='sonnet'):
    seeds=seeds_of(seeds) if isinstance(seeds,str) else [s.strip() for s in seeds if s.strip()][:10]
    if not seeds:raise ValueError('Give at least one seed idea, e.g. "space facts, personal finance for students".')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    folder=RESEARCH/uuid.uuid4().hex;folder.mkdir(parents=True)
    write(folder,'request.json',{'seeds':seeds,'months':max(1,min(60,int(months))),'searches':max(1,min(len(yt.SEARCHES),int(searches))),
                                 'profile':profile_id if profile(profile_id) else None,'model':model,'created':time.time()})
    return folder

def scan(folder,status=say):
    """The YouTube part: free quota, cached for a day. Skipped (with a note) when no YouTube key is set."""
    req=read(folder,'request.json')
    if req.get('kind')=='topics':return topic_scan(folder,status)
    if not keys()['youtube']:
        write(folder,'data.json',{'seeds':req['seeds'],'months':req['months'],'scanned':time.time(),'units':0,'summary':[],'videos':[],'channels':[],
                                  'skipped':'No YOUTUBE_API_KEY in .env: the report is a brainstorm without YouTube data.'})
        return read(folder,'data.json')
    need=yt.estimate(req['seeds'],req['searches']);left=yt.DAILY-yt.used_today()
    if need>left:raise ValueError(f'This scan needs up to {need:,} YouTube units and {left:,} are left today. Use fewer seed ideas or searches, or wait until midnight Pacific time.')
    data=yt.scan(req['seeds'],req['months'],req['searches'],status);write(folder,'data.json',data);return data

REPORT_SCHEMA={'type':'object','additionalProperties':False,'required':['summary','niches','topics'],'properties':{
    'summary':{'type':'string','description':'The niche report in Markdown: the recommendation first, then the evidence.'},
    'niches':{'type':'array','items':{'type':'object','additionalProperties':False,
        'required':['name','verdict','demand','competition','faceless_fit','rpm','policy_risk','why','angle','evidence'],'properties':{
        'name':{'type':'string'},'verdict':{'type':'string','enum':VERDICTS},
        'demand':{'type':'integer','minimum':1,'maximum':5},'competition':{'type':'integer','minimum':1,'maximum':5,'description':'5 = crowded by big channels'},
        'faceless_fit':{'type':'integer','minimum':1,'maximum':5},'rpm':{'type':'string','description':'Estimated RPM range, e.g. "$4–9 (estimate)"'},
        'policy_risk':{'type':'string','enum':RISKS},'why':{'type':'string'},'angle':{'type':'string','description':'How a new faceless channel stands out here'},
        'evidence':{'type':'array','items':{'type':'string'},'description':'Video ids from the scan'}}}},
    'topics':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['title','niche','hook','why','based_on','score'],'properties':{
        'title':{'type':'string'},'niche':{'type':'string'},'hook':{'type':'string','description':'The first sentence of the video'},
        'why':{'type':'string'},'based_on':{'type':'array','items':{'type':'string'}},'score':{'type':'integer','minimum':0,'maximum':100}}}}}}

def clean_report(out,data):
    """Keep the report's values in range and its evidence to videos that are really in the scan."""
    known={v['id'] for v in data.get('videos',[])};clamp=lambda x,lo,hi:max(lo,min(hi,int(x or lo)))
    niches=[{'name':str(n.get('name','')).strip()[:120],'verdict':n.get('verdict') if n.get('verdict') in VERDICTS else 'maybe',
             'demand':clamp(n.get('demand'),1,5),'competition':clamp(n.get('competition'),1,5),'faceless_fit':clamp(n.get('faceless_fit'),1,5),
             'rpm':str(n.get('rpm','')).strip()[:60],'policy_risk':n.get('policy_risk') if n.get('policy_risk') in RISKS else 'medium',
             'why':str(n.get('why','')).strip()[:2000],'angle':str(n.get('angle','')).strip()[:1000],
             'evidence':[e for e in n.get('evidence') or [] if e in known][:12]} for n in out.get('niches') or [] if str(n.get('name','')).strip()]
    topics=[{'title':str(t.get('title','')).strip()[:120],'niche':str(t.get('niche','')).strip()[:120],'hook':str(t.get('hook','')).strip()[:400],
             'why':str(t.get('why','')).strip()[:1000],'based_on':[e for e in t.get('based_on') or [] if e in known][:6],'score':clamp(t.get('score'),0,100)}
            for t in out.get('topics') or [] if str(t.get('title','')).strip()]
    order={'go':0,'maybe':1,'avoid':2}
    return {'summary':str(out.get('summary','')).strip(),'niches':sorted(niches,key=lambda n:(order[n['verdict']],-n['demand'],n['competition'])),
            'topics':sorted(topics,key=lambda t:-t['score'])}

def report(folder,status=say,model=None):
    """Claude Code reads the scan and writes the niche report, the niches and 20+ topic ideas (plan usage, no API key)."""
    folder=Path(folder).resolve();req=read(folder,'request.json');data=read(folder,'data.json')
    if req.get('kind')=='topics':return topic_report(folder,status,model)
    if data is None:raise ValueError('Run the YouTube scan first.')
    model=model or req.get('model','sonnet')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    p=profile(req.get('profile'))
    evidence=yt.brief(data) if data.get('videos') else data.get('skipped') or 'The scan found no videos.'
    ask='\n'.join(['You are a YouTube strategist helping a creator start a faceless English channel (narrated by an AI voice, visuals from stock '
        'footage, motion graphics and a few AI clips). Find which of their ideas is the best niche for a NEW channel and which videos to make first.',
        f'Read {GUIDE} first (section 1 is how to judge a niche; sections 2-4 tell you what this tool can make).','',
        'Seed ideas from the creator: '+', '.join(req['seeds']),*profile_note(p),'',evidence,'',
        (f'The full scan (every video and channel with numbers) is {folder}/data.json; Read it when you need more than the summary above.' if data.get('videos') else
         'There is no YouTube data. You may use WebSearch to check what is popular, and say clearly in the summary that this is a brainstorm without data.'),
        '','Return:',
        '- niches: one per seed idea (merge near-duplicates; you may add one adjacent niche the data points to), judged by the guide. '
        'Cite outlier video ids in evidence.',
        '- topics: 20-30 video ideas for the best niches, most promising first, each modelled on one or more outliers (based_on = their ids), '
        'with the opening sentence (hook). Titles follow the guide.',
        '- summary: the report in Markdown for the creator: which niche to start with and why, the evidence, the risks, and the first 5 videos to make. '
        'Plain words; numbers from the scan; RPM only as an estimate.'])
    allowed=[f'Read(/{folder}/**)',f'Read(/{GUIDE})','WebSearch']
    result=graphics.run_claude([ask,'--model',model,'--json-schema',json.dumps(REPORT_SCHEMA),'--tools','Read,WebSearch',
                                '--allowedTools',*allowed,'--disallowedTools',f'Read(/{ROOT}/.env*)','--permission-mode','dontAsk'],
                               ROOT,status,'Claude is writing the niche report',log=folder/'claude.log',
                               timeout=int(float(setting('CHANNEL_REPORT_MINUTES','20'))*60))
    out=result.get('structured_output')
    if not out:
        try:text=result.get('result','');out=json.loads(text[text.index('{'):text.rindex('}')+1])
        except ValueError:raise RuntimeError('Claude did not return a report. Try again.') from None
    clean=clean_report(out,data)
    if not clean['niches'] and not clean['topics']:raise RuntimeError('Claude returned an empty report. Try again.')
    write(folder,'result.json',{**clean,'model':model,'written':time.time()});return clean

def research(folder,status=say,model=None):
    scan(folder,status);return report(folder,status,model)

def research_summary(folder):
    folder=Path(folder);req=read(folder,'request.json') or {};res=read(folder,'result.json') or {};data=read(folder,'data.json') or {}
    kind=req.get('kind','niche')
    best=next((n['name'] for n in res.get('niches',[]) if n['verdict']=='go'),None) if kind=='niche' else (res.get('topics') or [{}])[0].get('title')
    return {'id':folder.name,'kind':kind,'focus':req.get('focus',''),'made':len(read(folder,'made.json',{})),'seeds':req.get('seeds',[]),'created':req.get('created',0),'profile':req.get('profile'),'videos':len(data.get('videos',[])),
            'units':data.get('units',0),'skipped':data.get('skipped'),'niches':len(res.get('niches',[])),'topics':len(res.get('topics',[])),'best':best}

# ---- topic research: what a channel should make next ---------------------------------------------------------------

TOPIC_KINDS=['evergreen','trending']

def topic_seeds(p,focus=''):
    """What to search for: the creator's focus words, else the channel's niche (at most 3 searches' worth)."""
    seeds=seeds_of(focus) or seeds_of((p or {}).get('niche',''))
    return seeds[:3]

def channel_titles(pid):
    """Titles of the videos this channel already has (so ideas do not repeat them)."""
    out=[]
    if VIDEOS.exists():
        for f in VIDEOS.iterdir():
            j=read(f,'job.json') or {}
            if j.get('profile')==pid and (j.get('title') or j.get('topic')):out.append(j.get('title') or j['topic'])
    return out

def new_topic_research(profile_id,focus='',competitors=None,months=3,searches=1,model='sonnet'):
    """A topic research for one channel: its niche (or a focus), its competitors and what people search, judged by Claude."""
    p=profile(profile_id)
    if not p:raise ValueError('Choose the channel to find topics for.')
    seeds=topic_seeds(p,focus)
    if not seeds:raise ValueError('Give the channel a niche on the Channels page, or write what to look for.')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    comps=[str(c).strip()[:120] for c in (competitors if competitors is not None else p.get('competitors',[])) if str(c).strip()][:10]
    if competitors is not None:save_profile({'competitors':comps},p['id'])
    folder=RESEARCH/uuid.uuid4().hex;folder.mkdir(parents=True)
    write(folder,'request.json',{'kind':'topics','seeds':seeds,'focus':str(focus or '').strip()[:200],'competitors':comps,
                                 'months':max(1,min(24,int(months))),'searches':max(1,min(len(yt.SEARCHES),int(searches))),
                                 'profile':p['id'],'model':model,'created':time.time()})
    return folder

def topic_estimate(seeds,searches,competitors):
    return yt.estimate(seeds,searches,channels=30)+4*len(competitors)

def topic_scan(folder,status=say):
    """Search the channel's seeds (recent videos only), read its competitors' recent uploads, and collect what people type
    into YouTube search. Search phrases are free; the rest uses the free YouTube quota."""
    req=read(folder,'request.json');data={'seeds':req['seeds'],'months':req['months'],'scanned':time.time(),'units':0,'summary':[],'videos':[],'channels':[]}
    if keys()['youtube']:
        need=topic_estimate(req['seeds'],req['searches'],req['competitors']);left=yt.DAILY-yt.used_today()
        if need>left:raise ValueError(f'This needs up to {need:,} YouTube units and {left:,} are left today. Search fewer words or wait until midnight Pacific time.')
        before=yt.used_today()
        data=yt.scan(req['seeds'],req['months'],req['searches'],status,max_channels=30)
        if req['competitors']:
            vids,chans,problems=yt.competitor_uploads(req['competitors'],req['months'],status)
            have={v['id'] for v in data['videos']}
            data['videos']+=[v for v in vids if v['id'] not in have];data['competitors']=chans;data['competitor_problems']=problems
        data['units']=yt.used_today()-before
    else:data['skipped']='No YOUTUBE_API_KEY in .env: ideas come from search phrases and the web, without view counts.'
    status('Reading what people search for',.95)
    data['suggestions']={seed:yt.suggestions(seed,status) for seed in req['seeds']}
    write(folder,'data.json',data);return data

TOPIC_SCHEMA={'type':'object','additionalProperties':False,'required':['summary','topics'],'properties':{
    'summary':{'type':'string','description':'Markdown for the creator: the 5 best picks and why, what works in this niche now (formats, title patterns), gaps the competitors leave.'},
    'topics':{'type':'array','items':{'type':'object','additionalProperties':False,
        'required':['title','kind','hook','angle','points','why','why_now','based_on','searches','links','score'],'properties':{
        'title':{'type':'string','description':'40-70 characters, honest'},
        'kind':{'type':'string','enum':TOPIC_KINDS,'description':'evergreen: watched for years; trending: rides something happening now'},
        'hook':{'type':'string','description':'The first sentence of the video'},
        'angle':{'type':'string','description':'What this video gives that the videos already out there do not'},
        'points':{'type':'array','items':{'type':'string'},'description':'The 3 points the video makes, in order (fits the channel length)'},
        'why':{'type':'string','description':'The evidence it will get views'},
        'why_now':{'type':'string','description':'For trending topics: what is happening and since when; empty for evergreen'},
        'based_on':{'type':'array','items':{'type':'string'},'description':'Video ids from the scan that prove the demand'},
        'searches':{'type':'array','items':{'type':'string'},'description':'Search phrases from the list that this video answers'},
        'links':{'type':'array','items':{'type':'string'},'description':'URLs of news or sources you found for it'},
        'score':{'type':'integer','minimum':0,'maximum':100}}}}}}

def clean_topics(out,data):
    known={v['id'] for v in data.get('videos',[])};clamp=lambda x,lo,hi:max(lo,min(hi,int(x or lo)))
    texts=lambda xs,n,lim:[str(x).strip()[:lim] for x in xs or [] if str(x).strip()][:n]
    topics=[{'title':str(t.get('title','')).strip()[:120],'kind':t.get('kind') if t.get('kind') in TOPIC_KINDS else 'evergreen',
             'hook':str(t.get('hook','')).strip()[:400],'angle':str(t.get('angle','')).strip()[:600],'points':texts(t.get('points'),5,300),
             'why':str(t.get('why','')).strip()[:1000],'why_now':str(t.get('why_now','')).strip()[:600],
             'based_on':[e for e in t.get('based_on') or [] if e in known][:6],'searches':texts(t.get('searches'),6,100),
             'links':[u for u in texts(t.get('links'),5,400) if re.match(r'https?://',u)],'score':clamp(t.get('score'),0,100),'niche':''}
            for t in out.get('topics') or [] if str(t.get('title','')).strip()]
    return {'summary':str(out.get('summary','')).strip(),'niches':[],'topics':sorted(topics,key=lambda t:-t['score'])}

def topic_report(folder,status=say,model=None):
    """Claude Code turns the scan into 15-25 video ideas for this channel (plan usage), checking the web for what is new."""
    folder=Path(folder).resolve();req=read(folder,'request.json');data=read(folder,'data.json')
    if data is None:raise ValueError('Run the scan first.')
    model=model or req.get('model','sonnet')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    p=profile(req.get('profile'))
    if not p:raise ValueError('The channel of this research was deleted.')
    made=channel_titles(p['id']);art=art_of(p)
    evidence='\n'.join(x for x in [yt.brief(data) if data.get('summary') else '',yt.topic_brief(data)] if x) or 'The scan found nothing.'
    ask='\n'.join(['You are the topic researcher for this faceless English YouTube channel. Find the next videos it should make.',
        f'Read {GUIDE} first (section 1b is how to judge topics; sections 2-4 say what the videos are like).','',*profile_note(p),
        f'Each video is about {p.get("minutes",DEFAULT_MINUTES)} minutes, narrated by an AI voice over {art["style"]} illustrations'
        +(' with the channel mascot' if art['mascot'] else '')+' and simple graphics.',
        *([f'Look especially for: {req["focus"]}'] if req.get('focus') else []),
        'Videos this channel already has (never repeat them; a clearly different angle on the same subject is fine): '+('; '.join(made) or 'none yet'),'',
        f'Scan of the last {req["months"]} months:',evidence,'',
        (f'Every video and channel with numbers is in {folder}/data.json; Read it when you need more.' if data.get('videos') else data.get('skipped','')),
        'Use WebSearch and WebFetch to find what is new in this niche right now (news, discoveries, releases, anniversaries in the coming weeks) and '
        'the questions people ask (forums, Reddit, Quora). Only use what you can link to.','',
        'Return 15-25 topics, the most promising first: a mix of evergreen ideas proven by the outliers and a few trending ones. Each fits the channel '
        'length (three clear points), has an angle the existing videos lack, and cites its evidence: outlier video ids (based_on), search phrases it '
        'answers (searches, copied from the lists above) and links for trending topics. Score = expected views for a small channel. '
        'Plus a summary in Markdown. No medical, legal or financial advice topics; no tragedies used for views.'])
    result=graphics.run_claude([ask,'--model',model,'--json-schema',json.dumps(TOPIC_SCHEMA),'--tools','Read,WebSearch,WebFetch',
                                '--allowedTools',f'Read(/{folder}/**)',f'Read(/{GUIDE})','WebSearch','WebFetch',
                                '--disallowedTools',f'Read(/{ROOT}/.env*)','--permission-mode','dontAsk'],
                               ROOT,status,'Claude is researching topics',log=folder/'claude.log',
                               timeout=int(float(setting('CHANNEL_REPORT_MINUTES','20'))*60),describe=describe)
    out=result.get('structured_output')
    if not out:
        try:text=result.get('result','');out=json.loads(text[text.index('{'):text.rindex('}')+1])
        except ValueError:raise RuntimeError('Claude did not return topics. Try again.') from None
    clean=clean_topics(out,data)
    if not clean['topics']:raise RuntimeError('Claude returned no topics. Try again.')
    write(folder,'result.json',{**clean,'model':model,'written':time.time()});return clean

def mark_made(rid,title,video_id):
    """Remember which topic of a research became which video (the research page links to it)."""
    try:folder=research_folder(str(rid))
    except ValueError:return
    made=read(folder,'made.json',{});made[str(title)[:120]]=video_id;write(folder,'made.json',made)

def topic_notes(t):
    """A topic's research, handed to the script writer as the creator's notes for that video."""
    parts=[f'Angle: {t["angle"]}' if t.get('angle') else '',
           'Points to make: '+' / '.join(t['points']) if t.get('points') else '',
           f'Why now: {t["why_now"]}' if t.get('why_now') else '',
           'Answers these searches: '+'; '.join(t['searches']) if t.get('searches') else '',
           'Sources found: '+' '.join(t['links']) if t.get('links') else '']
    return '\n'.join(x for x in parts if x)[:2000]

# ---- videos: topic → script ----------------------------------------------------------------------------------------

def video_folder(ident):
    if len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise ValueError('Expected a 32-character video ID')
    path=VIDEOS/ident
    if not (path/'job.json').exists():raise ValueError(f'No video {ident}')
    return path

def new_video(profile_id,topic,minutes=None,hook='',notes='',research=None,based_on=None):
    p=profile(profile_id)
    if not p:raise ValueError('Choose a channel first (Channels page, or python channel.py profile NAME).')
    topic=str(topic or '').strip()[:200]
    if len(topic)<4:raise ValueError('Write the topic or working title of the video.')
    folder=VIDEOS/uuid.uuid4().hex;folder.mkdir(parents=True)
    write(folder,'job.json',{'title':topic,'topic':topic,'hook':str(hook or '').strip()[:400],'notes':str(notes or '').strip()[:2000],'profile':p['id'],
                             'minutes':max(1,min(30,int(minutes or p.get('minutes') or DEFAULT_MINUTES))),'research':research,'based_on':based_on or [],'created':time.time()})
    return folder

def job(folder):return read(folder,'job.json') or {}

def video_profile(folder):
    p=profile(job(folder).get('profile'))
    if not p:raise ValueError('The channel of this video was deleted: choose another channel for it.')
    return p

def script_of(folder):return read(folder,'script.json') or {'title':'','sections':[]}

def script_text(script):
    """The narration as spoken: paragraphs without their [delivery tags]."""
    return '\n\n'.join(channel_voice.spoken(p['text']) for s in script.get('sections',[]) for p in s.get('paragraphs',[]))

def script_hash(script):
    import hashlib
    return hashlib.sha1(json.dumps(script.get('sections',[]),ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:16]

EMOJI=re.compile('[\U0001F300-\U0001FAFF☀-➿]')
# Tags that ask the voice for a sound effect or music rather than a way of speaking: the edit adds those itself.
SOUND_TAGS=re.compile(r'music|sfx|sound|applause|explosion|gunshot|footstep|door|crowd|thunder|rain|wind|siren|cheer|drum|beep|ring',re.I)
def tag_warnings(pid,text):
    """What is wrong with a paragraph's delivery cues."""
    out=[];tags=channel_voice.TAG.findall(text);words=len(channel_voice.spoken(text).split())
    if re.search(r'\([^)]*(music|pause|sfx|laugh|beat|whisper|sigh|gasp)[^)]*\)',text,re.I):out.append(f'{pid}: stage directions in ( ) are read aloud; write them as [tags].')
    if '[' in channel_voice.TAG.sub('',text) or ']' in channel_voice.TAG.sub('',text):out.append(f'{pid}: brackets that are not a short delivery cue are read aloud.')
    for t in tags:
        if SOUND_TAGS.search(t):out.append(f'{pid}: [{t}] asks the voice for a sound effect; music and effects come from the edit, so remove it.')
        elif len(t.split())>4:out.append(f'{pid}: [{t}] is too long for a delivery cue (1-3 words).')
    acted=[t for t in tags if t.strip().lower() not in channel_voice.PAUSES]  # pauses are timing, not acting
    if len(acted)>max(2,words//15):out.append(f'{pid}: {len(acted)} emotion cues in {words} words is overacting; one every two to four sentences sounds natural.')
    if re.search(r'(\[[^\]]*\]\s*){3,}',text):out.append(f'{pid}: three cues in a row; use one or two.')
    return out

def check_script(data,minutes=None,model=None):
    """Clean the script (ids, kinds, text) and list what to fix. Returns (script, warnings, stats).
    model: the channel's voice model, to say whether its [delivery tags] will be performed."""
    seen=set();sections=[];warn=[]
    def uid(want,prefix):
        n=1;want=str(want or '').strip()
        if re.fullmatch(r'[A-Za-z0-9_-]{1,24}',want) and want not in seen:seen.add(want);return want
        while f'{prefix}{n}' in seen:n+=1
        seen.add(f'{prefix}{n}');return f'{prefix}{n}'
    for s in data.get('sections') or []:
        if not isinstance(s,dict):continue
        paras=[]
        for p in s.get('paragraphs') or []:
            text=re.sub(r'\s+',' ',str(p.get('text','') if isinstance(p,dict) else p)).strip()[:4000]
            if text:paras.append({'id':p.get('id') if isinstance(p,dict) else None,'text':text})
        if not paras:continue
        sid=uid(s.get('id'),'s')
        sections.append({'id':sid,'kind':s.get('kind') if s.get('kind') in KINDS else 'chapter','title':str(s.get('title','')).strip()[:80],
                         'paragraphs':[{'id':uid(p['id'],'p'),'text':p['text']} for p in paras]})
    script={'title':str(data.get('title','')).strip()[:120],'sections':sections}
    words=len(script_text(script).split());spoken=round(words/WPM,1)
    tags=sum(len(channel_voice.TAG.findall(p['text'])) for s in sections for p in s['paragraphs'])
    if not sections:warn.append('The script is empty.')
    else:
        if sections[0]['kind']!='hook':warn.append('The first section should be the hook (kind "hook").')
        chapters=[s for s in sections if s['kind']=='chapter']
        if len(chapters)<3:warn.append(f'Only {len(chapters)} chapter{"s"[:len(chapters)!=1]}: YouTube needs at least 3 chapters to show them.')
        for s in chapters:
            if not s['title']:warn.append(f'Chapter {s["id"]} has no title (titles become YouTube chapters).')
        for s in sections:
            for p in s['paragraphs']:
                t=p['text']
                warn+=tag_warnings(p['id'],t)
                if EMOJI.search(t):warn.append(f'{p["id"]}: emoji are read aloud; remove them.')
                if re.search(r'https?://|www\.',t):warn.append(f'{p["id"]}: a web address in the narration; say it in words or move it to sources.')
                if len(t)>1500:warn.append(f'{p["id"]}: very long paragraph ({len(t)} characters); split it.')
        if model and tags and not channel_voice.performs_tags(model):
            warn.append(f'The voice model ({VOICE_MODELS.get(model,{}).get("name",model).split(" ·")[0]}) does not perform [tags]: pauses become short breaks and the other '
                        'cues are left out. Choose Eleven v4 on the Channels page to hear them.')
        if channel_voice.performs_tags(model) and not tags and words>80:
            warn.append('No delivery cues: the voice will read it flat. Use “Make it sound human”, or add [tags] like [curious] or [short pause].')
    if minutes and words and not .75*minutes<=spoken<=1.3*minutes:warn.append(f'{words} words is about {spoken:g} minutes at {WPM} words a minute; the target is {minutes} minutes.')
    return script,warn,{'words':words,'minutes':spoken,'chars':sum(len(p['text']) for s in sections for p in s['paragraphs']),'tags':tags,
                        'sections':len(sections),'paragraphs':sum(len(s['paragraphs']) for s in sections)}

def voice_model(folder):
    try:return video_profile(folder)['voice'].get('model')
    except ValueError:return None

def save_script(folder,data):
    script,warn,stats=check_script(data,job(folder).get('minutes'),voice_model(folder))
    write(folder,'script.json',script);write(folder,'script-warnings.json',warn)
    j=job(folder)
    if script.get('title') and j.get('title')==j.get('topic'):j['title']=script['title'];write(folder,'job.json',j)
    return script,warn,stats

def approve(folder,on=True):
    """The creator read and approved the script (the human pass that makes the video theirs). A later edit needs a new approval."""
    j=job(folder);script=script_of(folder)
    if on and not script.get('sections'):raise ValueError('Write the script first.')
    j['approved']={'hash':script_hash(script),'time':time.time()} if on else None;write(folder,'job.json',j);return j

def approved(folder):
    a=job(folder).get('approved');return bool(a and a.get('hash')==script_hash(script_of(folder)))

def py(cmd,folder=None):
    """A channel.py command written the way Claude must run it (absolute paths, so permissions match exactly)."""
    return f'{sys.executable} {ROOT/"channel.py"} {cmd}'+(f' {Path(folder).resolve().name}' if folder else '')

def video_permissions(folder,files,commands=(),web=False):
    """Claude Code may read the video folder and the guide, write only the named files there, and run only the named commands."""
    d='/'+str(Path(folder).resolve());root='/'+str(ROOT)
    allowed=[f'Read({d}/**)',f'Read(/{GUIDE})',f'Read({root}/AGENTS.md)',*[f'{t}({d}/{f})' for f in files for t in ('Write','Edit')],
             *[f'Bash({c})' for c in commands],*(['WebSearch','WebFetch'] if web else [])]
    denied=[f'Read({root}/.env*)','Bash(cat:*)','Bash(head:*)','Bash(tail:*)','Bash(less:*)','Bash(grep:*)']
    tools='Read,Write,Edit,Glob'+(',Bash' if commands else '')+(',WebSearch,WebFetch' if web else '')
    return ['--tools',tools,'--allowedTools',*allowed,'--disallowedTools',*denied,'--permission-mode','dontAsk']

def describe(tool,args,cwd):
    target=str(args.get('file_path') or args.get('command') or args.get('query') or args.get('url') or '')
    name=Path(target.split()[0] if tool=='Bash' and target else target).name
    if tool=='WebSearch':return f'Claude is researching: {target[:60]}'
    if tool=='WebFetch':return 'Claude is reading a source'
    if tool in ('Write','Edit','MultiEdit'):return {'script.json':'Claude is writing the script','sources.md':'Claude is noting the sources',
                                                     'scenes.json':'Claude is planning the shots','post.json':'Claude is writing the post',
                                                     'moments.json':'Claude is choosing the shorts'}.get(name,f'Claude is writing {name}')
    if tool=='Read':return f'Claude is reading {name}'
    if tool=='Bash':return 'Checking the work'
    return 'Claude is working'

BACKED=['script.json','sources.md','scenes.json','post.json','moments.json']
def backup(folder,why):
    folder=Path(folder);name=f'{time.strftime("%Y%m%d-%H%M%S")}-{why}';d=folder/'.undo'/name;n=2
    while d.exists():d=folder/'.undo'/f'{name}-{n}';n+=1
    d.mkdir(parents=True)
    for f in BACKED:
        if (folder/f).exists():shutil.copy2(folder/f,d/f)
    return d.name

def undo(folder):
    """Put back the files from before Claude's last change (one step per call)."""
    folder=Path(folder);runs=read(folder,'claude-runs.json',[])
    last=next((r for r in reversed(runs) if r.get('backup') and not r.get('undone')),None)
    if not last or not (folder/'.undo'/last['backup']).exists():raise ValueError('There is no Claude change to undo.')
    d=folder/'.undo'/last['backup']
    for f in BACKED:
        if (d/f).exists():shutil.copy2(d/f,folder/f)
        else:(folder/f).unlink(missing_ok=True)
    last['undone']=True;write(folder,'claude-runs.json',runs)
    chat=read(folder,'chat.json',{'messages':[]})
    for m in chat['messages']:
        if m.get('backup')==last['backup']:m['undone']=True
    write(folder,'chat.json',chat);return last

def record(folder,info):write(folder,'claude-runs.json',read(folder,'claude-runs.json',[])+[info])

def changed_files(folder,saved):
    folder=Path(folder);d=folder/'.undo'/saved;out=[]
    for f in BACKED:
        a=(d/f).read_bytes() if (d/f).exists() else None;b=(folder/f).read_bytes() if (folder/f).exists() else None
        if a!=b:out.append(f)
    return out

def video_rules(folder):
    folder=Path(folder).resolve();j=job(folder);p=video_profile(folder)
    research=read(RESEARCH/j['research'],'data.json') if j.get('research') else None
    proven=[v for v in (research or {}).get('videos',[]) if v['id'] in j.get('based_on',[])]
    return [f'Video folder: {folder}. Read {GUIDE} first: how this channel writes, researches and plans visuals.',
            *profile_note(p),f'Topic: {j["topic"]}',*([f'Opening idea: {j["hook"]}'] if j.get('hook') else []),
            *([f'Notes from the creator for this video: {j["notes"]}'] if j.get('notes') else []),
            *(['Proven videos this topic is modelled on (do better than them; never copy): '+'; '.join(f'"{v["title"]}" ({v["views"]:,} views)' for v in proven)] if proven else []),
            f'Target length: {j["minutes"]} minutes, about {j["minutes"]*WPM} spoken words (tags do not count). The narration is in English.',
            narrator_note(p)]

def narrator_note(p):
    v=p.get('voice') or {};m=VOICE_MODELS.get(v.get('model'),{})
    who=f'ElevenLabs voice "{v.get("name") or "not chosen yet"}" on {m.get("name","").split(" ·")[0] or v.get("model")}'
    return (f'Narrator: {who}, which performs [audio tags]: write the narration as a performance with delivery cues (guide section 3).' if m.get('tags') else
            f'Narrator: {who}, which does not perform [audio tags] ([short pause] and [long pause] still become breaks): rely on punctuation, rhythm and wording (guide section 3).')

SCRIPT_FORMAT='''script.json format:
{"title": "working title",
 "sections": [{"id": "s1", "kind": "hook", "title": "", "paragraphs": [{"id": "p1", "text": "spoken words..."}]},
              {"id": "s2", "kind": "intro", "title": "", "paragraphs": [...]},
              {"id": "s3", "kind": "chapter", "title": "Short chapter title", "paragraphs": [...]}, ... ,
              {"id": "s9", "kind": "outro", "title": "", "paragraphs": [...]}]}
kind is one of hook, intro, chapter, rehook, outro. "text" is what the narrator says, plus delivery cues in square brackets
([curious], [whispers], [short pause]) that the voice performs and the captions leave out. Nothing else in "text" may be
anything but spoken words.'''

def write_script(folder,model='sonnet',status=say):
    """Claude Code researches the topic (web search, sources.md) and writes script.json, then checks it (plan usage)."""
    folder=Path(folder).resolve()
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    saved=backup(folder,'script');started=time.time()
    ask='\n'.join(['You write narration scripts for a faceless English YouTube channel.',*video_rules(folder),'',SCRIPT_FORMAT,'',
        'Work in this order:',
        '1. Research the topic with WebSearch and WebFetch: confirm every fact you plan to use from good sources (official sites, papers, '
        'reputable press). Think about what the top videos on this topic probably say, and find what they miss.',
        f'2. Write {folder}/sources.md: each claim with its source URL, then "## Our angle": what this video adds.',
        f'3. Write {folder}/script.json following the guide (hook, promise, chapters with titles, re-hook, payoff, outro) at the target length, '
        'written as a performance for the voice (section 3: how people talk, punctuation, emphasis, delivery cues). Read it aloud in your head: '
        'if a line sounds like an encyclopedia, rewrite it the way a curious friend would say it.',
        f'4. Run {py("check-script",folder)} and fix every warning; run it again until it is clean.',
        'Finish with two short sentences for the creator: the angle of the video and anything they should check.'])
    result=graphics.run_claude([ask,'--model',model,*video_permissions(folder,['script.json','sources.md'],[py('check-script',folder)],web=True)],
                               ROOT,status,'Claude is researching the topic',log=folder/'claude.log',
                               timeout=int(float(setting('CHANNEL_SCRIPT_MINUTES','30'))*60),describe=describe)
    script,warn,stats=save_script(folder,script_of(folder))
    if not script['sections']:raise RuntimeError('Claude Code finished without writing the script. Its note: '+(result.get('result') or '')[-1500:])
    info={'kind':'script','model':model,'started':started,'finished':time.time(),'summary':(result.get('result') or '').strip(),
          'backup':saved,'changes':changed_files(folder,saved),'warnings':warn,'stats':stats}
    record(folder,info);return info

def send(folder,text,model='sonnet',status=say):
    """One chat message: Claude Code (the same session as the last message) changes the script, sources, shots or post in
    place. Every message that changed something can be undone."""
    folder=Path(folder).resolve();text=text.strip()
    if not text:raise ValueError('Write what you want changed.')
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    chat=read(folder,'chat.json',{'messages':[],'session':None})
    saved=backup(folder,'chat');started=time.time()
    chat['messages'].append({'role':'user','text':text,'time':started});write(folder,'chat.json',chat)
    files=[f for f in BACKED if (folder/f).exists()] or ['script.json']
    checks=[py('check-script',folder)]+([py('check-scenes',folder)] if 'scenes.json' in files else [])
    ask=(['You are editing a faceless YouTube video together with the creator.',*video_rules(folder),'',SCRIPT_FORMAT,'',
          f'Files you may change: {", ".join(files)} (in {folder}). Make exactly the change the creator asks, nothing else; keep the ids of '
          f'paragraphs and shots you do not rewrite. After changing script.json run {checks[0]}'+(f', after scenes.json run {checks[1]},' if len(checks)>1 else '')+
          ' and fix warnings. You may research with WebSearch/WebFetch when the change needs facts; add new sources to sources.md. If the request is unclear, '
          'ask one short question. Reply in one or two short sentences: what you changed, or your question.','','The creator says: '+text] if not chat.get('session') else
         ['The creator says: '+text,'(The files may have changed since your last turn, by hand in the editor: Read them again before editing.)'])
    error=None;result={}
    try:
        result=graphics.run_claude(['\n'.join(ask),'--model',model,*video_permissions(folder,files,checks,web=True)],ROOT,status,
                                   'Claude is reading your message',log=folder/'claude.log',timeout=int(float(setting('CHANNEL_CHAT_MINUTES','10'))*60),
                                   keep=True,resume=chat.get('session'),describe=describe)
    except Cancelled:raise
    except Exception as e:error=e
    if (folder/'script.json').exists():save_script(folder,script_of(folder))
    diff=changed_files(folder,saved)
    if not diff:shutil.rmtree(folder/'.undo'/saved,ignore_errors=True)
    answer={'role':'assistant','text':(result.get('result') or '').strip(),'changes':diff,'backup':saved if diff else None,'time':time.time()}
    if error is not None:answer['error']=str(error)
    chat=read(folder,'chat.json',chat);chat['messages'].append(answer)
    if result.get('session_id'):chat['session']=result['session_id']
    write(folder,'chat.json',chat)
    if diff:record(folder,{'kind':'chat','request':text,'model':model,'started':started,'finished':time.time(),'summary':answer['text'],'backup':saved,'changes':diff})
    if error is not None and not diff:raise error
    return answer

def clear_chat(folder):write(folder,'chat.json',{'messages':[],'session':None})

# ---- videos: voice-over --------------------------------------------------------------------------------------------

def voice_estimate(folder):
    p=video_profile(folder);return channel_voice.estimate(folder,script_of(folder),p['voice'],VOICE_MODELS)

def voice(folder,status=say,allowed=None):
    """Speak the script with the channel's ElevenLabs voice (only paragraphs without a take; costs credits)."""
    script=script_of(folder)
    if not script.get('sections'):raise ValueError('Write the script first.')
    if not keys()['elevenlabs']:raise ValueError('Add ELEVENLABS_API_KEY to .env for the voice-over.')
    p=video_profile(folder);data=channel_voice.speak(folder,script,p['voice'],VOICE_MODELS,status,allowed)
    (Path(folder)/'captions.srt').write_text(channel_voice.srt(data['words']));return data

def voiced(folder):
    """True when voice.wav says the current script, in whichever voice it was made. A voice changed on the channel later
    does not block anything: voice_changed() offers the re-voice."""
    folder=Path(folder);w=read(folder,'words.json')
    if not w or not (folder/'voice.wav').exists():return False
    paras=[p for s in script_of(folder)['sections'] for p in s['paragraphs']];made=w.get('paragraphs',[])
    if [p['id'] for p in made]!=[p['id'] for p in paras]:return False
    used={'id':w.get('voice'),'model':w.get('model'),'delivery':w.get('delivery','natural')}
    keys=[channel_voice.voice_key(p['text'],used) for p in paras]
    if all('key' in m for m in made):return keys==[m['key'] for m in made]
    return all((folder/'voice'/f'{k}.mp3').exists() for k in keys)  # made before keys were kept

def voice_changed(folder):
    """The voice-over was made with another voice, model or delivery than the channel has now (None when it matches)."""
    w=read(folder,'words.json')
    try:v=video_profile(folder)['voice']
    except ValueError:return None
    if not w:return None
    then=(w.get('voice'),w.get('model'),w.get('delivery','natural'));now=(v.get('id'),v.get('model'),v.get('delivery','natural'))
    return None if then==now else {'model':VOICE_MODELS.get(then[1],{}).get('name',then[1] or '').split(' ·')[0],'delivery':then[2],
                                   'same_voice':then[0]==now[0]}

# ---- videos: make it sound human (delivery pass) ---------------------------------------------------------------------

def perform(folder,model='sonnet',status=say):
    """Claude Code rewrites the delivery of the script (not its content): how people talk, punctuation, emphasis and
    [delivery tags] for the channel's voice model (plan usage). Facts, order and paragraph ids stay; it can be undone."""
    folder=Path(folder).resolve()
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    if not script_of(folder).get('sections'):raise ValueError('Write the script first.')
    saved=backup(folder,'perform');started=time.time()
    ask='\n'.join(['Make this narration sound like a person talking, not a robot reading. Change the delivery only.',*video_rules(folder),'',SCRIPT_FORMAT,'',
        f'Read {folder}/script.json, then edit it following section 3 of the guide:',
        '- How people talk: contractions (it is → it\'s), mixed sentence lengths, a question to the viewer now and then, a short aside, '
        'words like "okay", "so", "here\'s the thing" where a person would say them.',
        '- Punctuation as direction: ellipses for a beat of suspense, dashes for a turn, a question mark to lift, CAPS on the one word to stress '
        '(never more than one per sentence), commas where a breath goes.',
        '- Delivery cues in [brackets] before the words they colour, about one every two to four sentences: [curious], [excited], [whispers], '
        '[sighs], [laughs softly], [thoughtful], [amazed], [serious], [short pause], [long pause]. Pick ones that suit the narrator; '
        'never sound effects or music.',
        'Keep every fact, number, name and source claim exactly; keep the order, the sections, the chapter titles and every paragraph id; '
        'keep the length within ten percent. Do not add new claims.',
        f'Then run {py("check-script",folder)} and fix every warning. Finish with one sentence on what you changed.'])
    result=graphics.run_claude([ask,'--model',model,*video_permissions(folder,['script.json'],[py('check-script',folder)])],ROOT,status,
                               'Claude is making it sound human',log=folder/'claude.log',timeout=int(float(setting('CHANNEL_CHAT_MINUTES','10'))*60),describe=describe)
    script,warn,stats=save_script(folder,script_of(folder))
    info={'kind':'perform','model':model,'started':started,'finished':time.time(),'summary':(result.get('result') or '').strip(),'backup':saved,
          'changes':changed_files(folder,saved),'warnings':warn,'stats':stats}
    if not info['changes']:shutil.rmtree(folder/'.undo'/saved,ignore_errors=True);info['backup']=None
    record(folder,info);return info

# ---- videos: shots, footage, render --------------------------------------------------------------------------------

SCENES_FORMAT='''scenes.json format (each shot starts at a phrase of a paragraph and lasts until the next shot starts):
{"shots": [
  {"id": "sh1", "p": "p1", "at": "", "kind": "image", "prompt": "subject, action, setting, composition", "mascot": true},
  {"id": "sh2", "p": "p1", "at": "first words of the shot", "kind": "stock", "query": "2-4 filmable words", "motion": "push"},
  {"id": "sh3", "p": "p3", "at": "", "kind": "chapter", "title": "Chapter title"},
  {"id": "sh4", "p": "p3", "at": "wave of pressure", "kind": "graphic", "template": "big-number", "props": {"field": "value"}},
  {"id": "sh5", "p": "p4", "at": "the surface of Mars", "kind": "image", "prompt": "the scene only (the style is added)", "mascot": true},
  {"id": "sh6", "p": "p5", "at": "", "kind": "ai_clip", "prompt": "the still to animate", "animate": "how it moves", "mascot": false}]}
"at" quotes the words where the shot starts, exactly as in the paragraph ("" = the paragraph start). motion: push, pull, left, right, still.'''

def budget_left(folder):
    import channel_media
    return max(0.,float(video_profile(folder).get('ai_budget') or 0)-channel_media.spent(folder))

def check_shots(folder):
    import channel_render
    art=art_of(video_profile(folder))
    shots,warn=channel_render.check_scenes(folder,budget_left(folder) if keys()['fal'] else 0.,{'mascot':bool(art['mascot']),'stock':art['stock']})
    write(folder,'scenes-warnings.json',warn);return shots,warn

def timed_script(folder):
    """The narration with every paragraph's id, section and time, for planning shots."""
    words=read(folder,'words.json');script=script_of(folder);at={p['id']:p for p in words['paragraphs']}
    clock=lambda t:f'{int(t//60)}:{t%60:04.1f}';lines=[]
    for s in script['sections']:
        lines.append(f'## {s["id"]} {s["kind"]}'+(f': {s["title"]}' if s['title'] else ''))
        for p in s['paragraphs']:
            t=at.get(p['id']);said=channel_voice.spoken(p['text'])
            lines.append(f'{p["id"]} [{clock(t["start"])}-{clock(t["end"])}] {said}' if t else f'{p["id"]} [not voiced] {said}')
    return '\n'.join(lines)

def plan_shots(folder,model='sonnet',status=say):
    """Claude Code plans every shot of the video from the timed narration (plan usage), then checks the plan."""
    folder=Path(folder).resolve()
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    if not read(folder,'words.json'):raise ValueError('Voice the script first: shots follow the timing of the voice-over.')
    k=keys();left=budget_left(folder) if k['fal'] else 0.;art=art_of(video_profile(folder))
    import channel_media
    stock=(k['pexels'] or k['pixabay']) and art['stock']
    drawn=art['style']!='realistic'
    saved=backup(folder,'shots');started=time.time()
    ask='\n'.join(['You are the editor of a faceless YouTube video. Plan the picture for every moment of the narration.',*video_rules(folder),'',
        'The narration with timings (paragraph id [start-end] text):',timed_script(folder),'',SCENES_FORMAT,'',
        'What you can use:',
        f'The channel\'s look: {art["style"]} illustrations. Every image prompt automatically gets this style added: "{art["prompt"]}". '
        'Write prompts that describe only the scene: subject, action, setting, composition, mood. Never ask for text, letters, logos or real people\'s faces.',
        *([f'The channel mascot is {art["mascot_name"] or "a recurring character"}: {art["mascot_description"] or "see the reference image"}. Set "mascot": true on an image '
           'or ai_clip shot to put it in the scene (the image model keeps its exact look from the reference image); say in the prompt what it does '
           '(points at, reacts to, explains, holds). Use it on about a third of the illustrated shots: the hook, reactions, explanations and the outro.']
          if art['mascot'] else []),
        '- stock: '+('real footage from Pexels/Pixabay found by your query.' if stock else 'NOT part of this channel\'s look: do not use stock shots.'),
        f'- graphic: one of these Motion Studio scene templates (template id, fields with defaults):\n{films.scene_summary()}',
        '- chapter: a chapter card; put one at the start of every chapter section (its first paragraph, at ""), followed by a new shot about 3 seconds later.',
        (f'- image (about ${channel_media.cost_of("image"):.2f} each): an illustration shown with a slow camera move'+(' (the main kind of shot for this channel)' if drawn else '')+
         f'; ai_clip (about ${channel_media.cost_of("ai_clip"):.2f} each, {channel_media.CLIP_SECONDS} s): the same kind of illustration, animated ("animate": how it moves). '
         f'Paid: ${left:.2f} left in this video\'s AI budget; plan within it. Use ai_clip only for the hook and one or two hero moments.'
         +(' Give each a stock "query" to fall back on.' if stock else '')
         if left>0 else '- image and ai_clip: NOT available for this video (no fal.ai key or no AI budget): use graphics and chapters.'),
        '','Rules: follow section 4 of the guide. A new shot every 3-7 seconds; a graphic for every number, comparison, list or step the narration says, '
        'with the on-screen words taken from the narration (short); never four shots of one kind in a row; open on the strongest picture you have. '
        'Keep illustrations consistent: the same places and objects described the same way each time they return.',
        f'Write {folder}/scenes.json, then run {py("check-scenes",folder)} and fix every warning; run it again until it is clean.',
        'Finish with one sentence: how many shots, and which moments use AI visuals.'])
    result=graphics.run_claude([ask,'--model',model,*video_permissions(folder,['scenes.json'],[py('check-scenes',folder)])],ROOT,status,
                               'Claude is planning the shots',log=folder/'claude.log',timeout=int(float(setting('CHANNEL_SHOTS_MINUTES','25'))*60),describe=describe)
    shots,warn=check_shots(folder)
    if not shots:raise RuntimeError('Claude Code finished without planning shots. Its note: '+(result.get('result') or '')[-1500:])
    info={'kind':'shots','model':model,'started':started,'finished':time.time(),'summary':(result.get('result') or '').strip(),'backup':saved,
          'changes':changed_files(folder,saved),'warnings':warn}
    record(folder,info);return info

def footage_costs(folder):
    import channel_render
    shots=read(folder,'shots.json',{}).get('shots',[])
    return channel_render.plan_costs(folder,shots,art=art_of(video_profile(folder)))

def gather(folder,status=say,spend=0.):
    """Find stock footage for every shot (free) and make the AI visuals the creator approved (spend, in USD)."""
    import channel_render
    shots,_=check_shots(folder);p=video_profile(folder)
    out=channel_render.gather(folder,shots,keys(),float(p.get('ai_budget') or 0),status,spend,art=art_of(p))
    write(folder,'gather.json',{**out,'time':time.time()});return out

def render(folder,final=False,status=say):
    import channel_render
    if not voiced(folder):raise ValueError('The script changed after the voice-over: voice the changed paragraphs first (Voice tab).')
    check_shots(folder);return channel_render.render(folder,video_profile(folder),final,status)

# ---- videos: shorts cut from the long video ------------------------------------------------------------------------

MOMENTS_SCHEMA={'type':'object','additionalProperties':False,'required':['moments'],'properties':{'moments':{'type':'array','items':{
    'type':'object','additionalProperties':False,'required':['first','last','title','hook','why'],'properties':{
    'first':{'type':'string','description':'id of the first paragraph'},'last':{'type':'string','description':'id of the last paragraph'},
    'title':{'type':'string'},'hook':{'type':'string','description':'on-screen hook, at most 8 words'},'why':{'type':'string'}}}}}}

def check_moments(folder,data):
    """Moments as whole paragraphs of the voice-over: 15-75 s each, in order, not overlapping. Returns (moments, warnings)."""
    words=read(folder,'words.json');paras=words['paragraphs'];index={p['id']:i for i,p in enumerate(paras)};out=[];warn=[]
    for m in data.get('moments') or []:
        a,b=index.get(str(m.get('first'))),index.get(str(m.get('last')))
        if a is None or b is None or b<a:warn.append(f'Moment "{m.get("title","")}" points at paragraphs that are not in the voice-over (dropped).');continue
        start=max(0.,paras[a]['start']-.1);end=min(words['duration'],paras[b]['end']+.45);d=end-start
        if not 15<=d<=75:warn.append(f'Moment "{m.get("title","")}" lasts {d:.0f} s; shorts here are 15-75 s (dropped).');continue
        if any(start<o['end'] and o['start']<end for o in out):warn.append(f'Moment "{m.get("title","")}" overlaps another (dropped).');continue
        out.append({'first':paras[a]['id'],'last':paras[b]['id'],'start':round(start,3),'end':round(end,3),'title':str(m.get('title','')).strip()[:80],
                    'hook':' '.join(str(m.get('hook','')).split()[:8]),'why':str(m.get('why','')).strip()[:400]})
    out=sorted(out,key=lambda m:m['start'])[:5]
    for n,m in enumerate(out,1):m['n']=n
    return out,warn

def moment_count(seconds):
    """How many shorts a video of this length gives without them covering all of it."""
    return '1-2' if seconds<150 else '2-3' if seconds<300 else '3-5'

def pick_moments(folder,model='sonnet',status=say):
    """Claude Code picks the moments of the narration that work alone as shorts (plan usage, reads only)."""
    folder=Path(folder).resolve();words=read(folder,'words.json')
    if not words:raise ValueError('Voice the script first.')
    ask='\n'.join(['Pick the moments of this faceless YouTube video that work on their own as YouTube Shorts.',*video_rules(folder),'',
        'The narration (paragraph id [start-end] text):',timed_script(folder),'',
        f'Read section 5 of the guide. Return {moment_count(words["duration"])} moments, each a run of whole paragraphs (first and last paragraph id) of 20-60 seconds that opens on a '
        'hook sentence, holds one idea and ends on its payoff, needing nothing said before it. title: a Shorts title (under 60 characters). '
        'hook: on-screen text for the first seconds, at most 8 words. why: one sentence.'])
    result=graphics.run_claude([ask,'--model',model,'--json-schema',json.dumps(MOMENTS_SCHEMA),'--tools','Read','--allowedTools',f'Read(/{folder}/**)',f'Read(/{GUIDE})',
                                '--disallowedTools',f'Read(/{ROOT}/.env*)','--permission-mode','dontAsk'],ROOT,status,'Claude is choosing the shorts',
                               log=folder/'claude.log',timeout=600,describe=describe)
    out=result.get('structured_output') or {}
    moments,warn=check_moments(folder,out)
    if not moments:raise RuntimeError('Claude found no moment that works alone. '+(' '.join(warn) or (result.get('result') or '')[-500:]))
    old={m.get('first'):m.get('job') for m in (read(folder,'moments.json') or {}).get('moments',[])}
    for m in moments:m['job']=old.get(m['first'])
    write(folder,'moments.json',{'moments':moments,'warnings':warn,'model':model,'time':time.time()});return moments,warn

def seed_captions(folder,start,end):
    """The exact ElevenLabs words of a moment as Shorts captions, timed from the moment's start (no transcription needed)."""
    words=read(folder,'words.json')['words']
    caps=[{'text':' '+w['text'],'startMs':round((w['start']-start)*1000),'endMs':round((w['end']-start)*1000),'timestampMs':None,'confidence':1}
          for w in words if w['start']>=start-.05 and w['end']<=end+.05]
    return {'language':'en','provider':'elevenlabs','exact':True,'captions':caps}

def make_shorts(folder,picks=None,edit=False,status=say):
    """Render each chosen moment natively 9:16 from the same shots (illustrations re-framed, graphics laid out tall) and set
    it up as an ordinary Shorts editor video (runs/ID) with exact captions. Returns the Shorts job folders made."""
    import channel_render,shorts
    folder=Path(folder);data=read(folder,'moments.json') or {};moments=data.get('moments',[]);p=video_profile(folder);made=[]
    check_shots(folder)
    todo=[m for m in moments if (picks is None or m['n'] in picks) and not (m.get('job') and (ROOT/'runs'/m['job']/'job.json').exists())]
    for k,m in enumerate(todo):
        status(f'Short {k+1} of {len(todo)}: rendering 9:16',k/max(1,len(todo)))
        out=channel_render.render(folder,p,True,status,size='portrait',span=(m['start'],m['end']),out_name=f'short-{m["n"]}.mp4')
        path=ROOT/'runs'/uuid.uuid4().hex;path.mkdir(parents=True)
        try:
            shutil.copy2(out,path/'upload.mp4')
            write(path,'job.json',{'title':m['title'][:80] or f'Short {m["n"]}','created':time.time(),'client':None,
                                   'source':{'kind':'channel','video':folder.name,'title':job(folder).get('title'),'moment':m['n'],'start':m['start'],'end':m['end'],'hook':m['hook']}})
            write(path,'workflow-mode.json',{'mode':'shorts','preset':'duo','noise':'off','tracking':'off','language':'en','voice':'off'})
            write(path,'seed-captions.json',seed_captions(folder,m['start'],m['end']))
            if edit:write(path,'auto.json',{'notes':(f'This short is a finished moment of a faceless channel video ("{job(folder).get("title")}"), already cut and '
                                                     f'voiced: keep every part of it, cut nothing. Open on the hook as on-screen text: "{m["hook"]}". The picture is '
                                                     'illustrations without a person: no face, no hand stickers.')[:2000]})
            shorts.save_status(path,'idle','Waiting to be transcribed')
        except BaseException:
            shutil.rmtree(path,ignore_errors=True);raise
        m['job']=path.name;write(folder,'moments.json',{**data,'moments':moments});made.append(path)
    return made

# ---- videos: the post (titles, description, chapters) and thumbnails -----------------------------------------------

POST_SCHEMA={'type':'object','additionalProperties':False,'required':['titles','summary','tags','pinned_comment','thumb_texts','best_time'],'properties':{
    'titles':{'type':'array','items':{'type':'string'},'description':'3 title options, 40-70 characters'},
    'summary':{'type':'string','description':'2-3 sentences for the top of the description: the hook and the promise'},
    'tags':{'type':'array','items':{'type':'string'},'description':'8-15 tags'},
    'pinned_comment':{'type':'string','description':'a question about the topic to pin under the video'},
    'thumb_texts':{'type':'array','items':{'type':'string'},'description':'3 thumbnail texts, 2-4 words each, not repeating the title'},
    'best_time':{'type':'string','description':'when to publish for this audience, one line'}}}

def chapters(folder):
    """YouTube chapters from the voice-over: 0:00 first, at least 10 s each (shorter ones merge into the one before)."""
    words=read(folder,'words.json') or {};out=[]
    for s in words.get('sections',[]):
        title=s.get('title') or {'hook':'Intro','intro':'Intro','outro':'Wrap-up','rehook':''}.get(s.get('kind'),'')
        if not title:continue
        if out and (s['start']-out[-1]['start']<10 or title==out[-1]['title']):continue
        out.append({'start':0. if not out else s['start'],'title':title})
    if out and out[0]['start']:out[0]['start']=0.
    end=words.get('duration',0)
    while len(out)>1 and end-out[-1]['start']<10:out.pop()  # the last one must last 10 s too
    stamp=lambda t:f'{int(t//3600)}:{int(t%3600//60):02}:{int(t%60):02}' if t>=3600 else f'{int(t//60)}:{int(t%60):02}'
    return [{'time':stamp(c['start']),**c} for c in out] if len(out)>=3 else []

def source_links(folder):
    text=(Path(folder)/'sources.md').read_text() if (Path(folder)/'sources.md').exists() else ''
    seen=[]
    for u in re.findall(r'https?://[^\s)\]>]+',text):
        u=u.rstrip('.,;')
        if u not in seen:seen.append(u)
    return seen[:15]

def ai_used(folder):
    """Realistic AI visuals need YouTube's altered or synthetic content label; illustrations and cartoons do not."""
    art=art_of(video_profile(folder));vis=read(folder,'visuals.json') or {}
    return art['style']=='realistic' and any(isinstance(v,dict) and v.get('provider')=='fal.ai' for v in vis.values())

def description(folder,post):
    import channel_render
    parts=[post.get('summary','').strip()]
    ch=chapters(folder)
    if ch:parts.append('Chapters\n'+'\n'.join(f'{c["time"]} {c["title"]}' for c in ch))
    links=source_links(folder)
    if links:parts.append('Sources\n'+'\n'.join(links))
    cred=channel_render.credits(folder)
    if cred:parts.append('Footage: '+', '.join(cred))
    parts.append('Narration voiced with AI (ElevenLabs). Script researched and written for this channel.'
                 +(' Illustrations made with AI.' if (read(folder,'visuals.json') or {}) and any(isinstance(v,dict) and v.get('provider')=='fal.ai' for v in (read(folder,'visuals.json') or {}).values()) else ''))
    return '\n\n'.join(x for x in parts if x)[:4900]

def package(folder,model='sonnet',status=say):
    """Claude Code writes the titles, summary, tags, pinned comment and thumbnail texts (plan usage); the description adds
    the chapters, sources, credits and AI note; then the thumbnails are rendered."""
    folder=Path(folder).resolve()
    if not read(folder,'words.json'):raise ValueError('Voice the script first: chapters come from the voice-over.')
    ask='\n'.join(['Write the YouTube post for this faceless video.',*video_rules(folder),'','The script:',script_text(script_of(folder))[:20000],'',
        'Follow section 6 of the guide. Titles must be honest to the video; no clickbait it cannot pay off. Thumbnail texts are 2-4 punchy words that make '
        'people curious, different from the title. Tags: what people search for this topic.'])
    result=graphics.run_claude([ask,'--model',model,'--json-schema',json.dumps(POST_SCHEMA),'--tools','Read','--allowedTools',f'Read(/{folder}/**)',f'Read(/{GUIDE})',
                                '--disallowedTools',f'Read(/{ROOT}/.env*)','--permission-mode','dontAsk'],ROOT,status,'Claude is writing the post',
                               log=folder/'claude.log',timeout=600,describe=describe)
    out=result.get('structured_output')
    if not out:raise RuntimeError('Claude did not return the post. Try again.')
    clean=lambda xs,n,lim:[str(x).strip()[:lim] for x in xs or [] if str(x).strip()][:n]
    p=video_profile(folder)
    post={'titles':clean(out.get('titles'),3,100),'summary':str(out.get('summary','')).strip()[:1200],
          'tags':list(dict.fromkeys(clean(out.get('tags'),15,60)+p['upload'].get('tags',[])))[:20],'pinned_comment':str(out.get('pinned_comment','')).strip()[:500],
          'thumb_texts':clean(out.get('thumb_texts'),3,40),'best_time':str(out.get('best_time','')).strip()[:200],'model':model,'time':time.time()}
    post['title']=post['titles'][0] if post['titles'] else job(folder).get('title','')
    post['chapters']=chapters(folder);post['description']=description(folder,post);post['synthetic']=ai_used(folder)
    write(folder,'post.json',post)
    try:thumbnails(folder,status)
    except Exception as e:post['thumb_error']=str(e);write(folder,'post.json',post)
    return post

def save_post(folder,data):
    """The creator's edits to the post (title choice, description, tags)."""
    post=read(folder,'post.json') or {}
    for k in ('title','description','pinned_comment'):
        if k in data:post[k]=str(data[k] or '').strip()[:5000 if k=='description' else 100 if k=='title' else 500]
    if 'tags' in data:post['tags']=[str(t).strip()[:60] for t in data['tags'] or [] if str(t).strip()][:30]
    if 'thumb_texts' in data:post['thumb_texts']=[str(t).strip()[:40] for t in data['thumb_texts'] or []][:3]
    write(folder,'post.json',post);return post

def thumbnail_pictures(folder,n=3):
    """The illustrations to build thumbnails on: mascot shots first, then the hook, then the rest."""
    shots=read(folder,'shots.json',{}).get('shots',[]);vis=read(folder,'visuals.json') or {}
    have=[(s,vis[s['id']]) for s in shots if isinstance(vis.get(s['id']),dict) and vis[s['id']].get('kind')=='image']
    have.sort(key=lambda x:(not x[0].get('mascot'),x[0]['start']))
    return [v['file'] for _,v in have[:n]]

def thumbnails(folder,status=say):
    """Three 1280×720 thumbnails (thumbs/1-3.jpg): an illustration from the video with a thumbnail text, in the channel's look."""
    import subprocess,shorts
    from PIL import Image
    folder=Path(folder);post=read(folder,'post.json') or {};p=video_profile(folder);look=p['look']
    texts=post.get('thumb_texts') or [post.get('title','')];pics=thumbnail_pictures(folder)
    (folder/'thumbs').mkdir(exist_ok=True);shorts.need_motion();made=[]
    for i,text in enumerate(texts[:3]):
        status(f'Thumbnail {i+1} of {min(3,len(texts))}',i/3)
        props={'text':text,'image':pics[i%len(pics)] if pics else None,'style':look.get('style','cartoon'),'mode':look.get('mode','light'),
               'accent':look.get('accent','#FF7A59'),'accent2':look.get('accent2','#6EC1FF'),'backdrop':look.get('backdrop','cartoon'),'base':None,'variant':i}
        pf=folder/'thumbs'/f'.props-{i+1}.json';pf.write_text(json.dumps(props));png=folder/'thumbs'/f'.{i+1}.png'
        r=subprocess.run(['npx','remotion','still','src/index.ts','Thumbnail',str(png),'--props',str(pf),'--public-dir',str(folder),'--log','error']+shorts.browser_args(),
                         cwd=shorts.MOTION,capture_output=True,text=True)
        if r.returncode or not png.exists():raise RuntimeError('Could not render the thumbnail: '+(r.stderr or r.stdout)[-400:])
        Image.open(png).convert('RGB').save(folder/'thumbs'/f'{i+1}.jpg',quality=92);png.unlink();pf.unlink();made.append(f'thumbs/{i+1}.jpg')
    for old in (folder/'thumbs').glob('*.jpg'):
        if f'thumbs/{old.name}' not in made:old.unlink()
    return made

# ---- videos: upload and "Finish it for me" ---------------------------------------------------------------------------

def upload(folder,privacy='private',publish_at=None,thumb=1,status=say):
    """Upload the final video with its post, thumbnail and captions to the creator's YouTube channel (an explicit click every time)."""
    folder=Path(folder);post=read(folder,'post.json');p=video_profile(folder)
    if not (folder/'renders'/'final.mp4').exists():raise ValueError('Render the final video first.')
    if not post:raise ValueError('Write the post (title, description) first.')
    if privacy not in ('private','unlisted','public'):raise ValueError('Privacy must be private, unlisted or public.')
    meta={'title':post.get('title') or job(folder).get('title',''),'description':post.get('description',''),'tags':post.get('tags',[]),
          'category':p['upload'].get('category','27'),'privacy':privacy,'publish_at':publish_at,'made_for_kids':p['upload'].get('made_for_kids',False),
          'synthetic':bool(post.get('synthetic'))}
    vid=yt.upload(folder/'renders'/'final.mp4',meta,status);warn=[]
    status('Adding the thumbnail and captions',.98)
    jpg=folder/'thumbs'/f'{int(thumb)}.jpg'
    if jpg.exists():
        try:yt.set_thumbnail(vid,jpg)
        except Exception as e:warn.append(f'Thumbnail not set ({e}). Custom thumbnails need a verified YouTube account; add it in YouTube Studio.')
    if (folder/'captions.srt').exists():
        try:yt.add_captions(vid,folder/'captions.srt')
        except Exception as e:warn.append(f'Captions not added ({e}).')
    info={'video_id':vid,'url':f'https://youtu.be/{vid}','privacy':'private' if publish_at else privacy,'publish_at':publish_at,'uploaded':time.time(),'warnings':warn,
          'pinned_comment':post.get('pinned_comment','')}
    write(folder,'upload.json',info);return info

def finish(folder,credits=0,spend=0.,model='sonnet',status=say):
    """Finish it for me, after the creator approved the script: voice-over (the credits they confirmed), shots, footage (AI
    within the spend they approved), a draft render and the post. Each step is skipped when it is already done."""
    folder=Path(folder)
    if not approved(folder):raise ValueError('Read and approve the script first: that review is yours.')
    est=voice_estimate(folder)
    if est['credits']:
        if int(credits)<est['credits']:raise ValueError(f'The voice-over needs {est["credits"]:,} ElevenLabs credits. Confirm that amount to go ahead.')
        status('Voicing the script with ElevenLabs',None);voice(folder,status,est['credits'])
    elif not voiced(folder):voice(folder,status,0)
    if not (read(folder,'shots.json') or {}).get('shots') or (folder/'shots.json').stat().st_mtime<(folder/'words.json').stat().st_mtime:
        status('Claude is planning the shots',None);plan_shots(folder,model,status)
    gather(folder,status,spend)
    status('Rendering a draft',None);render(folder,False,status)
    if not read(folder,'post.json'):package(folder,model,status)
    return 'Draft ready: watch it, change what you like, then render the final.'

def stage(folder):
    folder=Path(folder)
    if read(folder,'upload.json',{}).get('video_id'):return 'Uploaded'
    for name,label in [('renders/final.mp4','Final ready'),('renders/draft.mp4','Draft ready')]:
        if (folder/name).exists():return label
    if (read(folder,'scenes.json') or {}).get('shots'):return 'Visuals ready' if (read(folder,'visuals.json') or {}).get('ready') else 'Shots planned'
    if (folder/'voice.wav').exists():return 'Voiced'
    if script_of(folder).get('sections'):return 'Approved' if approved(folder) else 'Script ready'
    return 'New'

def video_summary(folder):
    folder=Path(folder);j=job(folder);w=read(folder,'words.json') or {}
    thumb=next((f'/runs/channel/videos/{folder.name}/{n}' for n in ('thumbs/1.jpg','thumb.jpg') if (folder/n).exists()),None)
    return {'id':folder.name,'title':j.get('title') or j.get('topic',''),'topic':j.get('topic',''),'profile':j.get('profile'),'created':j.get('created',0),
            'minutes':j.get('minutes'),'duration':w.get('duration'),'stage':stage(folder),'thumb':thumb,
            'updated':max([f.stat().st_mtime for f in folder.glob('*.json')] or [j.get('created',0)])}

# ---- CLI -----------------------------------------------------------------------------------------------------------

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter);sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('profiles');sub.add_parser('quota')
    c=sub.add_parser('profile');c.add_argument('name');[c.add_argument('--'+k) for k in ('niche','audience','tone','notes')]
    c=sub.add_parser('research');c.add_argument('seeds');c.add_argument('--profile');c.add_argument('--months',type=int,default=12)
    c.add_argument('--searches',type=int,default=2);c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('scan');c.add_argument('rid')
    c=sub.add_parser('report');c.add_argument('rid');c.add_argument('--model',choices=list(MODELS))
    c=sub.add_parser('show');c.add_argument('rid')
    c=sub.add_parser('topics');c.add_argument('profile');c.add_argument('--focus',default='');c.add_argument('--competitors',default=None,help='@handles or links, comma separated (saved to the channel)')
    c.add_argument('--months',type=int,default=3);c.add_argument('--searches',type=int,default=1);c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('new');c.add_argument('topic');c.add_argument('--profile',required=True);c.add_argument('--minutes',type=int);c.add_argument('--hook',default='')
    c.add_argument('--notes',default='')
    c=sub.add_parser('script');c.add_argument('job');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('check-script');c.add_argument('job')
    c=sub.add_parser('chat');c.add_argument('job');c.add_argument('message');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('approve');c.add_argument('job')
    c=sub.add_parser('perform');c.add_argument('job');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('undo');c.add_argument('job')
    c=sub.add_parser('voice');c.add_argument('job');c.add_argument('--yes',action='store_true',help='spend the credits shown without asking')
    c=sub.add_parser('shots');c.add_argument('job');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('check-scenes');c.add_argument('job')
    c=sub.add_parser('gather');c.add_argument('job');c.add_argument('--spend',type=float,default=0.,help='USD you allow for AI images and clips this run')
    c=sub.add_parser('render');c.add_argument('job');c.add_argument('--final',action='store_true')
    c=sub.add_parser('moments');c.add_argument('job');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('shorts');c.add_argument('job');c.add_argument('--moments',default='');c.add_argument('--edit',action='store_true',help='Edit it for me in the Shorts editor (Claude API key)')
    c=sub.add_parser('package');c.add_argument('job');c.add_argument('--model',default='sonnet',choices=list(MODELS))
    c=sub.add_parser('thumbnails');c.add_argument('job')
    c=sub.add_parser('youtube-login')
    c=sub.add_parser('upload');c.add_argument('job');c.add_argument('--privacy',default='private',choices=['private','unlisted','public'])
    c.add_argument('--publish-at',default=None,help='ISO time to go public, e.g. 2026-11-02T18:00:00Z (uploads as private until then)');c.add_argument('--thumb',type=int,default=1)
    c=sub.add_parser('finish');c.add_argument('job');c.add_argument('--spend',type=float,default=0.);c.add_argument('--model',default='sonnet',choices=list(MODELS))
    a=p.parse_args()
    try:
        if a.cmd=='profiles':
            for x in profiles():print(f"- {x['id']}: {x['name']}"+(f" · {x['niche']}" if x.get('niche') else ''))
            return 0
        if a.cmd=='quota':print(f'YouTube units used today: {yt.used_today():,} of {yt.DAILY:,}');return 0
        if a.cmd=='profile':
            old=next((x for x in profiles() if x['name'].lower()==a.name.lower()),None)
            fields={'name':a.name,**{k:getattr(a,k) for k in ('niche','audience','tone','notes') if getattr(a,k) is not None}}
            x=save_profile(fields,old['id'] if old else None);print('PROFILE:',x['id']);return 0
        if a.cmd=='research':
            folder=new_research(a.seeds,a.months,a.searches,a.profile,a.model);print('RESEARCH:',folder.name)
            if keys()['youtube']:print(f'Uses up to {yt.estimate(seeds_of(a.seeds),a.searches):,} of the {yt.DAILY-yt.used_today():,} YouTube units left today.')
            show(folder,research(folder));return 0
        if a.cmd=='youtube-login':
            done=threading.Event();print('Open this link and allow access:\n'+yt.login(lambda r:done.set()));done.wait(600)
            print('Connected.' if yt.account()['connected'] else 'Not connected.');return 0
        if a.cmd=='topics':
            comps=seeds_of(a.competitors) if a.competitors is not None else None
            folder=new_topic_research(a.profile,a.focus,comps,a.months,a.searches,a.model);req=read(folder,'request.json');print('RESEARCH:',folder.name)
            if keys()['youtube']:print(f"Uses up to {topic_estimate(req['seeds'],req['searches'],req['competitors']):,} of the {yt.DAILY-yt.used_today():,} YouTube units left today.")
            show(folder,research(folder));return 0
        if a.cmd=='new':
            folder=new_video(a.profile,a.topic,a.minutes,a.hook,a.notes);print('VIDEO:',folder.name);return 0
        if a.cmd in VIDEO_COMMANDS:return video_command(a)
        folder=research_folder(a.rid)
        if a.cmd=='scan':data=scan(folder);print(data.get('skipped') or yt.brief(data));print(f"\n{data.get('units',0)} YouTube units used.");return 0
        if a.cmd=='report':show(folder,report(folder,model=a.model));return 0
        if a.cmd=='show':
            res=read(folder,'result.json')
            if not res:print('No report yet.',file=sys.stderr);return 1
            show(folder,res);return 0
    except (ValueError,RuntimeError) as e:print(e,file=sys.stderr);return 1
    return 0

VIDEO_COMMANDS=['script','check-script','perform','chat','approve','undo','voice','shots','check-scenes','gather','render','moments','shorts','package','thumbnails','upload','finish']
def video_command(a):
    folder=video_folder(a.job)
    if a.cmd=='script':
        info=write_script(folder,a.model);print(info['summary']);[print('WARNING:',w) for w in info['warnings']]
    elif a.cmd=='check-script':
        script,warn,stats=save_script(folder,script_of(folder))
        print(f"{stats['sections']} sections, {stats['paragraphs']} paragraphs, {stats['words']} words ≈ {stats['minutes']:g} min at {WPM} wpm")
        print('\n'.join('WARNING: '+w for w in warn) or 'No warnings.')
    elif a.cmd=='chat':print(json.dumps(send(folder,a.message,a.model),ensure_ascii=False,indent=1))
    elif a.cmd=='approve':approve(folder);print('Script approved.')
    elif a.cmd=='perform':
        info=perform(folder,a.model);print(info['summary']);[print('WARNING:',w) for w in info['warnings']]
    elif a.cmd=='undo':print('Undone:',undo(folder).get('kind'))
    elif a.cmd=='voice':
        est=voice_estimate(folder)
        if est['credits'] and not a.yes:
            if input(f"Voice {len(est['todo'])} paragraphs for {est['credits']:,} ElevenLabs credits? [y/N] ").strip().lower()!='y':return 1
        data=voice(folder,allowed=est['credits']);print(f"voice.wav: {data['duration']:.1f} s, {len(data['words'])} words")
    elif a.cmd=='shots':
        info=plan_shots(folder,a.model);print(info['summary']);[print('WARNING:',w) for w in info['warnings']]
    elif a.cmd=='check-scenes':
        shots,warn=check_shots(folder);kinds={}
        for x in shots:kinds[x['kind']]=kinds.get(x['kind'],0)+1
        print(f"{len(shots)} shots: "+', '.join(f'{n} {k}' for k,n in kinds.items()))
        print('\n'.join('WARNING: '+w for w in warn) or 'No warnings.')
    elif a.cmd=='gather':
        cost=footage_costs(folder)
        if cost['usd'] and a.spend<cost['usd']:print(f"AI visuals waiting: {len(cost['todo'])} for about ${cost['usd']:.2f}. Run again with --spend {cost['usd']:.2f} to make them.")
        out=gather(folder,spend=a.spend);print(f"Missing: {', '.join(out['missing']) or 'none'} · spent so far ${out['spent']:.2f}");[print('ERROR:',e) for e in out['errors']]
    elif a.cmd=='render':print(render(folder,a.final))
    elif a.cmd=='moments':
        moments,warn=pick_moments(folder,a.model)
        for m in moments:print(f"{m['n']}. {m['title']} ({m['end']-m['start']:.0f} s, {m['first']}-{m['last']}) · hook: {m['hook']}")
        [print('WARNING:',w) for w in warn]
    elif a.cmd=='shorts':
        picks=[int(x) for x in re.findall(r'\d+',a.moments)] or None
        for path in make_shorts(folder,picks,a.edit):print('SHORTS JOB:',path.name,'(open it in the Shorts editor; transcribe it there)')
    elif a.cmd=='package':
        post=package(folder,a.model);print(post['title']);print();print(post['description']);print();print('Tags:',', '.join(post['tags']))
        if post.get('thumb_error'):print('WARNING: thumbnails:',post['thumb_error'])
    elif a.cmd=='thumbnails':[print(t) for t in thumbnails(folder)]
    elif a.cmd=='upload':
        if input(f"Upload to YouTube as {'scheduled' if a.publish_at else a.privacy}? [y/N] ").strip().lower()!='y':return 1
        info=upload(folder,a.privacy,a.publish_at,a.thumb);print(info['url']);[print('WARNING:',w) for w in info['warnings']]
    elif a.cmd=='finish':
        est=voice_estimate(folder)
        if est['credits'] and input(f"Voice {len(est['todo'])} paragraphs for {est['credits']:,} ElevenLabs credits, AI visuals up to ${a.spend:.2f}? [y/N] ").strip().lower()!='y':return 1
        print(finish(folder,est['credits'],a.spend,a.model))
    return 0

def show(folder,res):
    print(res['summary'],'\n\nNICHES')
    for n in res['niches']:print(f"- [{n['verdict']}] {n['name']}: demand {n['demand']}/5, competition {n['competition']}/5, faceless {n['faceless_fit']}/5, RPM {n['rpm']}, risk {n['policy_risk']}")
    print('\nTOPICS')
    for t in res['topics']:print(f"- ({t['score']}) {t['title']} [{t.get('kind') or t['niche']}]"+(f"\n    angle: {t['angle']}" if t.get('angle') else ''))

if __name__=='__main__':sys.exit(main())
