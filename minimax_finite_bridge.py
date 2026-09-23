# Original work by aihaipan. Licensed under GPL-3.0-or-later.
# See LICENSE for full text.

from __future__ import annotations

import json
import logging

from comfy_api.latest import ComfyExtension, io

from aiohttp import web
from server import PromptServer
import folder_paths


NODE_CATEGORY = "Universal Prompt/Finite Segment Bridge"

H3_FPS = 24

# 【二采验证 2026-09-23】临时硬编码，验证桥接器写 secondPass 字段是否被采样器读取。
# 【L3 二采】临时调试模式：True = 强制开启二采（忽略 UI），False = 由 UI 控制。
# 正式使用请保持 False。
VERIFY_SECOND_PASS = False
VERIFY_SECOND_PASS_MODEL = "minimax_h3_latent_upscaler_3d_bf16.safetensors"
VERIFY_SECOND_PASS_STEPS = 2
# 【L2-d】段间重叠：由前端 UI（桥接器节点内）管理，通过 bridge_overlaps 隐藏 widget 传入。
# 默认 24 帧（1 秒），用户可在 UI 里拖拽调整每段的重叠量。
DEFAULT_OVERLAP_FRAMES = 24


def _aligned_h3_length(seconds: float) -> int:
    """Return the nearest H3-valid 5 + 17*n frame count."""
    requested = max(5.0 / H3_FPS, float(seconds)) * H3_FPS
    n = max(0, round((requested - 5.0) / 17.0))
    return int(5 + 17 * n)


def _parse_mini_format(text: str) -> list[dict]:
    """Parse the mini line format:
        <seconds> [| <prompt> [| images=<idx>,<idx>,...]]

    Each non-empty, non-comment line becomes one segment.
    - '#' at line start -> comment, ignored
    - prompt optional; empty -> global prompt is used
    - images optional; 1-based indices referring to uploaded image slots
    """
    segments = []
    for raw_lineno, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        parts = [p.strip() for p in line.split("|", 2)]
        seconds_str = parts[0]
        try:
            seconds = float(seconds_str)
        except ValueError:
            raise ValueError(
                f"Mini format line {raw_lineno}: expected seconds first, got '{seconds_str}'"
            )
        if seconds <= 0:
            raise ValueError(f"Mini format line {raw_lineno}: duration must be > 0")

        middle = parts[1] if len(parts) > 1 else ""
        last = parts[2] if len(parts) > 2 else ""

        if last.startswith("images=") or last.startswith("素材="):
            seg_prompt = middle
            indices_str = last.split("=", 1)[1]
        else:
            seg_prompt = "|".join([p for p in (middle, last) if p]).strip()
            indices_str = ""

        seg_images = None
        if indices_str:
            seg_images = []
            for token in indices_str.split(","):
                token = token.strip()
                if not token:
                    continue
                try:
                    idx = int(token)
                except ValueError:
                    raise ValueError(
                        f"Mini format line {raw_lineno}: '{token}' is not an integer image index"
                    )
                if idx < 1:
                    raise ValueError(
                        f"Mini format line {raw_lineno}: image index must be >= 1 (1-based)"
                    )
                seg_images.append(idx - 1)

        segments.append({
            "duration": seconds,
            "prompt": seg_prompt,
            "images": seg_images,
        })
    return segments


