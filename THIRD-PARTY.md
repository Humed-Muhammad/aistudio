# Third-party notices

Humed’s AI Studio's own code is MIT licensed (see `LICENSE`). It installs or downloads the following on your machine; none of them are copied into this repository, and each keeps its own license.

| What | Used for | License / terms |
| --- | --- | --- |
| [Remotion](https://www.remotion.dev) and the Remotion Player | Shorts rendering and live preview | Remotion License: free for individuals and companies of up to 3 people. **Larger companies need a paid Remotion company license.** |
| [HyperFrames](https://github.com/heygen-com/hyperframes), GSAP | Motion graphics | Their own licenses, installed by npm in `graphics-kit/` |
| [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting) weights | Person cutout | GPL-3.0 project; weights downloaded from the official release into `models/` on first use, not redistributed |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) and its models | Hand, face and gesture tracking | Apache-2.0 |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Runs the cutout model | MIT |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Local transcription | MIT |
| RNNoise model ([GregorR/rnnoise-models](https://github.com/GregorR/rnnoise-models), run by FFmpeg's `arnndn`) | Light noise removal | Its own license; downloaded into `models/` on first use, not redistributed |
| [Mixkit](https://mixkit.co/free-sound-effects/) sound effects | Default sound effects | Mixkit free license (commercial use, no credit). Downloaded once into `models/sfx-mixkit/`; never redistributed as raw files |
| FFmpeg (ffmpeg-static), FFprobe | Video encoding | LGPL/GPL builds, installed by npm |
| Python and npm packages | Everything else | Their respective licenses |
| Google Fonts (Inter, Noto Sans Ethiopic, Montserrat …) | Captions and UI | SIL Open Font License, loaded from Google Fonts |

Cloud services are optional and used only with your own keys: the Claude API (Anthropic), ElevenLabs (Scribe and Voice Isolator). Their terms apply to anything you send them.

No rights to anyone's footage, music, voice or likeness are granted by this project.
