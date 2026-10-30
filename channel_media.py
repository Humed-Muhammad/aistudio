"""Visuals for Channel videos. AI illustrations from fal.ai in the channel's art style (paid: every request is checked
against the video's AI budget and written to costs.json first): plain scenes from the image model, scenes with the
channel's mascot from an edit model given the mascot's reference image (so it looks the same in every shot), and AI clips
made by animating such an illustration (image to video), so clips match the stills. Stock footage from Pexels and Pixabay
(free; downloaded, trimmed and cropped to the frame, the raw download deleted; credits kept for the description) for
channels with a realistic look. Searches are cached for a day, as both APIs ask."""
from pathlib import Path
from fractions import Fraction
import hashlib,json,re,time
import av
from config import ROOT,setting,credential
from shorts import FPS,interruptible,say,upright

CACHE=ROOT/'runs'/'channel'/'stock-cache'
CACHE_SECONDS=24*3600
# fal.ai models and what they cost (USD): settings, so a newer model or price is one line in .env.
IMAGE_MODEL=lambda:setting('CHANNEL_FAL_IMAGE_MODEL','fal-ai/nano-banana')          # text to image
MASCOT_MODEL=lambda:setting('CHANNEL_FAL_MASCOT_MODEL','fal-ai/nano-banana/edit')   # image + reference images (the mascot)
VIDEO_MODEL=lambda:setting('CHANNEL_FAL_VIDEO_MODEL','fal-ai/kling-video/v2.1/standard/image-to-video')  # animates a still
IMAGE_PRICE=lambda:float(setting('CHANNEL_FAL_IMAGE_PRICE','0.04'))        # per image, with or without the mascot
VIDEO_PRICE=lambda:float(setting('CHANNEL_FAL_VIDEO_PRICE','0.05'))        # per second of clip
CLIP_SECONDS=5
# The art styles a channel can draw in: appended to every image prompt (the creator can write their own instead).
ART_STYLES={
    'flat':'flat vector illustration, clean simple shapes, soft pastel colour palette, flat colour fills without gradients, rounded friendly forms, '
           'minimal detail, clear focal point, generous empty space, no text, no letters, no logos, no watermark',
    'doodle':'hand-drawn marker doodle on warm off-white paper, confident black ink lines, a few flat colour accents, playful and simple, '
             'no text, no letters, no watermark',
    '3d':'cute stylised 3D cartoon render, soft rounded shapes, soft studio lighting, pastel colours, clean background, no text, no letters, no watermark',
    'comic':'bold comic-book illustration, thick ink outlines, flat vivid colours, halftone shading, dynamic composition, no speech bubbles, no text, no watermark',
    'realistic':'photorealistic, natural light, documentary photo, no text, no watermark'}

def read(path,default=None):
    try:return json.loads(Path(path).read_text())
    except (OSError,ValueError):return default

def write(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=1));tmp.replace(path)

def http(method,url,status=say,**kw):
    import httpx
    def call():
        for attempt in range(3):
            try:return httpx.request(method,url,timeout=kw.pop('timeout',60),follow_redirects=True,**kw)
            except httpx.TransportError:
                if attempt==2:raise RuntimeError(f"Can't reach {url.split('/')[2]}. Check your internet connection, then try again.") from None
                time.sleep(2*(attempt+1))
    return interruptible(call,status)

def cached(tag,fetch):
    hit=CACHE/(hashlib.sha1(tag.encode()).hexdigest()+'.json');got=read(hit)
    if got and time.time()-got.get('saved',0)<CACHE_SECONDS:return got['data']
    data=fetch();write(hit,{'saved':time.time(),'data':data});return data

# ---- stock footage -------------------------------------------------------------------------------------------------

