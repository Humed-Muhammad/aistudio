"""Offline checks; never prints credential values or starts paid calls."""
import argparse,importlib,shutil,sys
from config import setting

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--require-keys',action='store_true');parser.add_argument('--mesh',action='store_true');parser.add_argument('--shorts',action='store_true');parser.add_argument('--graphics',action='store_true');args=parser.parse_args()
    failed=sys.version_info<(3,12)
    print('Python:',sys.version.split()[0], '(3.12+ required)')
    for name in ['av','numpy','PIL','requests','fastapi','uvicorn','multipart','gradio_client','scipy']:
        try:importlib.import_module(name);print(name+': OK')
        except Exception as exc:print(name+': FAILED ('+type(exc).__name__+')');failed=True
    binary=shutil.which('rubberband');print('rubberband:', 'OK' if binary else 'MISSING — see docs/SETUP-AGENT.md');failed=failed or not binary
    if args.mesh:
        from pathlib import Path
        import subprocess
        worker=Path(__file__).resolve().parent/'.venv-face/bin/python'
        ready=worker.exists() and subprocess.run([str(worker),'-c','import mediapipe,av,PIL,numpy'],capture_output=True).returncode==0
        print('Face mesh worker: '+('OK' if ready else 'MISSING — run bash setup-face-mesh.sh'))
        failed=failed or not ready
    if args.shorts:
        from pathlib import Path
        from shorts import transcriber as shorts_transcriber
        import subprocess
        root=Path(__file__).resolve().parent;worker=root/'.venv-face/bin/python'
        checks={'Tracking worker':worker.exists() and subprocess.run([str(worker),'-c','import mediapipe,av,PIL,numpy'],capture_output=True).returncode==0,
         'Node.js':bool(shutil.which('node')),'Remotion':(root/'motion/node_modules/remotion').exists(),
         'whisper.cpp':(root/'motion/whisper.cpp/main').exists() and any((root/'motion/whisper.cpp').glob('ggml-*.bin')),
         'Studio UI':(root/'static/studio/index.html').exists()}
        for name,ok in checks.items():print(name+': '+('OK' if ok else 'MISSING — run make shorts'))
        matte=worker.exists() and subprocess.run([str(worker),'-c','import onnxruntime'],capture_output=True).returncode==0
        print('Person cutout: '+('Robust Video Matting'+(' (model downloads on first use, ~107 MB)' if not (root/'models/rvm_resnet50_fp32.onnx').exists() else '') if matte else 'MediaPipe (rougher edges; run make shorts for Robust Video Matting)'))
        print('Transcription: '+('ElevenLabs Scribe (cloud; supports Amharic)' if shorts_transcriber()=='elevenlabs' else 'local whisper.cpp (no Amharic; set ELEVENLABS_API_KEY for Amharic)'))
        print('Shorts planner: '+('Claude API key configured' if setting('ANTHROPIC_API_KEY') else 'no ANTHROPIC_API_KEY — plan with Claude Code or edit the plan JSON'))
        if not all(checks.values()):print('SHORTS EDITOR NOT READY');return 1
        print('SHORTS EDITOR READY (local; no paid calls needed)');return 0
    if args.graphics:
        from pathlib import Path
        import graphics
        root=Path(__file__).resolve().parent
        checks={'Node.js 22+':bool(shutil.which('node')) and graphics.subprocess.run(['node','-e','process.exit(+process.versions.node.split(".")[0]>=22?0:1)']).returncode==0,
         'HyperFrames':graphics.HF.exists(),'FFmpeg (local)':graphics.FFMPEG.exists(),'FFprobe (local)':graphics.FFPROBE.exists(),
         'Google Chrome':Path('/Applications/Google Chrome.app').exists(),'Claude Code skills':(root/'.claude/skills/hyperframes/SKILL.md').exists()}
        for name,ok in checks.items():print(name+': '+('OK' if ok else 'MISSING — run make graphics'))
        if not all(checks.values()):print('MOTION GRAPHICS NOT READY');return 1
        print('MOTION GRAPHICS READY (local; renders on this Mac, no paid calls)');return 0
    missing=[]
    from seedance_bridge import provider
    try:generator=provider()
    except ValueError as exc:print(exc);return 1
    print('Generation provider:',generator)
    for key in ['ENHANCOR_API_KEY','REPLICATE_API_TOKEN'] if generator=='enhancor' else ['REPLICATE_API_TOKEN']:
        value=setting(key).strip()
        valid=bool(value) and not any(x in value.lower() for x in ['your_key','your_api','replace_me','placeholder'])
        print(key+': '+('configured (not verified remotely)' if valid else 'MISSING'))
        if not valid:missing.append(key)
    if setting('MEDIA_HOST','tmpfiles') not in ['tmpfiles','catbox']:
        print('MEDIA_HOST must be tmpfiles or catbox');failed=True
    if generator=='enhancor' and not setting('ENHANCOR_WEBHOOK_URL'):
        print('WEBHOOK: not running/configured — install cloudflared and launch the app, or set your own HTTPS callback')
        missing.append('ENHANCOR_WEBHOOK_URL')
    if failed:print('DEPENDENCIES NOT READY');return 1
    if missing:
        print('LOCAL UI READY; GENERATION BLOCKED until keys and the required callback are configured.')
        return 2 if args.require_keys else 0
    print('LOCAL SETUP READY; provider access/balance has not been verified by this offline check.')
    return 0
if __name__=='__main__':sys.exit(main())
