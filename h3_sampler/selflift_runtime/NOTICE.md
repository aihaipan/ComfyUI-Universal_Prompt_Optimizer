# Bundled two-stage runtime

This directory contains the progressive-resolution sampling runtime used internally by MiniMax H3 Timeline Director.

It is derived from and substantially adapted from `facok/comfyui-SelfLift`, with MiniMax H3 latent-upscaler architecture compatibility based on `LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler`. Timeline Director adds native AV-mask audio locking, low- and high-resolution segmented continuation, Drift-Control integration, and seam handling.

The bundled code is distributed under this repository's GPL-3.0 license. Users install only MiniMax H3 Timeline Director; a compatible latent-upscaler checkpoint remains a separate model asset and belongs in `ComfyUI/models/latent_upscale_models/`.