def pexels(query,orientation='landscape',status=say):
    def fetch():
        r=http('GET','https://api.pexels.com/videos/search',status,params={'query':query,'orientation':orientation,'per_page':15,'size':'medium'},
               headers={'Authorization':credential('PEXELS_API_KEY')})
        if r.status_code>=400:raise RuntimeError(f'Pexels refused ({r.status_code}): {r.text[:200]}')
        return r.json()
    out=[]
    for v in cached(f'pexels|{query}|{orientation}',fetch).get('videos',[]):
        files=[f for f in v.get('video_files',[]) if f.get('file_type')=='video/mp4' and f.get('width') and f.get('link')]
        if files:out.append({'provider':'pexels','id':f'pexels-{v["id"]}','duration':v.get('duration') or 0,'width':v.get('width'),'height':v.get('height'),
                             'thumb':v.get('image'),'page':v.get('url'),'credit':f'{(v.get("user") or {}).get("name","Pexels")} on Pexels',
                             'files':[{'width':f['width'],'height':f.get('height'),'url':f['link']} for f in files]})
    return out

def pixabay(query,orientation='landscape',status=say):
    def fetch():
        r=http('GET','https://pixabay.com/api/videos/',status,params={'key':credential('PIXABAY_API_KEY'),'q':query[:100],'per_page':15,'safesearch':'true'})
        if r.status_code>=400:raise RuntimeError(f'Pixabay refused ({r.status_code}): {r.text[:200]}')
        return r.json()
    out=[]
    for v in cached(f'pixabay|{query}',fetch).get('hits',[]):
        files=[{'width':f.get('width'),'height':f.get('height'),'url':f.get('url')} for f in (v.get('videos') or {}).values() if f.get('url') and f.get('width')]
        if not files:continue
        w,h=max((f['width'],f['height'] or 0) for f in files)
        if (orientation=='portrait')!=(h>w):continue
        thumb=next((f.get('thumbnail') for k in ('medium','large','small') for f in [(v.get('videos') or {}).get(k) or {}] if f.get('thumbnail')),None)
        out.append({'provider':'pixabay','id':f'pixabay-{v["id"]}','duration':v.get('duration') or 0,'width':w,'height':h,'thumb':thumb,
                    'page':v.get('pageURL'),'credit':f'{v.get("user","Pixabay")} on Pixabay','files':files})
    return out

def search(query,orientation='landscape',status=say,have=None):
    """Candidates for one shot from every stock source with a key, Pexels first."""
    have=have or {};out=[];errors=[]
    for name,fn in (('pexels',pexels),('pixabay',pixabay)):
        if not have.get(name):continue
        try:out+=fn(query,orientation,status)
        except RuntimeError as e:errors.append(str(e))
    if not out and errors:raise RuntimeError('; '.join(errors))
    return out

def best_file(c,target_w):
    """The download closest above the frame width (no 4K when 1080p does), else the largest."""
    files=sorted(c['files'],key=lambda f:f['width'])
    return next((f for f in files if f['width']>=target_w),files[-1])

def pick(cands,need,used):
    """The first candidate long enough that no other shot in this video uses yet; else the longest unused."""
    fresh=[c for c in cands if c['id'] not in used]
    return next((c for c in fresh if c['duration']>=need),max(fresh,key=lambda c:c['duration'],default=None))

def fetch_clip(c,dst,need,size,status=say):
    """Download one stock video, then keep only the seconds the shot needs, cropped to fill the frame (H.264, 30 fps, muted)."""
    w,h=size;dst=Path(dst);dst.parent.mkdir(parents=True,exist_ok=True);raw=dst.with_suffix('.download')
    f=best_file(c,max(w,h) if c.get('height',0)<=c.get('width',1) else w)
    import httpx
    def download():
        with httpx.stream('GET',f['url'],timeout=120,follow_redirects=True) as r:
            if r.status_code>=400:raise RuntimeError(f'Stock download failed ({r.status_code}).')
            with raw.open('wb') as out:
                for chunk in r.iter_bytes(1<<16):out.write(chunk)
    try:
        interruptible(download,status)
        return trim(raw,dst,need,size)
    finally:raw.unlink(missing_ok=True)

