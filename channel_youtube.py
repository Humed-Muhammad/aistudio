"""YouTube Data API for the Channel tool: niche research reads with a free API key (YOUTUBE_API_KEY).
Quota is 10,000 units a day per Google project and resets at midnight Pacific time: a search costs 100 units, a list of
up to 50 videos, channels or uploads costs 1. Every response is cached for a day, so a repeated scan costs nothing, and
the units spent are counted in runs/channel/quota.json so the creator sees what is left before a scan."""
from pathlib import Path
import hashlib,json,math,re,statistics,time
from datetime import datetime,timedelta,timezone
from config import ROOT,credential
from shorts import interruptible,say

API='https://www.googleapis.com/youtube/v3/'
HOME=ROOT/'runs'/'channel'
CACHE=HOME/'yt-cache'
QUOTA_FILE=HOME/'quota.json'
DAILY=10000
COST={'search':100,'videos':1,'channels':1,'playlistItems':1}
CACHE_SECONDS=24*3600
# Each search for a seed idea, in the order they are used: long-form that already pulled views, then what YouTube ranks first.
SEARCHES=[('medium','viewCount'),('long','viewCount'),('medium','relevance'),('any','viewCount')]
SMALL=50_000     # subscribers: a channel this size with a big video means the topic, not the channel, pulled the views
HIT=50_000       # views that count as a hit for a small or young channel
YOUNG=365        # days: a channel this new that already has hits means newcomers can still win

def read(path,default=None):
    try:return json.loads(Path(path).read_text())
    except (OSError,ValueError):return default

def write(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=1));tmp.replace(path)

def quota_day():
    """The quota day YouTube counts in (Pacific time, approximated as UTC-8)."""
    return (datetime.now(timezone.utc)-timedelta(hours=8)).strftime('%Y-%m-%d')

def used_today():
    q=read(QUOTA_FILE,{})
    return int(q.get('used',0)) if q.get('day')==quota_day() else 0

def spend(units):
    write(QUOTA_FILE,{'day':quota_day(),'used':used_today()+units})

def estimate(seeds,searches=2,channels=60):
    """Units a scan would use when nothing is cached: searches, then the video, channel and recent-upload lists."""
    found=len(seeds)*searches*50
    return len(seeds)*searches*COST['search']+math.ceil(found/50)+math.ceil(min(found,channels*4)/50)+channels*2

def get(endpoint,params,status=say):
    """One API read, from the cache when it is less than a day old. Errors never include the key."""
    import httpx
    tag=hashlib.sha1((endpoint+json.dumps(params,sort_keys=True)).encode()).hexdigest()
    hit=CACHE/f'{tag}.json';cached=read(hit)
    if cached and time.time()-cached.get('saved',0)<CACHE_SECONDS:return cached['data']
    key=credential('YOUTUBE_API_KEY')
    def call():
        for attempt in range(3):
            try:return httpx.get(API+endpoint,params={**params,'key':key},timeout=30)
            except httpx.TransportError:
                if attempt==2:raise RuntimeError("Can't reach YouTube. Check your internet connection, then try again.") from None
                time.sleep(2*(attempt+1))
    r=interruptible(call,status)
    if r.status_code>=400:
        try:err=r.json().get('error',{});reason=(err.get('errors') or [{}])[0].get('reason','');message=err.get('message','')
        except ValueError:reason,message='',r.text[:300]
        if reason in ('quotaExceeded','dailyLimitExceeded'):
            raise RuntimeError('The YouTube quota for today is used up. It resets at midnight Pacific time; cached results still work.')
        if reason in ('keyInvalid','badRequest') and 'key' in message.lower() or r.status_code==400 and 'API key' in message:
            raise RuntimeError('YouTube refused the API key. Check YOUTUBE_API_KEY in .env (YouTube Data API v3 must be enabled for it).')
        message=re.sub(r'key=[^&\s]+','key=…',message)[:300]
        raise RuntimeError(f'YouTube API error ({r.status_code}{", "+reason if reason else ""}): {message}')
    data=r.json();spend(COST.get(endpoint,1))
    write(hit,{'saved':time.time(),'data':data});return data

