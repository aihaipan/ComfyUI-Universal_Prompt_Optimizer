# Modified by aihaipan (2026-09) from goohai/Goohai-MiniMax-H3_Integration.
# Licensed under GPL-3.0-or-later. See LICENSE for full text.


from __future__ import annotations

import logging
import os
import re
import subprocess
import json

import nodes
import shutil
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


def _find_refmod_loader():
    """动态查找 ComfyUI-MiniMaxH3Mod 插件的 RefModsLoader 类。

    sys.modules 里可能有 torch custom class 的同名代理对象——它不是
    真正的 Python 类，访问属性会触发 torch 的 __getattr__ 抛 RuntimeError。
    必须用 isinstance(x, type) 过滤，只接受真的类。
    """
    import sys
    for mod in list(sys.modules.values()):
        try:
            loader = getattr(mod, "MiniMaxH3RefModsLoader", None)
        except Exception:
            continue
        if loader is None:
            continue
        # 排除 torch custom class 代理：必须是真的 Python 类
        if not isinstance(loader, type):
            continue
        try:
            if not hasattr(loader, "load"):
                continue
        except Exception:
            continue
        return loader
    return None


def _build_refmod_load_kwargs(gh_state_json: str) -> dict:
    """从 gh_state_json 里提取用户选的 RefMod 列表，拼成 load() 的 kwargs。"""
    try:
        state = json.loads(gh_state_json) if gh_state_json else {}
    except Exception:
        return {}
    entries = state.get("media") or []
    collected = []
    for item in entries:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        slot, entry = item
        if not isinstance(entry, dict):
            continue
        if entry.get("kind") != "refmod":
            continue
        m = re.match(r"refmod_(\d+)$", str(slot))
        if not m:
            continue
        collected.append((int(m.group(1)), entry))
    collected.sort(key=lambda x: x[0])

    kwargs = {"show_info": False, "max_total_tokens": 0}
    for i, (_, entry) in enumerate(collected[:8], start=1):
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        try:
            strength = max(0.0, min(1.0, float(entry.get("strength") if entry.get("strength") is not None else 1.0)))
        except (TypeError, ValueError):
            strength = 1.0
        try:
            copies = max(1, min(10, int(entry.get("copies") if entry.get("copies") is not None else 1)))
        except (TypeError, ValueError):
            copies = 1
        components = str(entry.get("components") or "All")
        if components not in ("All", "Visual", "Audio"):
            components = "All"
        kwargs[f"mod_{i}"] = name
        kwargs[f"strength_{i}"] = strength
        kwargs[f"copies_{i}"] = copies
        kwargs[f"components_{i}"] = components
        kwargs[f"visual_strength_{i}"] = 1.0
        kwargs[f"audio_strength_{i}"] = 1.0
    return kwargs