def trim(src,dst,need,size,start=0.):
    """Re-encode the first `need` seconds (from start) cropped to fill size. Returns the seconds written (shorter sources stay short)."""
    from PIL import Image
    w,h=size;tmp=Path(dst).with_suffix('.part.mp4');count=0
    with av.open(str(src)) as inp, av.open(str(tmp),'w') as out:
        st=out.add_stream('libx264',rate=FPS);st.width,st.height,st.pix_fmt=w,h,'yuv420p';st.options={'crf':'20','preset':'veryfast'}
        frames=inp.decode(video=0);cur=None;total=round(need*FPS)
        for frame in frames:
            t=float(frame.time or 0)-start
            if t<0:continue
            while count<total and count/FPS<=t:
                if cur is None:cur=frame
                im=cover(upright(cur),w,h);vf=av.VideoFrame.from_image(im);vf.pts=count;vf.time_base=Fraction(1,FPS)
                for pk in st.encode(vf):out.mux(pk)
                count+=1
            cur=frame
            if count>=total:break
        for pk in st.encode():out.mux(pk)
    if not count:tmp.unlink(missing_ok=True);raise RuntimeError('The stock video could not be read.')
    tmp.replace(dst);return round(count/FPS,2)

def cover(im,w,h):
    """Scale and centre-crop an image to fill w×h."""
    from PIL import Image
    s=max(w/im.width,h/im.height);im=im.resize((max(w,round(im.width*s)),max(h,round(im.height*s))),Image.BILINEAR)
    x=(im.width-w)//2;y=(im.height-h)//2;return im.crop((x,y,x+w,y+h))

# ---- fal.ai (paid) -------------------------------------------------------------------------------------------------

def fal_run(model,body,status=say,label='fal.ai',timeout=900):
    """Submit to fal.ai's queue, wait for the result, return its output."""
    key=credential('FAL_KEY');head={'Authorization':f'Key {key}'}
    r=http('POST',f'https://queue.fal.run/{model}',status,json=body,headers=head)
    if r.status_code>=400:raise RuntimeError(f'fal.ai refused ({r.status_code}): {r.text[:300]}')
    sub=r.json();started=time.time()
    status_url=sub.get('status_url') or f'https://queue.fal.run/{model}/requests/{sub["request_id"]}/status'
    result_url=sub.get('response_url') or f'https://queue.fal.run/{model}/requests/{sub["request_id"]}'
    while True:
        s=http('GET',status_url,status,headers=head).json()
        if s.get('status')=='COMPLETED':break
        if s.get('status') in ('FAILED','ERROR'):raise RuntimeError(f'fal.ai could not make it: {str(s)[:300]}')
        if time.time()-started>timeout:raise RuntimeError('fal.ai took too long; nothing was saved (check fal.ai for the charge).')
        status(f'{label} · {s.get("status","waiting").replace("_"," ").lower()}',None);time.sleep(3)
    out=http('GET',result_url,status,headers=head)
    if out.status_code>=400:raise RuntimeError(f'fal.ai result failed ({out.status_code}): {out.text[:300]}')
    return out.json()

def save_url(url,dst,status=say):
    r=http('GET',url,status,timeout=300)
    if r.status_code>=400:raise RuntimeError(f'Could not download the result ({r.status_code}).')
    Path(dst).parent.mkdir(parents=True,exist_ok=True);Path(dst).write_bytes(r.content);return dst

def data_uri(path,longest=1024):
    """A reference image as a data URI (fal.ai accepts these in place of a hosted URL), shrunk to keep requests small."""
    import base64,io
    from PIL import Image
    im=Image.open(path).convert('RGB');im.thumbnail((longest,longest));buf=io.BytesIO();im.save(buf,'JPEG',quality=90)
    return 'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()