def seconds(iso):
    """ISO 8601 duration (PT1H2M3S) to seconds."""
    m=re.fullmatch(r'P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?',iso or '')
    if not m:return 0
    d,h,mi,s=(int(x or 0) for x in m.groups());return d*86400+h*3600+mi*60+s

def age_days(stamp,now):
    try:return max(1,(now-datetime.fromisoformat(stamp.replace('Z','+00:00'))).days)
    except (AttributeError,ValueError):return None

def chunks(items,n=50):
    items=list(items)
    for i in range(0,len(items),n):yield items[i:i+n]

def list_videos(ids,status=say):
    out=[]
    for part in chunks(ids):
        out+=get('videos',{'part':'snippet,statistics,contentDetails','id':','.join(part),'maxResults':50},status).get('items',[])
    return out

def list_channels(ids,status=say):
    out=[]
    for part in chunks(ids):
        out+=get('channels',{'part':'snippet,statistics,contentDetails','id':','.join(part),'maxResults':50},status).get('items',[])
    return out

def num(stats,key):
    try:return int(stats.get(key))
    except (TypeError,ValueError):return None

def scan(seeds,months=12,searches=2,status=say,max_channels=60):
    """Search YouTube for each seed idea, read the videos found and their channels, and score them.
    Returns the data the niche report is written from (also kept as data.json)."""
    seeds=[s.strip() for s in seeds if s.strip()][:10]
    if not seeds:raise ValueError('Give at least one seed idea, e.g. "space facts, personal finance for students".')
    searches=max(1,min(len(SEARCHES),int(searches)))
    now=datetime.now(timezone.utc);after=(now-timedelta(days=int(months)*30)).strftime('%Y-%m-%dT%H:%M:%SZ')
    spent=used_today();found={}
    for i,seed in enumerate(seeds):
        status(f'Searching YouTube for “{seed}”',i/len(seeds)*.5)
        for duration,order in SEARCHES[:searches]:
            params={'part':'id','q':seed,'type':'video','order':order,'publishedAfter':after,'maxResults':50,'relevanceLanguage':'en'}
            if duration!='any':params['videoDuration']=duration
            for item in get('search',params,status).get('items',[]):
                vid=item.get('id',{}).get('videoId')
                if vid:found.setdefault(vid,[])
                if vid and seed not in found[vid]:found[vid].append(seed)
    status('Reading the videos found',.55)
    raw=list_videos(found,status)
    status('Reading their channels',.65)
    by_channel={}
    for v in raw:by_channel.setdefault(v['snippet']['channelId'],[]).append(v)
    chans={c['id']:c for c in list_channels(by_channel,status)}
    # Recent uploads of the channels with the most views among the results: their median is what "normal" means for them.
    ranked=sorted(by_channel,key=lambda c:-sum(num(v.get('statistics',{}),'viewCount') or 0 for v in by_channel[c]))[:max_channels]
    recent={}
    for i,cid in enumerate(ranked):
        status('Reading each channel’s recent uploads',.7+.25*i/max(1,len(ranked)))
        uploads=chans.get(cid,{}).get('contentDetails',{}).get('relatedPlaylists',{}).get('uploads')
        if not uploads:continue
        try:items=get('playlistItems',{'part':'contentDetails','playlistId':uploads,'maxResults':50},status).get('items',[])
        except RuntimeError as e:
            if 'quota' in str(e):raise
            continue
        recent[cid]=list_videos([it['contentDetails']['videoId'] for it in items if it.get('contentDetails',{}).get('videoId')],status)
    channels=[]
    for cid,c in chans.items():
        st=c.get('statistics',{});ups=recent.get(cid,[])
        longform=[num(v.get('statistics',{}),'viewCount') for v in ups if seconds(v.get('contentDetails',{}).get('duration'))>180]
        longform=[x for x in longform if x is not None]
        dates=sorted(v['snippet']['publishedAt'] for v in ups if v.get('snippet',{}).get('publishedAt'))
        span=age_days(dates[0],now) if dates else None
        channels.append({'id':cid,'title':c['snippet'].get('title',''),'subs':None if st.get('hiddenSubscriberCount') else num(st,'subscriberCount'),
                         'videos':num(st,'videoCount'),'views':num(st,'viewCount'),'created':c['snippet'].get('publishedAt'),
                         'age_days':age_days(c['snippet'].get('publishedAt'),now),'median_views':int(statistics.median(longform)) if longform else None,
                         'uploads_per_month':round(len(dates)/max(span,1)*30,1) if span and len(dates)>1 else None,
                         'found':len(by_channel.get(cid,[])),'url':f'https://www.youtube.com/channel/{cid}'})
    cmap={c['id']:c for c in channels};videos=[]
    for v in raw:
        st=v.get('statistics',{});sn=v['snippet'];c=cmap.get(sn['channelId'],{})
        views=num(st,'viewCount') or 0;age=age_days(sn.get('publishedAt'),now) or 1
        subs=c.get('subs');med=c.get('median_views')
        videos.append({'id':v['id'],'title':sn.get('title',''),'channel_id':sn['channelId'],'channel':sn.get('channelTitle',''),
                       'published':sn.get('publishedAt'),'age_days':age,'duration':seconds(v.get('contentDetails',{}).get('duration')),
                       'views':views,'likes':num(st,'likeCount'),'comments':num(st,'commentCount'),'views_per_day':round(views/age),
                       'views_per_sub':round(views/max(subs,100),2) if subs is not None else None,
                       'outlier':round(views/med,1) if med else None,'channel_subs':subs,'channel_age_days':c.get('age_days'),
                       'seeds':found.get(v['id'],[]),'thumb':(sn.get('thumbnails',{}).get('medium') or {}).get('url'),
                       'tags':(sn.get('tags') or [])[:12],'url':f'https://www.youtube.com/watch?v={v["id"]}'})
    videos.sort(key=lambda v:-v['views'])
    data={'seeds':seeds,'months':int(months),'searches':searches,'scanned':time.time(),'units':used_today()-spent,
          'summary':[summarize(seed,[v for v in videos if seed in v['seeds']],cmap) for seed in seeds],
          'videos':videos,'channels':sorted(channels,key=lambda c:-(c['found'] or 0))}
    status('Scan finished',1);return data

