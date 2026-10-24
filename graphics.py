"""Motion graphics: promos, explainers and ads written as code (HTML + GSAP) and rendered to MP4 on this Mac with HyperFrames.
Images you upload are animated in code (Ken Burns, reveals, parallax, float, tilt, shine, tiles, slideshow); words, prices,
colors and image choices live in one content block, so a change is one line and everything else stays identical.

  python graphics.py new "Fade House promo" [--size portrait|square|landscape] [--image a.jpg ...] [--music bed.mp3]
  python graphics.py draft JOB "a 15 s promo for …"    Claude drafts the 4-part brief from your words (edit it after)
  python graphics.py brief JOB --file brief.json       or write the 4-part brief yourself: who/where/how long, look, scenes, rules
  python graphics.py build JOB [--model sonnet]        Claude Code writes the animation, reviews it and renders a draft
  python graphics.py change JOB "make the price bigger" Claude Code makes one targeted change (minutes, not a rebuild)
  python graphics.py undo JOB                          go back to the version before Claude's last build or change
  python graphics.py prompt JOB                        print the brief as a prompt for Claude Code
  python graphics.py content JOB [--set price='$30']   show or change the content block
  python graphics.py check JOB                         lint the composition
  python graphics.py snapshot JOB [--at 1,4.5]         still frames for review (PNG)
  python graphics.py render JOB [--final]              draft (fast) or final MP4
  python graphics.py preview JOB                       open HyperFrames Studio to scrub through it
"""
from pathlib import Path
import argparse,html,json,os,re,shutil,subprocess,sys,time,uuid
from PIL import Image,ImageOps
from shorts import Cancelled,finished,say
from config import ROOT,setting
RUNS=ROOT/'runs'/'graphics';KIT=ROOT/'graphics-kit';NODE=KIT/'node_modules'
HF=NODE/'.bin'/'hyperframes';FFMPEG=NODE/'ffmpeg-static'/'ffmpeg';FFPROBE=NODE/'@ffprobe-installer'/'darwin-arm64'/'ffprobe'
SIZES={'portrait':(1080,1920),'square':(1080,1080),'landscape':(1920,1080)}
IMAGES=['.png','.jpg','.jpeg','.webp','.gif','.svg'];AUDIO=['.mp3','.wav','.m4a','.aac','.ogg']
FONTS={'inter':['inter-latin-400-normal','inter-latin-700-normal','inter-latin-800-normal'],'anton':['anton-latin-400-normal'],
       'noto-sans-ethiopic':[f'noto-sans-ethiopic-ethiopic-{w}-normal' for w in (400,700,800)]}
# Keys that would send frames or projects to a cloud service from inside HyperFrames (Gemini describe, HeyGen cloud).
CLOUD_KEYS=['GEMINI_API_KEY','GOOGLE_API_KEY','OPENROUTER_API_KEY','HEYGEN_API_KEY']
BRIEF=['who','look','scenes','rules'];EXPECTED={'nested_structure_needs_subcomposition'}
VARIABLES=re.compile(r"data-composition-variables='(.*?)'",re.S)

def read(folder,name,default=None):
    try:return json.loads((Path(folder)/name).read_text())
    except (OSError,ValueError):return default

def write(folder,name,data):
    tmp=Path(folder)/(name+'.tmp');tmp.write_text(json.dumps(data,indent=1,ensure_ascii=False));tmp.replace(Path(folder)/name)

def need_kit():
    if not HF.exists():raise ValueError('Install the motion graphics toolchain once: make graphics')

def env():
    """Local FFmpeg/FFprobe, no telemetry, no cloud vision keys."""
    e={k:v for k,v in os.environ.items() if k not in CLOUD_KEYS}
    e.update(HYPERFRAMES_FFMPEG_PATH=str(FFMPEG),HYPERFRAMES_FFPROBE_PATH=str(FFPROBE),HYPERFRAMES_NO_TELEMETRY='1',
             DO_NOT_TRACK='1',HYPERFRAMES_SKIP_SKILLS='1',NO_COLOR='1',FORCE_COLOR='0')
    return e

