# Third-party notices

Python dependencies retain their respective licenses. Rubber Band is an external executable with its own licensing; obtain it from its official distribution/package manager. Hosted Demucs, depth, SAM and Seedance models are not redistributed in this package and remain subject to their providers' terms.

TEIN branding and companion illustrations are included from the existing user-authorized UI. Those assets are excluded from the MIT license covering this project’s code and documentation; this package grants no new rights to them. Google Fonts are requested by CSS, not vendored here. Two user-selected videos are included under `examples/`; see its README for media rights and usage notes. No license to third-party footage, music or likenesses is granted by this package.

Cloudflared is an optional external executable distributed by Cloudflare. Quick Tunnels are a development service; this package does not redistribute the binary.

The shorts editor downloads Robust Video Matting weights (`rvm_resnet50_fp32.onnx`, or `rvm_mobilenetv3_fp32.onnx` with `SHORTS_MATTE=fast`) from the official PeterL1n/RobustVideoMatting GitHub release into `models/` on first use and runs them with ONNX Runtime (MIT). The project's code is GPL-3.0; none of it is included here and the weights are not redistributed. The shorts studio UI uses Remotion and the Remotion Player (Remotion License: free for individuals and companies of up to 3 people) and Vite (MIT), installed by npm in `motion/`.