def ratio(size):
    w,h=size;return '16:9' if w>h else '9:16' if h>w else '1:1'

def image_body(model,prompt,size,n=1):
    """Request body for an image model: Flux takes a named size, most others an aspect ratio."""
    body={'prompt':prompt,'num_images':n}
    if 'flux' in model:body.update(image_size={'16:9':'landscape_16_9','9:16':'portrait_16_9','1:1':'square_hd'}[ratio(size)],enable_safety_checker=True)
    else:body.update(aspect_ratio=ratio(size),output_format='png')
    return body

def save_frame(url,dst,size,status=say):
    """Download a generated image and crop it to exactly fill the frame."""
    from PIL import Image
    raw=Path(dst).with_suffix('.download');save_url(url,raw,status)
    try:
        im=Image.open(raw).convert('RGB');cover(im,*size).save(dst)
    finally:raw.unlink(missing_ok=True)
    return dst

def ai_image(prompt,dst,size,status=say,refs=()):
    """One illustration. refs: reference images (the mascot) the edit model keeps the character from."""
    if refs:
        model=MASCOT_MODEL();body={**image_body(model,prompt,size),'image_urls':[data_uri(r) for r in refs]}
    else:model=IMAGE_MODEL();body=image_body(model,prompt,size)
    out=fal_run(model,body,status,'Drawing an illustration')
    url=((out.get('images') or [{}])[0]).get('url')
    if not url:raise RuntimeError('fal.ai returned no image'+(f': {out.get("description")}' if out.get('description') else '.'))
    return save_frame(url,dst,size,status)

def ai_clip(prompt,motion,dst,size,status=say,refs=()):
    """A short clip that animates an illustration: draw the still first (with the mascot when asked), then image to video."""
    still=Path(dst).with_suffix('.still.png');raw=Path(dst).with_suffix('.download')
    ai_image(prompt,still,size,status,refs)
    out=fal_run(VIDEO_MODEL(),{'prompt':motion or prompt,'image_url':data_uri(still,1280),'duration':str(CLIP_SECONDS),'aspect_ratio':ratio(size)},
                status,'Animating the illustration',timeout=1500)
    url=(out.get('video') or {}).get('url') or ((out.get('videos') or [{}])[0]).get('url')
    if not url:raise RuntimeError('fal.ai returned no video.')
    save_url(url,raw,status)
    try:return trim(raw,dst,CLIP_SECONDS+1,size)
    finally:raw.unlink(missing_ok=True);still.unlink(missing_ok=True)

def design_mascot(description,style,folder,n=4,status=say):
    """n mascot options to choose from: one character, full body, front view, on a plain background."""
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('option-*.png'):old.unlink()
    prompt=(f'Character design for a YouTube channel mascot: {description}. One character only, full body, front view, friendly expression, '
            f'centred on a plain light background, simple and memorable silhouette. Style: {style}')
    out=fal_run(IMAGE_MODEL(),image_body(IMAGE_MODEL(),prompt,(1024,1024),n),status,'Designing mascots')
    files=[]
    for i,img in enumerate(out.get('images') or []):
        if img.get('url'):files.append(save_frame(img['url'],folder/f'option-{i+1}.png',(1024,1024),status))
    if not files:raise RuntimeError('fal.ai returned no mascot designs.')
    return files

def cost_of(kind):return IMAGE_PRICE() if kind=='image' else IMAGE_PRICE()+VIDEO_PRICE()*CLIP_SECONDS if kind=='ai_clip' else 0.

def spent(folder):return round(sum(x.get('usd',0) for x in read(Path(folder)/'costs.json',[])),3)

def charge(folder,kind,usd,what):
    write(Path(folder)/'costs.json',read(Path(folder)/'costs.json',[])+[{'kind':kind,'usd':round(usd,4),'what':what[:200],'time':time.time(),
                                                                          'model':VIDEO_MODEL() if kind=='ai_clip' else IMAGE_MODEL()}])