def summarize(seed,videos,cmap):
    """Demand and competition signals for one seed idea."""
    if not videos:return {'seed':seed,'videos':0}
    views=[v['views'] for v in videos];subs=[v['channel_subs'] for v in videos if v['channel_subs'] is not None]
    small=[v for v in videos if v['views']>=HIT and v['channel_subs'] is not None and v['channel_subs']<SMALL]
    young=[v for v in videos if v['views']>=HIT and (v['channel_age_days'] or 9999)<YOUNG]
    outliers=sorted([v for v in videos if (v['outlier'] or 0)>=3 or (v['views_per_sub'] or 0)>=3],key=lambda v:-(v['outlier'] or v['views_per_sub'] or 0))
    channels={v['channel_id'] for v in videos}
    top=sorted(channels,key=lambda c:-sum(v['views'] for v in videos if v['channel_id']==c))
    share=sum(v['views'] for v in videos if v['channel_id'] in top[:3])/max(1,sum(views))
    return {'seed':seed,'videos':len(videos),'median_views':int(statistics.median(views)),'top_views':max(views),
            'median_channel_subs':int(statistics.median(subs)) if subs else None,'channels':len(channels),
            'top3_share':round(share,2),'small_channel_hits':len(small),'young_channel_hits':len(young),
            'outliers':[v['id'] for v in outliers[:12]]}

