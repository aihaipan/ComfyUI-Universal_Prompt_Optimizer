# Modified by aihaipan (2026-09) from goohai/Goohai-MiniMax-H3_Integration.
# Licensed under GPL-3.0-or-later. See LICENSE for full text.


from __future__ import annotations

import logging

import nodes
import torch
import torch.nn.functional as F
from comfy_api.latest import ComfyExtension, io
from comfy_extras import nodes_audio


NODE_CATEGORY = "Universal Prompt/Optimizer"

IMAGE_SLOTS = [f"ref_image_{i}" for i in range(1, 10)]
VIDEO_SLOTS = [f"ref_video_{i}" for i in range(1, 4)]
AUDIO_SLOTS = [f"ref_audio_{i}" for i in range(1, 4)]


def _blank_image(width: int = 1024, height: int = 1024) -> torch.Tensor:
    return torch.zeros((1, height, width, 3), dtype=torch.float32)


def _load_image_file(value):
    if not value or value == "(none)":
        return None
    try:
        loaded, _mask = nodes.LoadImage().load_image(value)
    except Exception as exc:
        logging.warning("Universal Prompt Optimizer could not load %s: %s", value, exc)
        return None
    return loaded


def _resize_cover(image, width, height):
    n, h, w, c = image.shape
    if h == height and w == width:
        return image
    scale = max(width / w, height / h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = F.interpolate(image.permute(0, 3, 1, 2), size=(new_h, new_w), mode="bilinear", align_corners=False).permute(0, 2, 3, 1)
    top = max(0, (new_h - height) // 2)
    left = max(0, (new_w - width) // 2)
    return resized[:, top:top + height, left:left + width, :]


def _resize_contain(image, width, height):
    n, h, w, c = image.shape
    if h == height and w == width:
        return image
    scale = min(width / w, height / h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = F.interpolate(image.permute(0, 3, 1, 2), size=(new_h, new_w), mode="bilinear", align_corners=False).permute(0, 2, 3, 1)
    canvas = torch.zeros((n, height, width, c), dtype=image.dtype, device=image.device)
    top = max(0, (height - new_h) // 2)
    left = max(0, (width - new_w) // 2)
    canvas[:, top:top + new_h, left:left + new_w, :] = resized
    return canvas


def _resize_stretch(image, width, height):
    return F.interpolate(image.permute(0, 3, 1, 2), size=(height, width), mode="bilinear", align_corners=False).permute(0, 2, 3, 1)


_RESIZE_MODES = {"cover": _resize_cover, "contain": _resize_contain, "stretch": _resize_stretch}



def _hidden_string(name):
    return io.String.Input(name, default="", optional=True, extra_dict={"hidden": True})


def _build_media_bundle(media: dict) -> dict:
    """Pack every uploaded slot into a single GH_MEDIA_BUNDLE dict.

    Keys: "images" / "audios" / "videos" — each a dict {index: value},
    index 0-based and matching the Director's MMX_DIR_GROUP convention.

    The Director's pack_r2v_group expects:
      ref_images: {0..8} -> IMAGE tensors (1,H,W,C)
      ref_audios: {0..2} -> AUDIO dicts
    Videos are not packed yet (the universal node does not decode them).
    """
    bundle = {"images": {}, "audios": {}, "videos": {}, "image_paths": {}, "audio_paths": {}}

    for i in range(9):
        slot = f"ref_image_{i + 1}"
        value = media.get(slot, "")
        if not value or value == "(none)":
            continue
        try:
            loaded, _mask = nodes.LoadImage().load_image(value)
        except Exception as exc:
            logging.warning("Universal Prompt Optimizer could not load %s: %s", value, exc)
            continue
        if loaded is not None:
            bundle["images"][i] = loaded
            bundle["image_paths"][i] = str(value)

    for i in range(3):
        slot = f"ref_audio_{i + 1}"
        value = media.get(slot, "")
        if not value or value == "(none)":
            continue
        try:
            audio = nodes_audio.LoadAudio.load(value)[0]
        except Exception:
            # 兼容 pyav 拒绝的音频（FLAC / 部分封装），走 FFmpeg 解码回退
            try:
                # 新插件没有 nodes.py，不再依赖 Goohai 的音频加载回退
                audio = None
            except Exception as exc:
                logging.warning("Universal Prompt Optimizer could not load audio %s: %s", value, exc)
                audio = None
        if audio is not None:
            bundle["audios"][i] = audio
            bundle["audio_paths"][i] = str(value)

    return bundle


class UniversalPromptOptimizerGH(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        media_inputs = [_hidden_string(s) for s in IMAGE_SLOTS + VIDEO_SLOTS + AUDIO_SLOTS]
        return io.Schema(
            node_id="UniversalPromptOptimizerGH",
            display_name="万能模型提示词优化",
            category=NODE_CATEGORY,
            description=(
                "Universal prompt optimizer with rich media slots (image/video/audio). "
                "Outputs the first image, the prompt string, an optional conditioning, and an "
                "optional latent so it can feed text-to-image, img2img, and reference-driven "
                "pipelines without forcing any model loading."
            ),
            inputs=[
                io.Clip.Input("clip", optional=True, tooltip="可选：接入文本编码器后节点输出 conditioning"),
                io.Int.Input("width", default=1024, min=64, max=16384, step=32),
                io.Int.Input("height", default=1024, min=64, max=16384, step=32),
                io.Combo.Input("resize_mode", options=["cover", "contain", "stretch"], default="cover"),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True, default="", extra_dict={"hidden": True}),
                *media_inputs,
                                io.String.Input("gh_state_json", default="", optional=True, extra_dict={"hidden": True}),
                io.String.Input("segments_json", default="", optional=True, extra_dict={"hidden": True}),
            ],
            outputs=[
                io.Image.Output("image"),
                # 打包所有上传素材（9 图 + 3 音频）供 MiniMax H3 R2V 桥接器使用。
                io.Custom("GH_MEDIA_BUNDLE").Output("media_bundle"),
                # prompt（String 类型）：给 R2V 桥接器使用
                io.String.Output("prompt"),
                io.Conditioning.Output("conditioning"),
                # prompt_finite（String 包装类型）：给 Finite Segment 桥接器使用（避免跟 R2V 类型冲突）
                io.Custom("GH_PROMPT_STR").Output("prompt_finite"),                
                # segments_json（String 包装类型）：给 Finite Segment 桥接器使用
                io.Custom("GH_SEGMENTS_STR").Output("segments_json"),
            ],
        )

    @classmethod
    def execute(cls, clip=None, width=1024, height=1024, resize_mode="cover",
                                prompt="", gh_state_json="", segments_json="", **media):
        width = max(64, min(16384, int(width or 1024)))
        height = max(64, min(16384, int(height or 1024)))

        # 找到第一张可用的参考图片，作为"图像输出"的源。
        source = None
        for slot in IMAGE_SLOTS:
            source = _load_image_file(media.get(slot, ""))
            if source is not None:
                break
        resizer = _RESIZE_MODES.get(str(resize_mode or "cover"), _resize_cover)
        image = resizer(source, width, height) if source is not None else _blank_image(width, height)

        prompt_text = str(prompt or "")
        conditioning = []
        if clip is not None and prompt_text:
            try:
                conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(prompt_text))
            except Exception as exc:
                logging.warning("Universal Prompt Optimizer conditioning encode failed: %s", exc)
                conditioning = []

        # 打包所有上传素材为一个 bundle 字典，供下游 R2V 桥接器使用。
        # 索引约定：图片 0-8、音频 0-2（跟导演台 MMX_DIR_GROUP 的约定一致）。
        media_bundle = _build_media_bundle(media)

        return io.NodeOutput(image, media_bundle, prompt_text, conditioning, segments_json, prompt_text)


class UniversalPromptOptimizerExtension(ComfyExtension):
    async def get_node_list(self):
        return [UniversalPromptOptimizerGH]


def comfy_entrypoint():
    return UniversalPromptOptimizerExtension()