def _parse_segments_input(raw):
    """Accept three forms:
    1. Empty -> return None (single-segment mode)
    2. JSON object with 'segments' list (legacy) -> return normalized list
    3. Mini line format -> return list
    """
    text = str(raw or "").strip()
    if not text:
        return None

    first_meaningful = ""
    for line in text.splitlines():
        s = line.strip()
        if s and not s.startswith("#"):
            first_meaningful = s
            break

    if first_meaningful.startswith("{"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"segments_json is not valid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("segments_json must be a JSON object")
        segments = data.get("segments")
        if not isinstance(segments, list) or not segments:
            raise ValueError("segments_json.segments must be a non-empty list")
        normalized = []
        for entry in segments:
            if not isinstance(entry, dict):
                raise ValueError("Each segments_json entry must be an object")
            normalized.append({
                "duration": float(entry.get("duration", 0) or 0),
                "prompt": str(entry.get("prompt") or "").strip(),
                "images": entry.get("images"),
            })
        return normalized

    return _parse_mini_format(text)


def _format_image_spec(seg_images, all_images) -> str:
    if seg_images is None:
        return "全部"
    if not seg_images:
        return "无"
    return ", ".join(str(i + 1) for i in seg_images)


def _build_summary_single(images, audios, width, height, length, seconds, audio_mode):
    return (
        f"【Finite Segment 桥接器】\n"
        f"模式: 单段\n"
        f"设定时长: {seconds:.2f}s → {length} 帧 (实际 {length / H3_FPS:.2f}s)\n"
        f"分辨率: {width}x{height}\n"
        f"素材: {len(images)} 张图, {len(audios)} 个音频 ({audio_mode})\n"
        f"段间重叠: 0 帧"
    )


def _build_summary_multi(all_images, all_audios, seg_plans, width, height, audio_mode, overlaps=None):
    overlaps = overlaps or []
    total_overlap = sum(overlaps)
    lines = [
        f"【Finite Segment 桥接器】",
        f"模式: 多段 ({len(seg_plans)} 段)",
        f"分辨率: {width}x{height}",
        f"素材池: {len(all_images)} 张图, {len(all_audios)} 个音频 ({audio_mode})",
        f"段间重叠: 共 {total_overlap} 帧",
        "─" * 40,
    ]
    total_frames = 0
    for i, plan in enumerate(seg_plans, start=1):
        seg_images = plan["timeline"]["images"]
        seg_prompt = plan["timeline"]["globalPrompt"]
        prompt_display = seg_prompt[:24] + "…" if len(seg_prompt) > 24 else seg_prompt
        if not prompt_display:
            prompt_display = "(全局)"
        total_frames += plan["length"]
        ov = overlaps[i - 1] if i - 1 < len(overlaps) else 0
        ov_text = f" | 重叠 {ov:3d} 帧" if i > 1 else ""
        lines.append(
            f"  段 {i} | {plan['generation_seconds']:5.2f}s → {plan['length']:4d} 帧{ov_text} "
            f"| 素材: {len(seg_images)} 张 | 提示: {prompt_display}"
        )
    lines.append("─" * 40)
    output_frames = max(0, total_frames - total_overlap)
    if total_overlap > 0:
        lines.append(f"总帧数: {total_frames} 帧 → 扣重叠 {total_overlap} 帧 = {output_frames} 帧 ({output_frames / H3_FPS:.2f}s)")
    else:
        lines.append(f"总帧数: {total_frames} 帧 ({total_frames / H3_FPS:.2f}s)")
    return "\n".join(lines)


class MiniMaxH3FiniteBridgeGH(io.ComfyNode):
    """Bridge a universal prompt + media bundle into TimelineDirector's
    Finite Segment Sampler input. Supports single-segment and multi-segment
    (via segments_json, either JSON or mini line format)."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MiniMaxH3FiniteBridgeGH",
            display_name="MiniMax H3 Finite Segment 桥接器",
            category=NODE_CATEGORY,
            description=(
                "Convert a universal prompt + media bundle into a finite_plan. "
                "Leave segments_json empty for single-segment mode. Fill it with "
                "either JSON or the mini line format '秒数 | 提示词 | images=1,3'."
            ),
            inputs=[
                io.Custom("GH_MEDIA_BUNDLE").Input(
                    "media_bundle",
                    optional=True,
                    tooltip="万能节点的 media_bundle 输出；未连接则视为空素材",
                ),
                io.Custom("GH_PROMPT_STR").Input(
                    "prompt",
                    optional=True,
                    tooltip="优化后的提示词（来自万能节点的 prompt 输出）",
                ),
                io.Float.Input(
                    "duration_sec",
                    default=5.0,
                    min=0.2,
                    max=150.0,
                    step=0.1,
                    tooltip="单段模式的目标时长（秒）；多段模式下由 segments_json 覆盖",
                ),
                io.Int.Input(
                    "width",
                    default=864,
                    min=64,
                    max=16384,
                    step=32,
                    tooltip="生成宽度（像素）",
                ),
                io.Int.Input(
                    "height",
                    default=480,
                    min=64,
                    max=16384,
                    step=32,
                    tooltip="生成高度（像素）",
                ),
                io.Combo.Input(
                    "audio_mode",
                    options=["参考音色", "强制使用音频1"],
                    default="参考音色",
                    tooltip="参考音色 = 参考上传音频的音色重新生成对白；强制使用音频1 = 原声直入（仅取第 1 条）",
                ),
                io.Custom("GH_SEGMENTS_STR").Input(
                    "segments_json",
                    optional=True,
                    tooltip="多段模式。留空 = 单段。由万能节点自动生成。",
                ),
                io.String.Input(
                    "bridge_overlaps",
                    default="",
                    optional=True,
                    extra_dict={"hidden": True},
                    tooltip="段间重叠帧数数组，由桥接器 UI 管理。格式如 '[0,24,24]'。",
                ),
                io.String.Input(
                    "second_pass",
                    default="false",
                    optional=True,
                    extra_dict={"hidden": True},
                    tooltip="二采开关，由桥接器 UI 管理。'true' / 'false'。",
                ),
                io.String.Input(
                    "second_pass_model",
                    default="",
                    optional=True,
                    extra_dict={"hidden": True},
                    tooltip="二采模型名，由桥接器 UI 管理。",
                ),
                io.String.Input(
                    "second_pass_high_steps",
                    default="2",
                    optional=True,
                    extra_dict={"hidden": True},
                    tooltip="二采高清步数，由桥接器 UI 管理。",
                ),
            ],
            outputs=[
                io.Custom("MINIMAX_H3_FINITE_SEGMENT_PLAN").Output("finite_plan"),
                io.String.Output("summary"),
            ],
        )

    @classmethod
    def execute(
        cls,
        prompt="",
        media_bundle=None,
        duration_sec=5.0,
        width=864,
        height=480,
        audio_mode="reference",
        segments_json="",
        bridge_overlaps="",
        second_pass="false",
        second_pass_model="",
        second_pass_high_steps="2",
    ):
        # 【L3 二采】解析用户 UI 传入的二采配置
        sp_enabled = str(second_pass or "").strip().lower() in {"true", "1", "yes", "on"}
        sp_model = str(second_pass_model or "").strip()
        try:
            sp_steps = int(str(second_pass_high_steps or "2"))
        except (TypeError, ValueError):
            sp_steps = 2
        # 【L3 二采】保留此分支：VERIFY_SECOND_PASS=True 时用于调试，平时为 False 无影响。
        if VERIFY_SECOND_PASS:
            sp_enabled = True
            sp_model = VERIFY_SECOND_PASS_MODEL
            sp_steps = VERIFY_SECOND_PASS_STEPS
        logging.info(
            "Finite bridge second_pass: enabled=%s model=%s steps=%s",
            sp_enabled, sp_model or "(default)", sp_steps,
        )

        # 【兼容修复】audio_mode 归一化：中文描述/英文旧值 → "reference" / "locked"
        _am = str(audio_mode or "").strip()
        _am_lower = _am.lower()
        if "参考" in _am or "reference" in _am_lower:
            audio_mode = "reference"
        elif "强制" in _am or "locked" in _am_lower:
            audio_mode = "locked"
        else:
            audio_mode = "reference"

        bundle = media_bundle if isinstance(media_bundle, dict) else {}
        image_paths = dict(bundle.get("image_paths") or {})
        audio_paths = dict(bundle.get("audio_paths") or {})

        prompt_text = str(prompt or "").strip()
        width = int(width)
        height = int(height)

        all_images = [
            {"file": str(image_paths[i]), "id": f"img-{i}"}
            for i in sorted(image_paths.keys())
            if image_paths[i]
        ]
        sorted_audio_keys = sorted(audio_paths.keys())
        if audio_mode == "locked" and sorted_audio_keys:
            sorted_audio_keys = sorted_audio_keys[:1]
        all_audios = [
            {"file": str(audio_paths[i]), "id": f"aud-{i}", "audioMode": audio_mode}
            for i in sorted_audio_keys
            if audio_paths[i]
        ]

        segments_spec = _parse_segments_input(segments_json)

        # 【L2-c】单段模式下也支持图片过滤：如果 segments_json 是 1 段且提供了 images，
        # 用它过滤 all_images，避免未引用素材污染采样器。
        if segments_spec is not None and len(segments_spec) == 1:
            _seg0 = segments_spec[0]
            _idx = _seg0.get("images")
            if isinstance(_idx, list) and _idx:
                _filtered = [
                    all_images[int(i)] for i in _idx
                    if 0 <= int(i) < len(all_images)
                ]
                if _filtered:
                    all_images = _filtered
                    logging.info(
                        "Finite bridge single: filtered images to %d (from user references)",
                        len(_filtered),
                    )
            # 单段：清空 spec，让后续逻辑走原有的单段分支（plan version 4 不变）
            segments_spec = None

        if segments_spec is None:
            seconds = float(duration_sec) if duration_sec else 5.0
            length = _aligned_h3_length(seconds)
            timeline = {
                "version": 9,
                "fps": H3_FPS,
                "globalPrompt": prompt_text,
                "images": list(all_images),
                "audios": list(all_audios),
                "videoClips": [],
                "selection": {"start": 0.0, "duration": seconds},
                "segmentConfig": {"count": 0, "activeIndex": 0, "mode": "timeline", "segments": []},
                "videoAudioEnabled": True,
                "secondPass": sp_enabled,
                "secondPassModel": sp_model,
                "secondPassHighSteps": sp_steps,
            }
            segment_plan = {
                "type": "MINIMAX_H3_TIMELINE_PLAN",
                "version": 1,
                "timeline": timeline,
                "width": width,
                "height": height,
                "generation_seconds": seconds,
                "length": length,
                "prompt_index": None,
                "segment_count": 1,
            }
            finite_plan = {
                "type": "minimax_h3_finite_segment_plan",
                "version": 4,
                "mode": "single_segment",
                "source_plan": segment_plan,
                "segment_count": 1,
                "segment_plans": [segment_plan],
                "prompts": [prompt_text],
                "overlap_frames": 0,
                "segment_overlaps": [0],
                "segment_lengths": [length],
                "target_output_frames": length,
                "second_pass": sp_enabled,
                "second_pass_model": sp_model,
                "second_pass_high_steps": sp_steps,
            }
            summary = _build_summary_single(
                all_images, all_audios, width, height, length, seconds, audio_mode
            )
            logging.info(
                "Finite bridge (single): %d image(s), %d audio(s), %dx%d, %d frames",
                len(all_images), len(all_audios), width, height, length,
            )
            return io.NodeOutput(finite_plan, summary)

        seg_plans = []
        seg_prompts = []
        seg_lengths = []
        seg_overlaps = []
        previous_end_frame = 0
        # 【L2-d】从 bridge_overlaps 解析每段重叠帧数；未设置时用默认 24
        parsed_overlaps = None
        raw_ov = str(bridge_overlaps or "").strip()
        if raw_ov:
            try:
                _p = json.loads(raw_ov)
                if isinstance(_p, list):
                    parsed_overlaps = [max(0, int(x)) for x in _p]
            except (ValueError, TypeError):
                logging.warning("bridge_overlaps is not a valid JSON array: %s", raw_ov)

        def _seg_overlap(idx):
            if idx == 0:
                return 0
            if parsed_overlaps is not None and idx < len(parsed_overlaps):
                return parsed_overlaps[idx]
            return DEFAULT_OVERLAP_FRAMES

        for idx, seg in enumerate(segments_spec):
            seg_dur = float(seg.get("duration") or 0)
            if seg_dur <= 0:
                raise ValueError(f"Segments[{idx}] duration must be > 0")
            seg_prompt = str(seg.get("prompt") or prompt_text).strip()
            seg_length = _aligned_h3_length(seg_dur)

            img_indices = seg.get("images")
            if isinstance(img_indices, list):
                seg_images = [
                    all_images[int(i)]
                    for i in img_indices
                    if 0 <= int(i) < len(all_images)
                ]
            else:
                seg_images = list(all_images)

            # 【L2-d】段起点 = 上一段终点 - 该段重叠帧（第一段为0）
            seg_ov = _seg_overlap(idx)
            start_frame = max(0, previous_end_frame - seg_ov)
            end_frame = start_frame + seg_length

            timeline = {
                "version": 9,
                "fps": H3_FPS,
                "globalPrompt": seg_prompt,
                "images": seg_images,
                "audios": list(all_audios),
                "videoClips": [],
                "selection": {"start": start_frame / H3_FPS, "duration": seg_dur},
                "segmentConfig": {"count": 0, "activeIndex": 0, "mode": "timeline", "segments": []},
                "videoAudioEnabled": True,
                "secondPass": sp_enabled,
                "secondPassModel": sp_model,
                "secondPassHighSteps": sp_steps,
            }
            seg_plan = {
                "type": "MINIMAX_H3_TIMELINE_PLAN",
                "version": 1,
                "timeline": timeline,
                "width": width,
                "height": height,
                "generation_seconds": seg_dur,
                "length": seg_length,
                "prompt_index": None,
                "segment_count": len(segments_spec),
            }
            seg_plans.append(seg_plan)
            seg_prompts.append(seg_prompt)
            seg_lengths.append(seg_length)
            seg_overlaps.append(seg_ov)
            previous_end_frame = end_frame

        total_overlap = sum(seg_overlaps)
        finite_plan = {
            "type": "minimax_h3_finite_segment_plan",
            "version": 3,
            "mode": "timeline_segments",
            "source_plan": seg_plans[0],
            "segment_count": len(seg_plans),
            "segment_plans": seg_plans,
            "prompts": seg_prompts,
            "overlap_frames": total_overlap,
            "segment_overlaps": seg_overlaps,
            "segment_lengths": seg_lengths,
            "target_output_frames": max(0, previous_end_frame - total_overlap),
            "second_pass": sp_enabled,
            "second_pass_model": sp_model,
            "second_pass_high_steps": sp_steps,
        }
        summary = _build_summary_single(
            all_images, all_audios, seg_plans, width, height, audio_mode,
            overlaps=seg_overlaps,
        )
        logging.info(
            "Finite bridge (multi): %d segment(s), %d image(s), %d audio(s), %dx%d, total %d frames",
            len(seg_plans), len(all_images), len(all_audios), width, height, previous_end_frame,
        )
        return io.NodeOutput(finite_plan, summary)


class MiniMaxH3FiniteBridgeExtension(ComfyExtension):
    async def get_node_list(self):
        return [MiniMaxH3FiniteBridgeGH]


def comfy_entrypoint():
    return MiniMaxH3FiniteBridgeExtension()


# ============ 【L3 二采】模型列表路由 ============
def _register_bridge_routes():
    try:
        instance = getattr(PromptServer, "instance", None)
        if instance is None:
            logging.warning("PromptServer.instance unavailable, bridge routes not registered")
            return
        if getattr(instance, "_gh_bridge_routes_done", False):
            return
        routes = instance.routes

        @routes.get("/minimax-bridge/upscalers")
        async def _list_upscalers(request):
            try:
                names = list(folder_paths.get_filename_list("latent_upscale_models"))
            except Exception as e:
                logging.warning("Failed to list latent_upscale_models: %s", e)
                names = []
            # 标记 H3 兼容的（文件名含 minimax_h3 + latent）
            h3_compat = [n for n in names if "minimax_h3" in n.lower() and "latent" in n.lower()]
            return web.json_response({"models": names, "h3_compatible": h3_compat})

        instance._gh_bridge_routes_done = True
        logging.info("Bridge routes registered: /minimax-bridge/upscalers")
    except Exception as e:
        logging.warning("Failed to register bridge routes: %s", e)


_register_bridge_routes()