def brief(data,limit=12):
    """The scan as plain text for Claude: each seed's signals and its strongest outliers."""
    vids={v['id']:v for v in data['videos']};lines=[f"YouTube scan of {len(data['seeds'])} seed ideas, videos from the last {data['months']} months "
                                                    f"({len(data['videos'])} videos, {len(data['channels'])} channels)."]
    fmt=lambda n:'hidden' if n is None else f'{n/1e6:.1f}M' if n>=1e6 else f'{n/1e3:.0f}K' if n>=1e3 else str(n)
    for s in data['summary']:
        lines.append('')
        if not s.get('videos'):lines.append(f'## {s["seed"]}: nothing found');continue
        lines.append(f'## {s["seed"]}: {s["videos"]} videos from {s["channels"]} channels; median {fmt(s["median_views"])} views, top {fmt(s["top_views"])}; '
                     f'median channel {fmt(s["median_channel_subs"])} subs; top 3 channels hold {s["top3_share"]:.0%} of views; '
                     f'{s["small_channel_hits"]} hits (≥{fmt(HIT)}) from channels under {fmt(SMALL)} subs; {s["young_channel_hits"]} hits from channels under a year old.')
        pool=[vids[i] for i in s['outliers'] if i in vids] or sorted([v for v in data['videos'] if s['seed'] in v['seeds']],key=lambda v:-v['views'])
        for v in pool[:limit]:
            lines.append(f'- [{v["id"]}] "{v["title"]}" · {v["channel"]} ({fmt(v["channel_subs"])} subs, channel {v["channel_age_days"] or "?"} days old) · '
                         f'{fmt(v["views"])} views in {v["age_days"]} days · {v["duration"]//60} min'
                         +(f' · {v["outlier"]}× the channel median' if v['outlier'] else '')+(f' · {v["views_per_sub"]}× its subscribers' if v['views_per_sub'] else ''))
    return '\n'.join(lines)

# ---- topic research: competitor channels and what people search ------------------------------------------------------

def resolve_channel(text,status=say):
    """A channel id from what the creator pasted: UC… id, a /channel/ link, @handle or a youtube.com/@handle link (1 unit)."""
    text=str(text or '').strip()
    m=re.search(r'(UC[0-9A-Za-z_-]{22})',text)
    if m:return m[1]
    m=re.search(r'@([0-9A-Za-z._-]{3,60})',text)
    if not m:raise ValueError(f'"{text[:60]}" is not a YouTube channel: paste its @handle or its link.')
    items=get('channels',{'part':'id','forHandle':'@'+m[1]},status).get('items',[])
    if not items:raise ValueError(f'No YouTube channel @{m[1]}.')
    return items[0]['id']