def _probe_video_metadata(filename: str) -> dict:
    """用 ffprobe 探测视频的 duration 和 hasAudio。失败返回空 dict。"""
    try:
        import folder_paths
        full_path = folder_paths.get_annotated_filepath(filename)
        if not full_path or not os.path.isfile(full_path):
            # 兼容：在 input 目录找
            input_dir = folder_paths.get_input_directory()
            candidate = os.path.join(input_dir, filename)
            if os.path.isfile(candidate):
                full_path = candidate
            else:
                return {}
        # 优先用 ffprobe
        ffprobe = shutil.which("ffprobe")
        if ffprobe:
            cmd = [
                ffprobe, "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", full_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if result.returncode == 0:
                data = json.loads(result.stdout or "{}")
                duration = float(data.get("format", {}).get("duration") or 0.0)
                has_audio = any(
                    s.get("codec_type") == "audio"
                    for s in data.get("streams", [])
                )
                return {"duration": duration, "has_audio": has_audio}
        # 回退：用 ffmpeg -i 的输出解析（stderr）
        try:
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_exe = shutil.which("ffmpeg")
        if not ffmpeg_exe:
            logging.warning("neither ffprobe nor ffmpeg found; video metadata will be empty")
            return {}
        cmd = [ffmpeg_exe, "-hide_banner", "-i", full_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        # ffmpeg 把信息输出到 stderr，返回码非 0 是正常的
        stderr = result.stderr or ""
        duration = 0.0
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", stderr)
        if m:
            duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        has_audio = "Stream #" in stderr and "Audio:" in stderr
        logging.info("Video metadata via ffmpeg: duration=%.3f has_audio=%s", duration, has_audio)
        return {"duration": duration, "has_audio": has_audio}
    except Exception as exc:
        logging.warning("_probe_video_metadata failed for %s: %s", filename, exc)
        return {}


def _build_media_bundle(media: dict) -> dict:
    """Pack every uploaded slot into a single GH_MEDIA_BUNDLE dict.

    Keys: "images" / "audios" / "videos" — each a dict {index: value},
    index 0-based and matching the Director's MMX_DIR_GROUP convention.

    The Director's pack_r2v_group expects:
      ref_images: {0..8} -> IMAGE tensors (1,H,W,C)
      ref_audios: {0..2} -> AUDIO dicts
    Videos are not packed yet (the universal node does not decode them).
    """
    bundle = {"images": {}, "audios": {}, "videos": {}, "image_paths": {}, "audio_paths": {}, "video_paths": {}}

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

    # 【视频参考】打包视频文件路径 + 元数据（duration / hasAudio 用 ffprobe 探测）
    for i in range(3):
        slot = f"ref_video_{i + 1}"
        value = media.get(slot, "")
        if not value or value == "(none)":
            continue
        try:
            meta = _probe_video_metadata(str(value))
        except Exception as exc:
            logging.warning("Universal Prompt Optimizer could not probe video %s: %s", value, exc)
            meta = {}
        bundle["videos"][i] = {
            "file": str(value),
            "name": os.path.basename(str(value)),
            "start": 0.0,
            "trimStart": 0.0,
            "duration": float(meta.get("duration") or 0.0),
            "sourceDuration": float(meta.get("duration") or 0.0),
            "hasAudio": bool(meta.get("has_audio", False)),
            "referenceMode": "guide",
        }
        bundle["video_paths"][i] = str(value)

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


class UniversalDirectorUI(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        media_inputs = [_hidden_string(s) for s in IMAGE_SLOTS + VIDEO_SLOTS + AUDIO_SLOTS]
        return io.Schema(
            node_id="UniversalDirectorUI",
            display_name="Universal MiniMax_H3导演台Max",
            category=NODE_CATEGORY,
            enable_expand=True,  # 【核心修复】允许节点向后端透传底层采样图
            description=(
                "Universal prompt optimizer with rich media slots (image/video/audio). "
                "Outputs the first image, the prompt string, an optional conditioning, and an "
                "optional latent so it can feed text-to-image, img2img, and reference-driven "
                "pipelines without forcing any model loading."
            ),
            inputs=[
                io.Model.Input("model", optional=True, tooltip="接入模型及VAE后，将在本节点内部直接出视频"),
                io.Clip.Input("clip", optional=True, tooltip="可选：接入文本编码器后节点输出 conditioning"),
                io.Vae.Input("vae", optional=True),
                io.Vae.Input("audio_vae", optional=True),
                io.Int.Input("width", default=1024, min=64, max=16384, step=32),
                io.Int.Input("height", default=1024, min=64, max=16384, step=32),
                io.Combo.Input("resize_mode", options=["cover", "contain", "stretch"], default="cover"),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True, default="", extra_dict={"hidden": True}),
                *media_inputs,
                                io.String.Input("gh_state_json", default="", optional=True, extra_dict={"hidden": True}),
                io.String.Input("segments_json", default="", optional=True, extra_dict={"hidden": True}),
            ],
            outputs=[
                io.Custom("VIDEO").Output("video"),
            ],
        )                

    @classmethod
    def execute(cls, clip=None, model=None, vae=None, audio_vae=None, width=1024, height=1024, resize_mode="cover",
                                prompt="", gh_state_json="", segments_json="", **media):
        
        # 1. 获取宽高及高级参数
        _w, _h = width, height
        _steps = 8
        _sp, _sp_model, _sp_steps = False, "", 2
        _audio_mode = "参考音色"
        _save_prefix = "Universal_MiniMax_H3director/Universal_MiniMax_H3director"
        _bridge_overlaps = ""
        _save_video = False  # 【修复】给个初始值，避免未定义报错
        try:
            if gh_state_json:
                st = json.loads(gh_state_json)
                if "dirWidth" in st: _w = int(st["dirWidth"])
                if "dirHeight" in st: _h = int(st["dirHeight"])
                if "dirSteps" in st: _steps = int(st["dirSteps"])
                if "dirSecondPass" in st: _sp = bool(st["dirSecondPass"])
                if "dirSecondPassModel" in st: _sp_model = str(st["dirSecondPassModel"])
                if "dirSecondPassSteps" in st: _sp_steps = int(st["dirSecondPassSteps"])
                if "dirAudioMode" in st: _audio_mode = str(st["dirAudioMode"])
                if "dirSavePrefix" in st: _save_prefix = str(st["dirSavePrefix"])
                if "dirBridgeOverlaps" in st: _bridge_overlaps = str(st["dirBridgeOverlaps"])
        except Exception as e:
            logging.warning(f"解析导演参数失败: {e}")

        # 2. 极简媒体打包（只提取路径，不加载图片 Tensor，极速！）
        media_bundle = {
            "image_paths": {i: media.get(f"ref_image_{i+1}", "") for i in range(9) if media.get(f"ref_image_{i+1}") and media.get(f"ref_image_{i+1}") != "(none)"},
            "audio_paths": {i: media.get(f"ref_audio_{i+1}", "") for i in range(3) if media.get(f"ref_audio_{i+1}") and media.get(f"ref_audio_{i+1}") != "(none)"},
            "videos": {}, # 视频底层会自己扫目录/读路径，如果需要
        }

        # 3. 直接交给底层出片
        if model is None or vae is None or audio_vae is None:
            raise ValueError("【导演台 Max】请连接 model, vae, audio_vae 才能出片！")

        from .universal_director_node import UniversalMiniMax_H3Director
        
        # 重新计算 RefMods（复用旧逻辑）

        refmod_mods = None
        try:
            state = json.loads(gh_state_json) if gh_state_json else {}
            is_refmod_view = (state.get("viewMode") == "video" and state.get("currentSubView") == "refmod")
            if is_refmod_view:
                from .universal_prompt_node import _find_refmod_loader, _build_refmod_load_kwargs
                loader_cls = _find_refmod_loader()
                if loader_cls:
                    kwargs = _build_refmod_load_kwargs(gh_state_json)
                    refmod_mods = loader_cls().load(**kwargs)[0]
                    logging.info(f"【Max导演台】成功加载了 {len(refmod_mods)} 个 RefMod: {[m[0].name for m in refmod_mods]}")
        except Exception as e:
            logging.warning(f"提取 RefMod 失败: {e}")

        out = UniversalMiniMax_H3Director.execute(
            model=model, clip=clip, vae=vae, audio_vae=audio_vae,
            media_bundle=media_bundle, prompt_finite=str(prompt or ""), segments_json=segments_json,
            width=_w, height=_h, steps=_steps,
            second_pass=_sp, 
            second_pass_model=_sp_model, 
            second_pass_high_steps=_sp_steps,
            save_video=_save_video,
            fps=24,
            filename_prefix=_save_prefix,
            bridge_overlaps=_bridge_overlaps,
            refmod_mods=refmod_mods  # 【补上】传给中转层
        )

        # 4. 返回原生 Video 对象
        return io.NodeOutput(out.result[0], expand=out.expand)

class UniversalDirectorUIExtension(ComfyExtension):
    async def get_node_list(self):
        return [UniversalDirectorUI]

__all__ = ["UniversalDirectorUIExtension"]