def hyperframes(args,status=say,message=None,timeout=None):
    """Run the local HyperFrames CLI. With a message, forward its 'NN%' progress as status updates; Cancel stops it."""
    need_kit()
    proc=subprocess.Popen([str(HF),*map(str,args)],env=env(),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    ev=getattr(status,'cancelled',None);tail=[];started=time.time()  # full output: lint --json is parsed from it
    if ev is not None:
        import threading,signal
        def watch():
            while proc.poll() is None:
                if ev.wait(.25) or (timeout and time.time()-started>timeout):
                    try:os.killpg(proc.pid,signal.SIGTERM)
                    except ProcessLookupError:pass
                    return
        threading.Thread(target=watch,daemon=True).start()
    for line in proc.stdout:
        line=re.sub(r'\x1b\[[0-9;?]*[A-Za-z]','',line).strip()
        if not line:continue
        tail.append(line)
        if message and line.startswith('@hf-progress '):  # {"code":"encode","done":110,"total":360,"pct":80}
            try:status(message,min(1.,json.loads(line[13:])['pct']/100))
            except (ValueError,KeyError,TypeError):pass
    code=finished(proc,status)
    return code,'\n'.join(tail)

# ---- project ---------------------------------------------------------------------------------------------------

def placeholder(path,n,accent):
    """Stand-in artwork so a project renders before any image is uploaded."""
    hues=[('#1d2b64','#f8cdda'),('#0f2027','#2c5364'),('#42275a','#734b6d')][n%3]
    path.write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hues[0]}"/><stop offset="1" stop-color="{hues[1]}"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#g)"/><circle cx="{300+220*n}" cy="{420+160*n}" r="260" fill="{accent}" opacity=".35"/>