def competitor_uploads(refs,months=3,status=say):
    """Recent uploads of the creator's competitor channels, each scored against that channel's usual (median) views.
    Returns (videos, channels, problems). About 3 units a channel."""
    now=datetime.now(timezone.utc);ids=[];problems=[]
    for ref in refs[:10]:
        try:ids.append(resolve_channel(ref,status))
        except ValueError as e:problems.append(str(e))
    ids=list(dict.fromkeys(ids))
    if not ids:return [],[],problems
    chans=list_channels(ids,status);videos=[];channels=[]
    for i,c in enumerate(chans):
        status('Reading competitor channels',.75+.15*i/max(1,len(chans)))
        uploads=c.get('contentDetails',{}).get('relatedPlaylists',{}).get('uploads');st=c.get('statistics',{})
        if not uploads:continue
        items=get('playlistItems',{'part':'contentDetails','playlistId':uploads,'maxResults':50},status).get('items',[])
        ups=list_videos([it['contentDetails']['videoId'] for it in items if it.get('contentDetails',{}).get('videoId')],status)
        longform=[num(v.get('statistics',{}),'viewCount') for v in ups if seconds(v.get('contentDetails',{}).get('duration'))>60]
        longform=[x for x in longform if x is not None];med=int(statistics.median(longform)) if longform else None
        subs=None if st.get('hiddenSubscriberCount') else num(st,'subscriberCount')
        channels.append({'id':c['id'],'title':c['snippet'].get('title',''),'subs':subs,'median_views':med,'videos':num(st,'videoCount'),
                         'url':f'https://www.youtube.com/channel/{c["id"]}','competitor':True})
        for v in ups:
            sn=v['snippet'];age=age_days(sn.get('publishedAt'),now) or 1
            if age>int(months)*30:continue
            views=num(v.get('statistics',{}),'viewCount') or 0
            videos.append({'id':v['id'],'title':sn.get('title',''),'channel_id':c['id'],'channel':sn.get('channelTitle',''),'published':sn.get('publishedAt'),
                           'age_days':age,'duration':seconds(v.get('contentDetails',{}).get('duration')),'views':views,
                           'likes':num(v.get('statistics',{}),'likeCount'),'comments':num(v.get('statistics',{}),'commentCount'),'views_per_day':round(views/age),
                           'views_per_sub':round(views/max(subs,100),2) if subs is not None else None,'outlier':round(views/med,1) if med else None,
                           'channel_subs':subs,'channel_age_days':age_days(c['snippet'].get('publishedAt'),now),'seeds':[],'competitor':True,
                           'thumb':(sn.get('thumbnails',{}).get('medium') or {}).get('url'),'tags':(sn.get('tags') or [])[:12],
                           'url':f'https://www.youtube.com/watch?v={v["id"]}'})
    return videos,channels,problems

SUGGEST='https://suggestqueries.google.com/complete/search'
def suggestions(seed,status=say):
    """What people type into YouTube search around a seed (Google's public autocomplete; free, no key; best effort:
    returns [] when it is unavailable). Cached for a day."""
    import httpx
    out=[]
    for q in [seed,f'how {seed}',f'why {seed}',f'what {seed}',f'{seed} for']:
        tag=hashlib.sha1(('suggest|'+q).encode()).hexdigest();hit=CACHE/f'{tag}.json';cached=read(hit)
        if cached and time.time()-cached.get('saved',0)<CACHE_SECONDS:got=cached['data']
        else:
            try:
                r=interruptible(lambda:httpx.get(SUGGEST,params={'client':'firefox','ds':'yt','q':q},timeout=10),status)
                got=r.json()[1] if r.status_code<400 else []
            except (httpx.HTTPError,ValueError,IndexError,TypeError):got=[]
            if got:write(hit,{'saved':time.time(),'data':got})
        out+=[g for g in got if isinstance(g,str) and g.lower()!=q.lower()]
    return list(dict.fromkeys(out))[:30]

def topic_brief(data,limit=15):
    """Competitor outliers and search phrases as plain text for Claude (the seed scan itself is in brief())."""
    fmt=lambda n:'hidden' if n is None else f'{n/1e6:.1f}M' if n>=1e6 else f'{n/1e3:.0f}K' if n>=1e3 else str(n)
    lines=[];comp=[v for v in data.get('videos',[]) if v.get('competitor')]
    if data.get('competitors'):
        lines.append('## Competitor channels: '+'; '.join(f'{c["title"]} ({fmt(c["subs"])} subs, usually {fmt(c["median_views"])} views)' for c in data['competitors']))
        for v in sorted(comp,key=lambda v:-(v['outlier'] or 0))[:limit]:
            lines.append(f'- [{v["id"]}] "{v["title"]}" · {v["channel"]} · {fmt(v["views"])} views in {v["age_days"]} days · {v["duration"]//60} min'
                         +(f' · {v["outlier"]}× its usual' if v['outlier'] else ''))
    for seed,phrases in (data.get('suggestions') or {}).items():
        if phrases:lines+=['',f'## What people type into YouTube search around "{seed}"',', '.join(phrases)]
    return '\n'.join(lines)

