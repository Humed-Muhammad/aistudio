"""Readiness check for Humed’s AI Studio. Runs offline, never makes paid calls and never prints key values.

  python doctor.py              base install (Python packages)
  python doctor.py --shorts     Shorts editor + Audio cleaner
  python doctor.py --graphics   Motion graphics
  python doctor.py --channel    Channel (faceless YouTube videos)
  python doctor.py --all        everything, plus which optional keys are set
"""
import argparse,importlib,shutil,subprocess,sys
from config import ROOT,setting

def report(title,checks):
    print('\n'+title)
    for name,(ok,fix) in checks.items():print(f'  {"OK     " if ok else "MISSING"} {name}'+('' if ok else f'  ({fix})'))
    return all(ok for ok,_ in checks.values())

def runs(cmd):
    try:return subprocess.run(cmd,capture_output=True).returncode==0
    except OSError:return False

def base():
    checks={'Python 3.12+':(sys.version_info>=(3,12),'install Python 3.12 or newer')}
    for module in ['fastapi','uvicorn','multipart','av','numpy','PIL','scipy','httpx','anthropic']:
        try:importlib.import_module(module);ok=True
        except Exception:ok=False
        checks[module]=(ok,'run make setup')
    return report('Base',checks)

def shorts_ready():
    from shorts import transcriber
    worker=ROOT/'.venv-face/bin/python';whisper=ROOT/'motion/whisper.cpp'
    ok=report('Shorts editor + Audio cleaner',{
        'Tracking (MediaPipe)':(worker.exists() and runs([str(worker),'-c','import mediapipe,av,PIL,numpy']),'run make shorts'),
        'Person cutout (ONNX Runtime)':(worker.exists() and runs([str(worker),'-c','import onnxruntime']),'run make shorts'),
        'Node.js':(bool(shutil.which('node')),'install Node.js 18+ from nodejs.org'),
        'Remotion':((ROOT/'motion/node_modules/remotion').exists(),'run make shorts'),
        'Local whisper.cpp':((whisper/'main').exists() and any(whisper.glob('ggml-*.bin')),'run make shorts'),
        'Studio UI build':((ROOT/'static/studio/index.html').exists(),'run make shorts'),
        'YouTube to Shorts (yt-dlp)':(runs([sys.executable,'-c','import yt_dlp,yt_dlp_ejs']),'run make shorts'),
    })
    if not (ROOT/'models/rvm_resnet50_fp32.onnx').exists():print('  note    the person-cutout model (~107 MB) downloads on first use')
    print('  note    transcription: '+('ElevenLabs Scribe (cloud, paid per minute, supports Amharic)' if transcriber()=='elevenlabs' else 'local whisper.cpp (free; no Amharic; add ELEVENLABS_API_KEY for Amharic)'))
    return ok

def graphics_ready():
    import graphics
    from shorts import chrome
    return report('Motion graphics',{
        'Node.js 22+':(runs(['node','-e','process.exit(+process.versions.node.split(".")[0]>=22?0:1)']),'install Node.js 22+ from nodejs.org'),
        'HyperFrames':(graphics.HF.exists(),'run make graphics'),
        'FFmpeg (local)':(graphics.FFMPEG.exists(),'run make graphics'),
        'FFprobe (local)':(graphics.FFPROBE.exists(),'run make graphics'),
        'Google Chrome':(bool(chrome()),'install Google Chrome, or set SHORTS_BROWSER in .env'),
        'Claude Code skills':((ROOT/'.claude/skills/hyperframes/SKILL.md').exists(),'run make graphics'),
    })

def channel_ready():
    import graphics
    from channel import keys as channel_keys
    have=channel_keys()
    ok=report('Channel (faceless YouTube videos)',{
        'Claude Code (writes reports, scripts, scenes)':(bool(graphics.claude_bin()),'install the Claude Code VS Code extension or CLI, or set CLAUDE_BIN in .env'),
        'Node.js':(bool(shutil.which('node')),'install Node.js 18+ from nodejs.org'),
        'Remotion (renders the videos)':((ROOT/'motion/node_modules/remotion').exists(),'run make shorts'),
        'ELEVENLABS_API_KEY (voice-over)':(have['elevenlabs'],'add your ElevenLabs key to .env'),
    })
    for name,key,use in [('YOUTUBE_API_KEY','youtube','niche research with real YouTube numbers (free)'),('PEXELS_API_KEY','pexels','stock footage (free)'),
                         ('PIXABAY_API_KEY','pixabay','more stock footage (free)'),('FAL_KEY','fal','AI images and clips (paid)')]:
        print(f'  {"set    " if have[key] else "not set"} {name}: {use}')
    print('  note    ElevenLabs free plan audio may not be used commercially: a monetized channel needs Starter or above')
    return ok

def keys():
    print('\nOptional keys (in .env)')
    for name,use in [('ANTHROPIC_API_KEY','Edit it for me, auto-plan, post text and YouTube moments (Claude API)'),('ELEVENLABS_API_KEY','Amharic transcripts, Strong noise removal and Channel voice-overs'),
                     ('YOUTUBE_API_KEY','Channel niche research'),('PEXELS_API_KEY','Channel stock footage'),('PIXABAY_API_KEY','Channel stock footage'),
                     ('FAL_KEY','Channel AI images and clips (paid)')]:
        value=setting(name).strip()
        print(f'  {"set    " if value else "not set"} {name}: {use}')

def main():
    parser=argparse.ArgumentParser(description='Check what Humed’s AI Studio needs. Offline; prints no key values.')
    for flag in ['shorts','graphics','channel','all']:parser.add_argument('--'+flag,action='store_true')
    args=parser.parse_args()
    ok=base()
    if args.shorts or args.all:ok=shorts_ready() and ok
    if args.graphics or args.all:ok=graphics_ready() and ok
    if args.channel or args.all:ok=channel_ready() and ok
    if args.all:keys()
    print('\n'+('READY' if ok else 'NOT READY: follow the hints above'))
    return 0 if ok else 1

if __name__=='__main__':sys.exit(main())