<text x="540" y="700" font-family="Helvetica,Arial,sans-serif" font-size="64" font-weight="700" fill="#fff" opacity=".7" text-anchor="middle">Image {n+1}</text></svg>''')

def create(title,size='portrait',images=(),music=None):
    """New project folder: the starter composition, the motion kit, local fonts and placeholder images."""
    need_kit()
    if size not in SIZES:raise ValueError('Size must be one of: '+', '.join(SIZES))
    folder=RUNS/uuid.uuid4().hex;(folder/'assets').mkdir(parents=True);(folder/'renders').mkdir()
    kit=folder/'kit';(kit/'fonts').mkdir(parents=True)
    for name in ['motion-kit.js','fonts.css']:shutil.copyfile(KIT/'kit'/name,kit/name)
    shutil.copyfile(NODE/'gsap'/'dist'/'gsap.min.js',kit/'gsap.min.js')
    for pkg,files in FONTS.items():
        for f in files:shutil.copyfile(NODE/'@fontsource'/pkg/'files'/(f+'.woff2'),kit/'fonts'/(f+'.woff2'))
    w,h=SIZES[size];page=(KIT/'template'/'index.html').read_text()
    page=page.replace('data-resolution="portrait"',f'data-resolution="{size}"').replace('width=1080, height=1920',f'width={w}, height={h}')
    page=page.replace('width: 1080px; height: 1920px;',f'width: {w}px; height: {h}px;').replace('data-width="1080" data-height="1920"',f'data-width="{w}" data-height="{h}"')
    (folder/'index.html').write_text(page)
    for n in range(3):placeholder(folder/'assets'/f'placeholder-{n+1}.svg',n,'#FFD60A')
    (folder/'hyperframes.json').write_text(json.dumps({'paths':{'blocks':'compositions','components':'compositions/components','assets':'assets'},'media':{'autoProxy':True}},indent=2))
    (folder/'meta.json').write_text(json.dumps({'id':folder.name,'name':title}))
    # npm run check / render inside the project use the pinned local CLI (no npx download).
    cli=os.path.relpath(HF,folder)
    (folder/'package.json').write_text(json.dumps({'name':'graphics-'+folder.name[:8],'private':True,'scripts':{s:f'{cli} {s}' for s in ['check','lint','render','preview','snapshot']}},indent=2))
    local=folder/'.hyperframes'/'bin';local.mkdir(parents=True)
    for b in (FFMPEG,FFPROBE):(local/b.name).symlink_to(b)
    write(folder,'job.json',{'title':(title.strip() or 'Untitled motion graphic')[:80],'size':size,'created':time.time()})
    for src in images:add_image(folder,src)
    if music:add_music(folder,music)
    return folder

def slug(name):return re.sub(r'[^a-z0-9]+','-',Path(name).stem.lower()).strip('-')[:40] or 'image'

def add_image(folder,src,name=None):
    """Copy an image into assets/ (EXIF-rotated, at most 2400 px; transparency kept as PNG) and fill the next empty image slot."""
    folder=Path(folder);name=name or Path(src).name;ext=Path(name).suffix.lower()
    if ext not in IMAGES:raise ValueError('Use a PNG, JPG, WebP, GIF or SVG image.')
    stem=slug(name);n=1
    while any((folder/'assets'/f'{stem}{"" if n==1 else f"-{n}"}{e}').exists() for e in IMAGES):n+=1
    stem=stem if n==1 else f'{stem}-{n}'
    alpha=ext in ('.svg','.gif')
    if alpha:dst=folder/'assets'/(stem+ext);shutil.copyfile(src,dst)
    else:
        try:im=ImageOps.exif_transpose(Image.open(src))
        except Exception:raise ValueError(f'{name} is not an image this tool can read.') from None
        im.thumbnail((2400,2400));alpha=im.mode in ('RGBA','LA','P') and im.convert('RGBA').getextrema()[3][0]<255
        dst=folder/'assets'/(stem+('.png' if alpha else '.jpg'))
        im.save(dst) if alpha else im.convert('RGB').save(dst,quality=90)
    rel=f'assets/{dst.name}';values=content(folder);ids={v['id'] for v in values}
    for v in values:  # the first image slot still showing a placeholder gets this image
        if re.fullmatch(r'image\d+',v['id']) and str(v['default']).startswith('assets/placeholder-'):
            change={v['id']:rel}
            # A transparent product shot floats as a cut-out instead of being cropped into a card.
            if v['id']=='image2' and 'productFit' in ids:change['productFit']='cutout' if alpha else 'photo'
            set_content(folder,change);break
    return rel

def images(folder):return sorted(f'assets/{p.name}' for p in (Path(folder)/'assets').iterdir() if p.suffix.lower() in IMAGES and not p.name.startswith('placeholder-'))

def add_music(folder,src,name=None,volume=.5):
    """Background music or a voice-over: one <audio> clip across the whole video, faded in and out."""
    folder=Path(folder);ext=Path(name or src).suffix.lower()
    if ext not in AUDIO:raise ValueError('Use an MP3, WAV, M4A, AAC or OGG audio file.')
    for old in (folder/'assets').glob('music.*'):old.unlink()
    shutil.copyfile(src,folder/'assets'/('music'+ext))
    page=(folder/'index.html').read_text();page=re.sub(r'\s*<audio id="music"[^>]*></audio>','',page);d=duration(folder)
    tag=f'<audio id="music" src="assets/music{ext}" data-start="0" data-duration="{d:g}" data-track-index="9" data-volume="{volume:g}" data-fade-in="0.3" data-fade-out="1"></audio>'
    if '<!-- music -->' in page:page=page.replace('<!-- music -->','<!-- music -->\n      '+tag,1)
    else:page=re.sub(r'(<div[^>]*data-composition-id="[^"]+"[^>]*>)',lambda m:m.group(1)+'\n      '+tag,page,count=1)
    (folder/'index.html').write_text(page);return f'assets/music{ext}'

def remove_music(folder):
    folder=Path(folder);page=(folder/'index.html').read_text()
    (folder/'index.html').write_text(re.sub(r'\s*<audio id="music"[^>]*></audio>','',page))
    for old in (folder/'assets').glob('music.*'):old.unlink()

def music(folder):return next((f'assets/{p.name}' for p in (Path(folder)/'assets').glob('music.*')),None)

def duration(folder):
    m=re.search(r'data-composition-id="[^"]+"[^>]*?data-duration="([\d.]+)"',(Path(folder)/'index.html').read_text())
    return float(m.group(1)) if m else 0.

# ---- content block -------------------------------------------------------------------------------------------

def content(folder):
    """The composition's declared variables: [{id,type,label,default}, ...] (default = the value used in the video)."""
    m=VARIABLES.search((Path(folder)/'index.html').read_text())
    if not m:return []
    try:return json.loads(html.unescape(m.group(1)))
    except ValueError as e:raise ValueError(f'The content block in index.html is not valid JSON: {e}') from None

def set_content(folder,values):
    """Change values in the content block in place. Only declared ids, with their declared type."""
    folder=Path(folder);decl=content(folder);known={v['id']:v for v in decl}
    for k,val in values.items():
        if k not in known:raise ValueError(f'"{k}" is not in the content block. Known: '+', '.join(known))
        t=known[k]['type']
        if t=='color' and not re.fullmatch(r'#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?',str(val)):raise ValueError(f'{known[k]["label"]}: use a hex color such as #FFD60A.')
        if t=='number':
            try:val=float(val)
            except ValueError:raise ValueError(f'{known[k]["label"]}: use a number.') from None
        if t=='boolean':val=val in (True,'true','1','yes','on')
        if t=='enum' and val not in [o['value'] for o in known[k].get('options',[])]:raise ValueError(f'{known[k]["label"]}: choose one of the listed options.')
        if t=='string':val=str(val)[:400]
        known[k]['default']=val
    block=json.dumps(decl,ensure_ascii=False,indent=None).replace('}, {','},\n  {').replace('[{','[\n  {').replace('}]','}\n]')
    block=block.replace('&','&amp;').replace("'",'&#39;')
    page=(folder/'index.html').read_text()
    page=VARIABLES.sub(lambda _:f"data-composition-variables='{block}'",page,count=1)
    (folder/'index.html').write_text(page);return decl

# ---- brief (the 4-part prompt from the video) ----------------------------------------------------------------

def save_brief(folder,brief,request=None,drafted=False):
    """who: audience, platform, length · look: colors (hex), fonts, mood · scenes: scene by scene with seconds · rules: what it must never do.
    The creator's own words (request) are kept with it; drafted marks a brief Claude wrote and nobody has edited yet."""
    missing=[k for k in BRIEF if not str(brief.get(k,'')).strip()]
    if missing:raise ValueError('The brief needs all four parts. Missing: '+', '.join(missing))
    old=read(folder,'brief.json') or {};request=(old.get('request','') if request is None else request).strip()
    write(folder,'brief.json',{**{k:str(brief[k]).strip() for k in BRIEF},'request':request[:4000],'drafted':drafted,'saved':time.time()})
    return read(folder,'brief.json')

def shown(folder):
    """Project path as Claude Code should see it: relative to the repo when inside it."""
    folder=Path(folder);return folder.relative_to(ROOT) if folder.is_relative_to(ROOT) else folder

def prompt(folder):
    """The brief as a ready prompt for Claude Code (paste it in this repo)."""
    folder=Path(folder);b=read(folder,'brief.json');job=read(folder,'job.json')
    if not b:raise ValueError('Write the 4-part brief first.')
    rel=shown(folder);imgs=images(folder);w,h=SIZES[job['size']]
    return '\n'.join([f'Make the motion graphic in {rel} ({job["title"]}, {w}x{h}). Follow AGENTS.md "Motion graphics" and docs/motion-graphics.md.','',
        '1. Who it is for, where it goes, how long:',b['who'],'','2. The look:',b['look'],'','3. Scene by scene:',b['scenes'],'','4. Rules:',b['rules'],'',
        'Images to animate: '+(', '.join(imgs) if imgs else 'none uploaded (use shapes, type and the placeholders only)'),
        'Music: '+(music(folder) or 'none'),'',
        'Current content values (the creator may have edited these; use them as written, keep the same ids where they fit, add new ones as needed):',
        *[f'  {v["id"]} ({v.get("label",v["id"])}): {v["default"]}' for v in content(folder)],'',
        'Keep every word, price, color and image path in the content block (data-composition-variables). Then run check and snapshot, look at the frames, fix problems, and render a draft.'])

# ---- Claude Code: draft the brief, build the animation ---------------------------------------------------------
# Runs the Claude Code CLI headless on the creator's own Claude plan (the API key is removed from its environment, so
# nothing is billed to the API). Tools are limited with --permission-mode dontAsk: anything not allowed below is denied.
MODELS={'sonnet':'Sonnet · balanced','opus':'Opus · best quality, most usage','haiku':'Haiku · lightest on usage'}
KIT_NOTES='''Available motion (window.MotionKit, all seek-safe): kenBurns (slow push-in/pan), reveal (wipe-left/right/up/down,
center, circle, diamond, blinds), parallax layers, float (product hover), tilt (3D swing), shine (light sweep, follows a
cut-out's shape), tiles (image assembles from tiles), slideshow (push/zoom/wipe/crossfade), zoomThrough, focusPull, popIn,
exit, words (word-by-word rise, Ethiopic-safe), countUp (prices/stats), typeOn. Plus plain GSAP and HyperFrames blocks.
It can draw text, shapes, charts and the uploaded images; it cannot generate photos, footage or people.'''

def claude_bin():
    """The Claude Code CLI: CLAUDE_BIN, then PATH, then the copy bundled with the VS Code / Cursor extension."""
    if setting('CLAUDE_BIN'):return setting('CLAUDE_BIN')
    if shutil.which('claude'):return shutil.which('claude')
    found=[p for ext in ['.vscode','.cursor','.vscode-insiders'] for p in (Path.home()/ext/'extensions').glob('anthropic.claude-code-*/resources/native-binary/claude')]
    return str(max(found,key=lambda p:p.stat().st_mtime)) if found else None

def claude_env():
    e={k:v for k,v in os.environ.items() if k not in ('ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDECODE')}
    e.update(HYPERFRAMES_NO_TELEMETRY='1',DO_NOT_TRACK='1');return e

def activity(tool,args,rel):
    """Plain-language progress line for one Claude Code tool call."""
    target=str(args.get('file_path') or args.get('path') or args.get('command') or args.get('skill') or args.get('pattern') or '')
    name=Path(target.split()[0] if tool=='Bash' else target).name
    if tool in ('Write','Edit','MultiEdit'):return f'Claude is writing {name}'
    if tool=='Read':return 'Claude is looking at the review frames' if '/review/' in target else 'Claude is looking at '+name if name.endswith(tuple(IMAGES)) else 'Claude is reading '+name
    if tool=='Skill':return 'Claude is reading the HyperFrames guide'
    if tool=='Bash':
        for word,text in [(' check ','Checking the composition'),(' snapshot ','Capturing frames to review'),(' render ','Rendering a draft'),(' content ','Updating the content block')]:
            if word in f' {target} ':return text
    return 'Claude is working'

def run_claude(args,cwd,status,message,log=None,timeout=None):
    """Run claude -p with stream-json output; forward tool calls as status lines; return the final result event."""
    exe=claude_bin()
    if not exe:raise ValueError('Claude Code is not installed: install the Claude Code VS Code extension or CLI, or set CLAUDE_BIN in .env.')
    import threading,signal
    proc=subprocess.Popen([exe,'-p',*args,'--output-format','stream-json','--verbose','--no-session-persistence'],cwd=cwd,env=claude_env(),
                          stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    ev=getattr(status,'cancelled',None);started=time.time();result=None;tail=[];steps=0
    def watch():
        while proc.poll() is None:
            if (ev is not None and ev.wait(.5)) or (timeout and time.time()-started>timeout):
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                return
            if ev is None:time.sleep(.5)
    threading.Thread(target=watch,daemon=True).start()
    out=open(log,'a') if log else None
    try:
        status(message,None)
        for line in proc.stdout:
            if out:out.write(line)
            try:event=json.loads(line)
            except ValueError:tail=(tail+[line.strip()])[-8:];continue
            if event.get('type')=='assistant':
                for part in event.get('message',{}).get('content',[]):
                    if part.get('type')=='tool_use':steps+=1;status(f"{activity(part.get('name'),part.get('input') or {},cwd)} · step {steps}",None)
            elif event.get('type')=='result':result=event
    finally:
        if out:out.close()
    code=finished(proc,status)
    if timeout and time.time()-started>timeout:raise RuntimeError(f'Claude Code took longer than {timeout//60} minutes and was stopped.')
    if result is None:
        text=' '.join(tail)
        if re.search(r'log ?in|auth|credential|401',text,re.I):raise RuntimeError('Claude Code is not signed in. Open the Claude Code panel in VS Code (or run claude in a terminal) and sign in, then try again.')
        raise RuntimeError(f'Claude Code stopped without a result (exit {code}): '+text[-800:])
    if result.get('is_error'):raise RuntimeError('Claude Code reported a problem: '+str(result.get('result') or result.get('subtype'))[-1200:])
    return result

def draft_brief(folder,request,status=say,model=None):
    """Claude turns a short request into the 4-part brief (looking at the uploaded images). The creator edits it after."""
    folder=Path(folder);request=request.strip();job=read(folder,'job.json')
    if len(request)<8:raise ValueError('Describe what you want in a sentence or two first.')
    w,h=SIZES[job['size']];rel=shown(folder);imgs=images(folder)
    fields=writable(folder)
    schema={'type':'object','properties':{**{k:{'type':'string'} for k in BRIEF},
            'content':{'type':'object','properties':{v['id']:{'type':'string','description':v.get('label',v['id'])} for v in fields},
                       'required':[v['id'] for v in fields],'additionalProperties':False}},'required':BRIEF+['content'],'additionalProperties':False}
    ask='\n'.join([f'Write the 4-part brief for a motion graphic ({w}x{h}, "{job["title"]}") from this request by the creator:','',request,'',
        'Images they uploaded (look at each with Read before planning; say in the scenes which image is used where): '+(', '.join(f'{rel}/{i}' for i in imgs) or 'none'),
        'Music: '+('yes, '+music(folder) if music(folder) else 'none'),'',KIT_NOTES,'',
        'The four parts, each plain text the creator can edit:',
        '- who: who it is for, where it will be posted, and the length in seconds (choose 10-25 s if not given).',
        '- look: colors as hex codes, fonts (display + body), mood. Take colors from the request or the images; do not invent a brand.',
        '- scenes: one line per scene with exact seconds ("0-3 s: ..."), naming the image and the motion for each; end with a call to action.',
        '- rules: 4-6 rules it must never break (words on screen per scene, where prices go, no emoji, every element enters and leaves with motion).',
        'Write the on-screen words in the language of the request (Ethiopic script for Amharic). Never invent prices, phone numbers, addresses or claims:',
        'when one is needed but not given, write a placeholder in square brackets such as [price] so the creator fills it in.','',
        '- content: the on-screen words and colors for the video, one value per field below, matching the brief (same language, same colors as hex #RRGGBB).',
        '  Replace every example; keep each short enough to fit on screen. Use a [placeholder] for anything not given.',
        *[f'  {v["id"]} ({v.get("label",v["id"])}, {v["type"]}), example: {v["default"]}' for v in fields]])
    allow=f'Read({rel}/**)'
    result=run_claude([ask,'--model',model or setting('GRAPHICS_BRIEF_MODEL','sonnet'),'--json-schema',json.dumps(schema),
                       '--tools','Read','--allowedTools',allow,'--permission-mode','dontAsk'],ROOT,status,'Claude is drafting the brief',timeout=600)
    brief=result.get('structured_output')
    if not brief:
        try:text=result.get('result','');brief=json.loads(text[text.index('{'):text.rindex('}')+1])
        except ValueError:raise RuntimeError('Claude did not return a brief. Try again or write it yourself.') from None
    apply_content(folder,brief.get('content') or {})
    return save_brief(folder,brief,request,drafted=True)

def writable(folder):
    """Content fields Claude may fill when drafting: words and colors (image slots and switches stay the creator's)."""
    return [v for v in content(folder) if v['type'] in ('string','color') and not re.fullmatch(r'image\d+',v['id'])]

def apply_content(folder,values):
    """Put drafted values in the content block, skipping any that are not valid for their field."""
    fields={v['id']:v for v in writable(folder)};ok={}
    for k,val in values.items():
        if k not in fields or not str(val).strip():continue
        if fields[k]['type']=='color' and not re.fullmatch(r'#[0-9a-fA-F]{6}',str(val).strip()):continue
        ok[k]=str(val).strip()
    if ok:set_content(folder,ok)
    return ok

def content_gaps(folder):
    """Content fields still holding a [placeholder]."""
    return [v['id'] for v in content(folder) if isinstance(v['default'],str) and re.search(r'\[[^\]\n]{2,40}\]',v['default'])]

def placeholders(brief):
    """[price]-style gaps the drafted brief left for the creator to fill."""
    return sorted(set(re.findall(r'\[[^\]\n]{2,40}\]',' '.join(brief.get(k,'') for k in BRIEF))))

def build(folder,model='sonnet',status=say):
    """Claude Code writes index.html from the brief, checks and reviews it, and renders a draft."""
    folder=Path(folder);brief=read(folder,'brief.json')
    if not brief:raise ValueError('Save the 4-part brief first.')
    if placeholders(brief):raise ValueError('Fill in the brief first: '+', '.join(placeholders(brief)))
    if content_gaps(folder):raise ValueError('Fill in these content fields first: '+', '.join(content_gaps(folder)))
    return claude_edit(folder,'build',[prompt(folder)],
        ['After writing: run check and fix every error; snapshot 6-10 moments (every scene and transition), Read the PNGs and fix what looks wrong; repeat until clean.',
         'Then render the draft. Finish with a short summary for the creator: the scenes, which content fields they can edit, and anything you could not verify.'],
        model,status,float(setting('GRAPHICS_BUILD_MINUTES','30')))

def revise(folder,change,model='sonnet',status=say):
    """A targeted change to the existing animation ("make the price bigger"): Claude edits only that part and reviews only the moments it touched."""
    folder=Path(folder);change=change.strip()
    if len(change)<4:raise ValueError('Describe the change in a few words first.')
    b=read(folder,'brief.json') or {};job=read(folder,'job.json');w,h=SIZES[job['size']]
    task=[f'Change the existing motion graphic {shown(folder)}/index.html ({job["title"]}, {w}x{h}). The creator asks:','',change,'',
          'Make only this change. Keep everything else exactly as it is: other scenes, timing, motion, layout, and the content block ids and values',
          '(change a content value only if the request is about it). Read index.html first; prefer small Edit calls over rewriting the file.',
          *(['','For context, the brief: '+' | '.join(b[k] for k in BRIEF if b.get(k))] if b else [])]
    return claude_edit(folder,'change',task,
        ['After editing: run check and fix any error; snapshot only the 2-4 moments your change affects, Read those PNGs and fix what looks wrong.',
         'Then render the draft. Reply in two or three sentences: what you changed, and anything you could not do.'],
        model,status,float(setting('GRAPHICS_CHANGE_MINUTES','15')),change)

def claude_edit(folder,kind,task,finish,model,status,minutes,request=None):
    """Run Claude Code on one project with fixed permissions; back up index.html first and record the run so it can be undone."""
    if model not in MODELS:raise ValueError('Model must be one of: '+', '.join(MODELS))
    # Absolute paths everywhere: relative permission rules stop matching once Claude runs `cd` in its shell.
    job=folder.resolve();hist=folder/'history';hist.mkdir(exist_ok=True);stamp=time.strftime('%Y%m%d-%H%M%S')
    backup=f'history/index-{stamp}.html';n=1
    while (folder/backup).exists():n+=1;backup=f'history/index-{stamp}-{n}.html'  # two runs in one second keep both backups
    before=(folder/'index.html').read_text();shutil.copyfile(folder/'index.html',folder/backup)
    cmd=lambda c:f'{sys.executable} {ROOT/"graphics.py"} {c} {job}'
    ask='\n'.join([*task,'',
        f'The project folder is {job}. Write and edit files only there (you can read AGENTS.md, docs/motion-graphics.md, graphics-kit/kit, graphics-kit/template and the HyperFrames skills in .claude/skills).',
        'Use the Write and Edit tools for files, with absolute paths. Run commands exactly as written here (no cd, no redirection):',
        f'  {cmd("check")}',f'  {cmd("snapshot")} --at 0.5,2,4 (your own seconds; the PNGs land in {job}/review/)',f'  {cmd("content")} --set id=value',f'  {cmd("render")}   (draft only)',
        'Do not use npx, npm or any other command; do not publish or render the final.',*finish])
    root='/'+str(ROOT)  # '//abs/path' = absolute path in a permission rule
    allowed=[f'Read(/{job}/**)',f'Read({root}/AGENTS.md)',f'Read({root}/docs/**)',f'Read({root}/graphics-kit/kit/**)',f'Read({root}/graphics-kit/template/**)',
             f'Read({root}/.claude/skills/**)',f'Write(/{job}/**)',f'Edit(/{job}/**)','Glob','Skill',
             f'Bash({cmd("check")})',f'Bash({cmd("snapshot")}:*)',f'Bash({cmd("content")}:*)',f'Bash({cmd("render")})']
    denied=[f'Read({root}/.env*)','Bash(cat:*)','Bash(head:*)','Bash(tail:*)','Bash(less:*)','Bash(grep:*)']  # keys stay out of the transcript
    started=time.time()
    with open(folder/'build.log','a') as log:log.write(json.dumps({'type':'aistudio','kind':kind,'request':request,'started':started})+'\n')
    result=run_claude([ask,'--model',model,'--tools','Read,Write,Edit,Glob,Bash,Skill','--allowedTools',*allowed,'--disallowedTools',*denied,'--permission-mode','dontAsk'],
                      ROOT,status,'Claude Code is starting',log=folder/'build.log',timeout=int(minutes*60))
    summary=(result.get('result') or '').strip()
    if (folder/'index.html').read_text()==before:
        (folder/backup).unlink(missing_ok=True)
        raise RuntimeError('Claude Code finished without changing the animation. Its note: '+summary[-1500:])
    info={'kind':kind,'request':request,'model':model,'started':started,'finished':time.time(),'turns':result.get('num_turns'),'summary':summary,'backup':backup}
    write(folder,'claude-runs.json',claude_runs(folder)+[info]);(folder/'build.json').unlink(missing_ok=True)
    draft=folder/'renders'/'draft.mp4'
    if not draft.exists() or draft.stat().st_mtime<started:render(folder,False,status)  # Claude stopped before rendering
    return info

def claude_runs(folder):
    """Claude's builds and changes, oldest first; each can be undone in reverse order (build.json: projects built before changes existed)."""
    runs=read(folder,'claude-runs.json')
    if runs is None:old=read(folder,'build.json');runs=[{'kind':'build',**old}] if old else []
    return runs

def undo_build(folder):
    """Put back the index.html from before Claude's last build or change (the undone version stays in history/)."""
    folder=Path(folder);done=claude_runs(folder)
    if not done or not (folder/done[-1]['backup']).exists():raise ValueError('There is no earlier version to go back to.')
    shutil.copyfile(folder/'index.html',folder/'history'/f'index-undone-{time.strftime("%Y%m%d-%H%M%S")}.html')
    shutil.copyfile(folder/done[-1]['backup'],folder/'index.html');write(folder,'claude-runs.json',done[:-1]);(folder/'build.json').unlink(missing_ok=True)
    return done[-1]

# ---- check, review, render -----------------------------------------------------------------------------------

def check(folder,status=say):
    """Static lint (fast, no browser). Returns {ok, errors, warnings, findings}."""
    code,out=hyperframes(['lint',folder,'--json'],status)
    try:data=json.loads(out[out.index('{'):])
    except ValueError:return {'ok':code==0,'errors':0 if code==0 else 1,'warnings':0,'findings':[out[-1500:]]}
    # One file with timed scenes is intentional (it keeps the content block in one place); Studio would prefer sub-compositions.
    findings=[f for f in data.get('findings') or data.get('issues') or [] if f.get('code') not in EXPECTED]
    level=lambda f:(f.get('severity') or f.get('level') or '').lower()
    errors=sum(level(f)=='error' for f in findings);warnings=sum(level(f)=='warning' for f in findings)
    return {'ok':code==0 and not errors,'errors':errors,'warnings':warnings,
            'findings':[f"{level(f) or 'note'}: {f.get('message') or f.get('code')}" for f in findings if level(f) in ('error','warning')]}

def snapshot(folder,at=None,frames=6,status=say):
    """PNG stills under review/ for visual QA (Claude Code or you): evenly spaced, or at given seconds."""
    folder=Path(folder);out=folder/'review'
    shutil.rmtree(out,ignore_errors=True)
    args=['snapshot',folder,'-o',out,'--frames',frames]+(['--at',','.join(f'{t:g}' for t in at)] if at else [])
    code,log=hyperframes(args,status,'Capturing frames',timeout=300)
    shots=sorted(out.glob('*.png')) if out.exists() else []
    if code or not shots:raise RuntimeError('Snapshot failed: '+log[-1200:])
    return shots

def render(folder,final=False,status=say):
    """draft: quick check of motion and timing · final: full quality. Writes renders/draft.mp4 or renders/final.mp4."""
    folder=Path(folder);name='final' if final else 'draft';tmp=folder/'renders'/f'.{name}.part.mp4'
    lint=check(folder,status)
    if lint['errors']:raise ValueError('Fix the composition first: '+' · '.join(lint['findings'][:4]))
    args=['render',folder,'-o',tmp,'-q','high' if final else 'draft','--workers',setting('GRAPHICS_WORKERS','3')]
    status('Rendering the final video' if final else 'Rendering a quick draft',0.)
    code,log=hyperframes(args,status,'Rendering the final video' if final else 'Rendering a quick draft')
    if code or not tmp.exists():tmp.unlink(missing_ok=True);raise RuntimeError('Render failed: '+log[-1500:])
    tmp.replace(folder/'renders'/f'{name}.mp4');thumb(folder)
    return folder/'renders'/f'{name}.mp4'

def thumb(folder):
    """Poster for the job list: the frame at 40% of the latest render."""
    folder=Path(folder);src=next((folder/'renders'/f'{n}.mp4' for n in ['final','draft'] if (folder/'renders'/f'{n}.mp4').exists()),None)
    if not src:return
    subprocess.run([str(FFMPEG),'-y','-loglevel','error','-ss',f'{duration(folder)*.4:.2f}','-i',str(src),'-frames:v','1','-vf','scale=320:-2',str(folder/'thumb.jpg')],check=False)

def preview(folder):
    """HyperFrames Studio in the browser (kept running in the background; stop with --stop)."""
    code,out=hyperframes(['preview',folder,'--background'])
    url=re.search(r'https?://(?:localhost|127\.0\.0\.1):\d+\S*',out)
    if code:raise RuntimeError(out[-800:])
    return url.group(0) if url else out

def outputs(folder):
    names={'renders/final.mp4':'Final video (MP4)','renders/draft.mp4':'Draft video (MP4)'}
    return [{'file':n,'label':l} for n,l in names.items() if (Path(folder)/n).exists()]

def job_folder(ident):
    path=Path(ident) if '/' in str(ident) else RUNS/ident
    if not (path/'job.json').exists():raise SystemExit(f'No motion graphics project at {path}')
    return path

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter);sub=p.add_subparsers(dest='cmd',required=True)
    n=sub.add_parser('new');n.add_argument('title');n.add_argument('--size',choices=SIZES,default='portrait');n.add_argument('--image',action='append',default=[]);n.add_argument('--music')
    for c in ['draft','brief','build','change','undo','prompt','content','check','snapshot','render','preview','image','music']:
        s=sub.add_parser(c);s.add_argument('job')
        if c=='brief':s.add_argument('--file',help='JSON with who, look, scenes, rules')
        if c=='draft':s.add_argument('request',help='what you want, in your own words')
        if c in ('build','change'):s.add_argument('--model',choices=MODELS,default='sonnet')
        if c=='change':s.add_argument('request',help='the change, in your own words')
        if c=='content':s.add_argument('--set',action='append',default=[],metavar='ID=VALUE')
        if c=='snapshot':s.add_argument('--at',help='seconds, comma separated');s.add_argument('--frames',type=int,default=6)
        if c=='render':s.add_argument('--final',action='store_true')
        if c in ('image','music'):s.add_argument('file')
    a=p.parse_args()
    if a.cmd=='new':
        f=create(a.title,a.size,a.image,a.music);print(f);print('Next: write the brief (python graphics.py brief',f.name,'--file brief.json) or render the starter as is.');return
    f=job_folder(a.job)
    if a.cmd=='brief':
        if a.file:save_brief(f,json.loads(Path(a.file).read_text()))
        print(json.dumps(read(f,'brief.json'),indent=1,ensure_ascii=False))
    elif a.cmd=='draft':print(json.dumps(draft_brief(f,a.request),indent=1,ensure_ascii=False))
    elif a.cmd=='build':print(build(f,a.model)['summary'])
    elif a.cmd=='change':print(revise(f,a.request,a.model)['summary'])
    elif a.cmd=='undo':undo_build(f);print('Restored the version from before Claude\'s last build or change.')
    elif a.cmd=='prompt':print(prompt(f))
    elif a.cmd=='content':
        if a.set:set_content(f,dict(s.split('=',1) for s in a.set))
        for v in content(f):print(f"{v['id']:<12} {v['default']}")
    elif a.cmd=='image':print(add_image(f,a.file))
    elif a.cmd=='music':print(add_music(f,a.file))
    elif a.cmd=='check':
        r=check(f);print('OK' if r['ok'] else 'NOT OK',f"({r['errors']} errors, {r['warnings']} warnings)");[print(' ',x) for x in r['findings']]
        sys.exit(0 if r['ok'] else 1)
    elif a.cmd=='snapshot':
        for s in snapshot(f,[float(x) for x in a.at.split(',')] if a.at else None,a.frames):print(s)
    elif a.cmd=='render':print(render(f,a.final))
    elif a.cmd=='preview':print(preview(f))

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,Cancelled) as e:print(e,file=sys.stderr);sys.exit(1)