# ---- the creator's own uploads (OAuth) ------------------------------------------------------------------------------
# Needs an OAuth client of type "Desktop app" from Google Cloud (YouTube Data API v3 enabled), saved as youtube-oauth.json.
# Signing in opens Google's consent page; a one-time server on 127.0.0.1 catches the answer and youtube-token.json keeps the
# refresh token (both files stay out of git). Uploads from a project Google has not audited stay private until published
# by hand in YouTube Studio.

CLIENT=ROOT/'youtube-oauth.json'
TOKEN=ROOT/'youtube-token.json'
SCOPES='https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.readonly'
UPLOAD='https://www.googleapis.com/upload/youtube/v3/'
CHUNK=8*1024*1024

def client():
    data=read(CLIENT)
    if not data:raise ValueError('Save your Google OAuth client (Desktop app) as youtube-oauth.json in the studio folder first.')
    c=data.get('installed') or data.get('web') or {}
    if not c.get('client_id') or not c.get('client_secret'):raise ValueError('youtube-oauth.json has no client_id/client_secret: download the Desktop app client JSON again.')
    return c

def account():
    t=read(TOKEN) or {}
    return {'client':CLIENT.exists(),'connected':bool(t.get('refresh_token')),'channel':t.get('channel')}

def login(on_done=None):
    """Start Google sign-in: returns the consent URL; a one-time local server (any free port) finishes it in the background."""
    import base64,hashlib as hl,secrets,threading
    from http.server import BaseHTTPRequestHandler,HTTPServer
    from urllib.parse import urlencode,urlparse,parse_qs
    import httpx
    c=client();verifier=secrets.token_urlsafe(64);state=secrets.token_urlsafe(16)
    challenge=base64.urlsafe_b64encode(hl.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    result={}
    class Catch(BaseHTTPRequestHandler):
        def log_message(self,*a):pass
        def do_GET(self):
            q=parse_qs(urlparse(self.path).query)
            ok=q.get('state',[''])[0]==state and 'code' in q
            if ok:
                r=httpx.post('https://oauth2.googleapis.com/token',data={'code':q['code'][0],'client_id':c['client_id'],'client_secret':c['client_secret'],
                             'redirect_uri':redirect,'grant_type':'authorization_code','code_verifier':verifier},timeout=30)
                ok=r.status_code<400 and 'refresh_token' in r.json()
                if ok:
                    tok={**r.json(),'saved':time.time()};write(TOKEN,tok)
                    try:
                        me=api('GET','channels',{'part':'snippet','mine':'true'}).json().get('items') or [{}]
                        write(TOKEN,{**read(TOKEN),'channel':me[0].get('snippet',{}).get('title')})
                    except Exception:pass
                else:result['error']=r.text[:300]
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
            self.wfile.write(('<h2>YouTube is connected. You can close this tab.</h2>' if ok else '<h2>Could not connect YouTube. Close this tab and try again.</h2>').encode())
            result['done']=True
    server=HTTPServer(('127.0.0.1',0),Catch);redirect=f'http://127.0.0.1:{server.server_port}/'
    def serve():
        server.timeout=1;end=time.time()+600
        while not result.get('done') and time.time()<end:server.handle_request()
        server.server_close()
        if on_done:on_done(result)
    threading.Thread(target=serve,daemon=True).start()
    return 'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode({'client_id':c['client_id'],'redirect_uri':redirect,'response_type':'code','scope':SCOPES,
        'access_type':'offline','prompt':'consent','code_challenge':challenge,'code_challenge_method':'S256','state':state})

def access_token():
    import httpx
    t=read(TOKEN) or {}
    if not t.get('refresh_token'):raise ValueError('Connect your YouTube channel first.')
    if t.get('access_token') and time.time()<t.get('saved',0)+int(t.get('expires_in',0))-120:return t['access_token']
    c=client();r=httpx.post('https://oauth2.googleapis.com/token',data={'client_id':c['client_id'],'client_secret':c['client_secret'],
                            'refresh_token':t['refresh_token'],'grant_type':'refresh_token'},timeout=30)
    if r.status_code>=400:raise RuntimeError('Google refused the saved sign-in; connect YouTube again. ('+r.text[:200]+')')
    write(TOKEN,{**t,**r.json(),'saved':time.time()});return r.json()['access_token']

def api(method,path,params=None,base=API,**kw):
    import httpx
    r=httpx.request(method,base+path,params=params,headers={'Authorization':'Bearer '+access_token(),**kw.pop('headers',{})},timeout=kw.pop('timeout',60),**kw)
    if r.status_code>=400:
        try:err=r.json().get('error',{});msg=err.get('message','');reason=(err.get('errors') or [{}])[0].get('reason','')
        except ValueError:msg,reason=r.text[:300],''
        if reason in ('quotaExceeded','uploadLimitExceeded'):raise RuntimeError('YouTube says the upload limit for today is reached; try again tomorrow.')
        raise RuntimeError(f'YouTube refused ({r.status_code}{", "+reason if reason else ""}): {msg[:300]}')
    return r

def video_body(meta):
    """The video resource sent with an upload: title, description, tags, category, privacy, schedule and the AI label."""
    status={'privacyStatus':'private' if meta.get('publish_at') else meta.get('privacy','private'),'selfDeclaredMadeForKids':bool(meta.get('made_for_kids')),
            'containsSyntheticMedia':bool(meta.get('synthetic'))}
    if meta.get('publish_at'):status['publishAt']=meta['publish_at']
    tags=[];total=0
    for t in meta.get('tags') or []:  # YouTube allows 500 characters of tags in all
        if total+len(t)+2>480:break
        tags.append(t);total+=len(t)+2
    return {'snippet':{'title':meta['title'][:100],'description':meta.get('description','')[:5000],'tags':tags,'categoryId':str(meta.get('category','27')),
                       'defaultLanguage':'en','defaultAudioLanguage':'en'},'status':status}

def upload(file,meta,status=say):
    """Resumable upload of one video; returns its id. Each chunk is a place where Cancel takes effect."""
    import httpx
    file=Path(file);size=file.stat().st_size
    start=api('POST','videos',{'uploadType':'resumable','part':'snippet,status'},base=UPLOAD,json=video_body(meta),
              headers={'X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':str(size)})
    where=start.headers.get('Location')
    if not where:raise RuntimeError('YouTube did not start the upload.')
    sent=0
    with file.open('rb') as fh:
        while sent<size:
            chunk=fh.read(CHUNK);end=sent+len(chunk)-1
            status(f'Uploading to YouTube',sent/size)
            r=interruptible(lambda:httpx.put(where,content=chunk,headers={'Authorization':'Bearer '+access_token(),'Content-Range':f'bytes {sent}-{end}/{size}'},timeout=300),status)
            if r.status_code in (200,201):return r.json()['id']
            if r.status_code!=308:raise RuntimeError(f'The upload stopped ({r.status_code}): {r.text[:300]}')
            got=r.headers.get('Range');sent=int(got.split('-')[1])+1 if got else end+1;fh.seek(sent)
    raise RuntimeError('The upload finished without a video id.')

def set_thumbnail(video_id,jpg):
    """Custom thumbnails need a verified YouTube account (phone verification in YouTube Studio)."""
    api('POST','thumbnails/set',{'videoId':video_id,'uploadType':'media'},base=UPLOAD,content=Path(jpg).read_bytes(),headers={'Content-Type':'image/jpeg'})

def add_captions(video_id,srt,name='English'):
    import uuid as u
    b=u.uuid4().hex;meta=json.dumps({'snippet':{'videoId':video_id,'language':'en','name':name,'isDraft':False}})
    body=(f'--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{b}\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+Path(srt).read_bytes()+f'\r\n--{b}--'.encode()
    api('POST','captions',{'uploadType':'multipart','part':'snippet'},base=UPLOAD,content=body,headers={'Content-Type':f'multipart/related; boundary={b}'})
