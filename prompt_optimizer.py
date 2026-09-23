# Modified by aihaipan (2026-09) from goohai/Goohai-MiniMax-H3_Integration.
# Licensed under GPL-3.0-or-later. See LICENSE for full text.


from __future__ import annotations

import asyncio
import base64
from difflib import SequenceMatcher
import gc
import json
import os
import platform
from pathlib import Path
import re
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request

import aiohttp
from aiohttp import web
import folder_paths
from server import PromptServer


DEFAULT_CONFIG = {
    "mode": "api",
    "provider": "runninghub",
    "api_url": "https://www.runninghub.cn/openapi/v2",
    "api_key": "",
    "model": "openai/gpt-5.6-sol",
    "protocol": "runninghub",
    "read_media": True,
    "output_language": "中文",
    "template": "minimax_h3",
    "local_model": "",
    "local_mmproj": "",
    "local_device": "cuda",
    "max_tokens": 4096,
    "auto_optimize": False,
    "custom_system_prompt": "",
}
PROVIDERS = {
    "openai": ("https://api.openai.com/v1", "gpt-4.1-mini", "openai"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash", "gemini"),
    "openrouter": ("https://openrouter.ai/api/v1", "google/gemini-2.5-flash", "openai"),
    "dashscope": ("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-vl-max", "openai"),
    "siliconflow": ("https://api.siliconflow.cn/v1", "Qwen/Qwen2.5-VL-72B-Instruct", "openai"),
    "runninghub": ("https://www.runninghub.cn/openapi/v2", "openai/gpt-5.6-sol", "runninghub"),
    "runninghub_overseas": ("https://www.runninghub.ai/openapi/v2", "openai/gpt-5.6-sol", "runninghub"),
}
# Target-model prompt templates. The id is stored in the node's optimizer
# settings ("template"); the Python side turns it into a dedicated system
# prompt, and the JS side offers it in the node toolbar and settings dialog.
# Keep the ids here and in minimax_h3_integration.js PROMPT_TEMPLATES in sync.
TEMPLATE_LABELS = {
    "minimax_h3": "MiniMax H3",
    "image": "Image Prompt",
    "ltx_2_5": "LTX 2.5",
    "seedance_2_5": "Seedance 2.5",
    "wan_2_2": "Wan 2.2",
    "flux_2": "FLUX.2",
    "z_image": "Z-Image",
    "kling": "Kling 可灵",
    "hunyuan_video": "HunyuanVideo 混元视频",
    "veo_3": "Veo 3",
    "sora_2": "Sora 2",
    "custom": "自定义模板",
}
TEMPLATE_IDS = frozenset(TEMPLATE_LABELS)


def _normalize_template(value) -> str:
    template = str(value or "").strip().lower()
    if template in TEMPLATE_IDS:
        return template
    compact = re.sub(r"[\s._-]+", "", template)
    aliases = {
        "seedance25": "seedance_2_5",
        "ltx25": "ltx_2_5", "ltxvideo25": "ltx_2_5",
        "wan22": "wan_2_2",
        "flux2": "flux_2",
        "zimage": "z_image",
        "hunyuan": "hunyuan_video", "hunyuanvideo": "hunyuan_video",
        "veo3": "veo_3", "sora2": "sora_2",
    }
    return aliases.get(compact, "minimax_h3")
RUNNINGHUB_APP_ID = "2089252473927196673"
RUNNINGHUB_OVERSEAS_APP_ID = "2090668262521675778"
RUNNINGHUB_APP_NODES = {
    "runninghub": {
        "video": "11",
        "images": ("2", "12", "13", "14", "15", "16", "17", "18"),
        "model": "1",
        "system_prompt": "9",
        "user_prompt": "10",
        "max_tokens": "19",
    },
    "runninghub_overseas": {
        "video": "11",
        "images": ("20", "12", "13", "14", "15", "16", "17", "18"),
        "model": "1",
        "system_prompt": "10",
        "user_prompt": "9",
        "max_tokens": "21",
    },
}
RUNNINGHUB_MODELS = (
    "openai/gpt-5.6-sol", "openai/gpt-5.6-sol-saver", "openai/gpt-5.6-terra",
    "openai/gpt-5.6-terra-saver", "openai/gpt-5.5", "openai/gpt-5.5-saver",
    "openai/gpt-5.6-luna", "openai/gpt-5.6-luna-saver", "google/gemini-3.1-flash-lite-preview",
    "google/gemini-3.5-flash", "openai/gpt-5.5-pro", "anthropic/claude-fable-5",
    "openai/gpt-5.4-pro", "anthropic/claude-opus-5", "anthropic/claude-opus-4.8",
    "anthropic/claude-opus-4.7", "glm-5.2", "anthropic/claude-opus-4.6", "openai/gpt-5.4",
    "openai/gpt-5.3-codex", "glm-5.1", "glm-5-turbo", "qwen/qwen3.8-max",
    "anthropic/claude-sonnet-4.6", "glm-5", "anthropic/claude-sonnet-5",
    "qwen/qwen3.7-max", "glm-5v-turbo", "qwen/qwen3.7-plus", "deepseek/deepseek-v4-pro",
    "xai/grok-4.6", "xai/grok-4.5", "xai/grok-4.3", "qwen/qwen3.6-plus",
    "google/gemini-3.1-pro-preview", "bytedance/doubao-seed-evolving",
    "bytedance/doubao-seed-2.1-pro", "anthropic/claude-sonnet-4.5",
    "bytedance/doubao-seed-2.1-turbo", "anthropic/claude-opus-4.5",
    "bytedance/doubao-seed-2.0-pro", "bytedance/doubao-seed-2.0-code",
    "deepseek/deepseek-v4-flash", "qwen/qwen3.6-flash", "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano", "google/gemini-3-flash-preview", "google/gemini-2.5-flash",
    "bytedance/doubao-seed-2.0-lite", "bytedance/doubao-seed-2.0-mini",
    "minimax/minimax-m2.7", "anthropic/claude-haiku-4.5", "qwen/qwen3.6-max-preview",
    "anthropic/claude-haiku-4.5-saver", "anthropic/claude-opus-4.6-saver",
    "anthropic/claude-opus-4.7-saver", "anthropic/claude-opus-4.8-saver",
    "anthropic/claude-sonnet-4.6-saver", "google/gemini-2.5-pro",
    "google/gemini-3.5-flash-lite", "google/gemini-3.6-flash",
)
RUNNINGHUB_DETAIL_URL = f"https://www.runninghub.cn/call-api/api-detail/{RUNNINGHUB_APP_ID}?apiType=4"
RUNNINGHUB_OVERSEAS_DETAIL_URL = f"https://www.runninghub.ai/zh-cn/call-api/api-detail/{RUNNINGHUB_OVERSEAS_APP_ID}?apiType=4"
_RUNNINGHUB_MODELS_CACHE: tuple[str, ...] = RUNNINGHUB_MODELS
_RUNNINGHUB_OVERSEAS_MODELS_CACHE: tuple[str, ...] = RUNNINGHUB_MODELS
_RUNNINGHUB_MODELS_LOCK = asyncio.Lock()
_ROUTES_REGISTERED = False
_ACTIVE_REQUESTS: dict[str, asyncio.Task] = {}
_ACTIVE_CANCEL_EVENTS: dict[str, threading.Event] = {}
_ACTIVE_RH_TASKS: dict[str, tuple[str, str, str]] = {}
_ASYNC_OPTIMIZER_JOBS: dict[str, asyncio.Task] = {}
_GGUF_LOCK = threading.RLock()
_GGUF_MODEL = None
_GGUF_HANDLER = None
_GGUF_CONFIG: tuple[str, str, str] | None = None


def _llm_roots() -> list[Path]:
    # This package lives in ComfyUI/custom_nodes/<package>; keep the model
    # location deterministic for both desktop and hosted ComfyUI installs.
    # Linux paths are case-sensitive, while Windows paths are not. Hosted
    # users commonly create ``models/LLM`` instead of the documented
    # ``models/llm``; resolve the directory case-insensitively so both work.
    models_root = Path(__file__).resolve().parents[2] / "models"
    preferred = models_root / "llm"
    matching: list[Path] = []
    if models_root.is_dir():
        try:
            matching = sorted(
                (item for item in models_root.iterdir() if item.is_dir() and item.name.casefold() == "llm"),
                key=lambda item: (item.name != "llm", item.name),
            )
        except OSError:
            matching = []
    # Keep the canonical path when no matching directory has been created yet;
    # callers can still report an empty model list without raising.  When both
    # ``llm`` and ``LLM`` exist (common on hosted Linux instances), scan both.
    return matching or [preferred]


def _llm_root() -> Path:
    """Return the primary model root for backwards-compatible callers."""
    return _llm_roots()[0]


def _is_visual_model(path: Path) -> bool:
    if not path.is_dir() or not (path / "config.json").is_file():
        return False
    try:
        config = json.loads((path / "config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    text = json.dumps(config, ensure_ascii=False).lower()
    markers = (
        "qwen2-vl", "qwen2.5-vl", "qwen3-vl", "qwen-vl", "qwen2_vl", "qwen2_5_vl", "qwen3_vl",
        "vision", "visual", "gemma3", "gemma-3", "minicpm-v", "internvl",
    )
    if not any(marker in text for marker in markers):
        return False
    return any((path / name).exists() for name in ("processor_config.json", "preprocessor_config.json", "tokenizer_config.json"))


def _is_mmproj(path: Path) -> bool:
    name = path.name.lower()
    return path.is_file() and path.suffix.lower() == ".gguf" and any(
        marker in name for marker in ("mmproj", "mm-projector", "projector")
    )


_GGUF_PRECISION_SUFFIX = re.compile(
    r"(?:[-_.](?:q\d+(?:[_-][a-z0-9]+)*|iq\d+(?:[_-][a-z0-9]+)*|f16|f32|fp16|fp32|bf16))+$",
    re.IGNORECASE,
)


def _gguf_identity(name: str, *, projector: bool = False) -> str:
    stem = Path(name).stem
    if projector:
        stem = re.sub(r"^(?:mmproj|mm-projector|projector)[-_. ]*", "", stem, flags=re.IGNORECASE)
    stem = _GGUF_PRECISION_SUFFIX.sub("", stem)
    return re.sub(r"[^a-z0-9]+", "", stem.lower())


def _gguf_model_signature(name: str) -> tuple[str, str] | None:
    """Return a stable model family/version and parameter size from loose filenames."""
    normalized = Path(name).stem.lower().replace("_", "-")
    family = re.search(r"(qwen\s*-?\s*3(?:[.\-]?\d+)?(?:\s*-?\s*vl)?)", normalized)
    size = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*b(?![a-z])", normalized)
    if not family or not size:
        return None
    family_key = re.sub(r"[^a-z0-9]+", "", family.group(1))
    return family_key, f"{size.group(1)}b"


def _matching_mmproj(model_path: Path) -> list[Path]:
    identity = _gguf_identity(model_path.name)
    projectors = [
        path
        for root in _llm_roots() if root.is_dir()
        for path in root.rglob("*.gguf") if _is_mmproj(path)
    ]
    exact = [path for path in projectors if _gguf_identity(path.name, projector=True) == identity]
    if exact:
        return sorted(exact, key=lambda path: path.name.lower())
    # Projectors are commonly named only by model generation and parameter
    # size, while the main model may add UD, publisher or quantization tokens.
    # First keep only the same model/version/size, then choose the closest name.
    signature = _gguf_model_signature(model_path.name)
    compatible = [path for path in projectors if signature and _gguf_model_signature(path.name) == signature]
    pool = compatible or projectors
    scored = []
    for path in pool:
        candidate = _gguf_identity(path.name, projector=True)
        containment = 1 if identity in candidate or candidate in identity else 0
        ratio = SequenceMatcher(None, identity, candidate).ratio()
        scored.append(((containment, ratio), path))
    if not scored:
        return []
    best = max(score for score, _path in scored)
    # If no family/size match exists, stay conservative and reject weak names.
    if not compatible and best[0] == 0 and best[1] < 0.72:
        return []
    return sorted(
        [path for score, path in scored if score == best],
        key=lambda path: path.name.lower(),
    )


def _gguf_handler_name(path: Path) -> str | None:
    name = path.name.lower()
    # Qwen 3.5 系列（含 3.8 等，官方定制版）
    if re.search(r"qwen[-_. ]?3[._-]?(?:5|6|8)", name):
        return "qwen35"
    # Qwen 3-VL 通用系列
    if "qwen3-vl" in name or "qwen3vl" in name:
        return "qwen3vl"
    # Qwen 2.5-VL
    if re.search(r"qwen2[._-]?5[-_.]?vl", name):
        return "qwen25vl"
    # Gemma 3（12B / 27B 等；避免误伤 gemma-30b 这类假想名字）
    if re.search(r"gemma[-_. ]?3(?!\d)", name):
        return "gemma3"
    # MiniCPM-V 系列（含 2.6 / 4.0 等）
    if "minicpm" in name:
        return "minicpmv"
    return None


def _model_records(paths: list[tuple[Path, Path]]) -> list[tuple[Path, Path, str]]:
    """Assign stable relative IDs, qualifying only cross-root name collisions."""
    counts: dict[str, int] = {}
    for root, path in paths:
        relative = path.relative_to(root).as_posix()
        counts[relative.casefold()] = counts.get(relative.casefold(), 0) + 1
    return [
        (
            root,
            path,
            f"{root.name}/{relative}" if counts[relative.casefold()] > 1 else relative,
        )
        for root, path in paths
        for relative in (path.relative_to(root).as_posix(),)
    ]


def _scan_visual_models() -> list[dict]:
    result = []
    roots = _llm_roots()
    transformer_paths = []
    gguf_paths = []
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
            if _is_visual_model(path):
                transformer_paths.append((root, path))
        for path in sorted(root.rglob("*.gguf"), key=lambda item: str(item).lower()):
            if not _is_mmproj(path) and _gguf_handler_name(path) is not None:
                gguf_paths.append((root, path))
    for _root, path, relative in _model_records(transformer_paths):
        result.append({"name": path.name, "path": str(path), "relative_path": relative, "format": "transformers"})
    mmproj_by_path = {str(Path(item["path"]).absolute()): item["relative_path"] for item in _scan_mmproj_models()}
    for _root, path, relative in _model_records(gguf_paths):
        candidate_names = [
            mmproj_by_path[str(candidate.absolute())]
            for candidate in _matching_mmproj(path)
            if str(candidate.absolute()) in mmproj_by_path
        ]
        result.append({
            "name": path.name,
            "path": str(path),
            "relative_path": relative,
            "format": "gguf",
            "mmproj_candidates": candidate_names,
        })
    return result


def _scan_mmproj_models() -> list[dict]:
    paths = []
    for root in _llm_roots():
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.gguf"), key=lambda item: str(item).lower()):
            if _is_mmproj(path):
                paths.append((root, path))
    return [
        {"name": path.name, "path": str(path), "relative_path": relative}
        for _root, path, relative in _model_records(paths)
    ]


def _find_visual_model(selected: str) -> dict | None:
    return next((item for item in _scan_visual_models() if item["relative_path"] == selected), None)


def _normalize_config(data: dict | None) -> dict:
    current = DEFAULT_CONFIG
    data = data if isinstance(data, dict) else {}
    provider = str(data.get("provider") or current["provider"]).lower()
    preset = PROVIDERS.get(provider)
    api_keys = data.get("api_keys") if isinstance(data.get("api_keys"), dict) else {}
    # RunningHub CN and overseas accounts use different API keys. Prefer the
    # key saved for the selected provider so a stale generic api_key cannot be
    # sent to the other region after switching platforms or restoring a
    # workflow. Keep the legacy api_key fallback for older saved workflows.
    provider_api_key = api_keys.get(provider)
    api_key = provider_api_key if provider_api_key is not None else (
        data.get("api_key") if "api_key" in data else current["api_key"]
    )
    provider_models = data.get("provider_models") if isinstance(data.get("provider_models"), dict) else {}
    provider_model = provider_models.get(provider)
    try:
        max_tokens = int(data.get("max_tokens", current.get("max_tokens", 4096)))
    except (TypeError, ValueError):
        max_tokens = 4096
    max_tokens = max(512, min(8192, max_tokens))
    config = {
        "mode": "local" if str(data.get("mode") or current.get("mode") or "api").lower() == "local" else "api",
        "provider": provider,
        "api_url": str(data.get("api_url") or (preset[0] if preset else current["api_url"])).strip(),
        "api_key": str(api_key or ""),
        "api_keys": {str(key): str(value or "") for key, value in api_keys.items()},
        "model": str(provider_model or data.get("model") or (preset[1] if preset else current["model"])).strip(),
        "provider_models": {str(key): str(value or "") for key, value in provider_models.items()},
        "protocol": str(data.get("protocol") or (preset[2] if preset else current["protocol"])).lower(),
        "read_media": bool(data.get("read_media", current["read_media"])),
        "output_language": "中文" if str(data.get("output_language") or current.get("output_language") or "中文").lower() in {"中文", "chinese", "zh"} else "English",
        "template": _normalize_template(data.get("template") or current.get("template")),
        "local_model": str(data.get("local_model") or current.get("local_model") or "").strip(),
        "local_mmproj": str(data.get("local_mmproj") or current.get("local_mmproj") or "").strip(),
        "local_device": str(data.get("local_device") or current.get("local_device") or "cuda").lower(),
        "max_tokens": max_tokens,
        "auto_optimize": bool(data.get("auto_optimize", current.get("auto_optimize", False))),
        "custom_system_prompt": str(data.get("custom_system_prompt") or current.get("custom_system_prompt") or "").strip(),
    }
    return config


def _public_config(config: dict) -> dict:
    return {
        **config,
        "api_key": "",
        "has_api_key": bool(config.get("api_key")),
        "runninghub_models": list(_RUNNINGHUB_MODELS_CACHE),
        "runninghub_overseas_models": list(_RUNNINGHUB_OVERSEAS_MODELS_CACHE),
    }


def _runninghub_models_from_page(html: str) -> tuple[str, ...]:
    """Extract node 1 model choices from the public RunningHub Nuxt payload."""
    match = re.search(
        r'<script[^>]+id=["\']__NUXT_DATA__["\'][^>]*>([\s\S]*?)</script>',
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        return ()
    try:
        payload = json.loads(match.group(1))
    except (TypeError, ValueError):
        return ()
    candidates = []
    for value in payload if isinstance(payload, list) else ():
        if not isinstance(value, str) or not value.startswith("[["):
            continue
        try:
            field_data = json.loads(value)
        except (TypeError, ValueError):
            continue
        if not isinstance(field_data, list) or not field_data or not isinstance(field_data[0], list):
            continue
        models = [str(item).strip() for item in field_data[0] if isinstance(item, str) and str(item).strip()]
        if len(models) >= 5 and sum("/" in item for item in models) >= 3:
            candidates.append(models)
    if not candidates:
        return ()
    return tuple(dict.fromkeys(max(candidates, key=len)))


async def _refresh_runninghub_models(provider: str = "runninghub") -> tuple[str, ...]:
    global _RUNNINGHUB_MODELS_CACHE, _RUNNINGHUB_OVERSEAS_MODELS_CACHE
    overseas = provider == "runninghub_overseas"
    detail_url = RUNNINGHUB_OVERSEAS_DETAIL_URL if overseas else RUNNINGHUB_DETAIL_URL
    async with _RUNNINGHUB_MODELS_LOCK:
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=True) as session:
            async with session.get(detail_url) as response:
                if response.status != 200:
                    raise RuntimeError(f"RunningHub model list returned HTTP {response.status}")
                models = _runninghub_models_from_page(await response.text())
                if not models:
                    raise RuntimeError("RunningHub model list was not found in the application detail")
                if overseas:
                    _RUNNINGHUB_OVERSEAS_MODELS_CACHE = models
                else:
                    _RUNNINGHUB_MODELS_CACHE = models
                return models


def _resolve_input_file(name: str) -> Path:
    value = str(name or "").strip()
    if not value:
        raise ValueError("参考素材文件名为空")
    annotated = folder_paths.get_annotated_filepath(value)
    if annotated and os.path.isfile(annotated):
        return Path(annotated)
    path = Path(folder_paths.get_input_directory()) / value
    if path.is_file():
        return path
    raise FileNotFoundError(f"找不到参考素材: {value}")


def _ffmpeg_path() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("RunningHub 视频预处理需要 FFmpeg，但当前 ComfyUI 环境未找到 FFmpeg") from error


async def _runninghub_video(source_name: str, duration: float, output_path: Path) -> None:
    source = _resolve_input_file(source_name)
    limit = max(0.1, float(duration or 5))
    # fps=1 chooses one frame for every source second without changing source
    # playback speed. Audio is trimmed at the same point and copied at normal speed.
    command = [
        _ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-t", f"{limit:.3f}",
        "-vf", "fps=1:start_time=0:round=down,scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-r", "1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", str(output_path),
    ]
    process = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _stdout, stderr = await process.communicate()
    if process.returncode:
        raise RuntimeError("RunningHub 参考视频预处理失败: " + stderr.decode("utf-8", "replace")[-1000:])


async def _runninghub_upload(session: aiohttp.ClientSession, api_key: str, *, path: Path | None = None,
                             data_url: str | None = None, filename: str = "reference.jpg",
                             api_base: str = "https://www.runninghub.cn/openapi/v2") -> str:
    form = aiohttp.FormData()
    if path is not None:
        form.add_field("file", path.read_bytes(), filename=path.name, content_type="video/mp4")
    else:
        try:
            header, encoded = str(data_url or "").split(",", 1)
            mime = header.split(";", 1)[0].split(":", 1)[1]
            form.add_field("file", base64.b64decode(encoded), filename=filename, content_type=mime)
        except Exception as error:
            raise ValueError("RunningHub 参考图片数据无效") from error
    async with session.post(
        f"{api_base}/media/upload/binary",
        headers={"Authorization": f"Bearer {api_key}"}, data=form,
    ) as response:
        body = await response.text()
        if response.status >= 400:
            raise RuntimeError(f"RunningHub 素材上传失败 ({response.status}): {body[:1000]}")
        data = json.loads(body)
    if data.get("code") not in (0, "0", None):
        raise RuntimeError(f"RunningHub 素材上传失败: {data.get('message') or data.get('msg') or data}")
    result = data.get("data") or {}
    value = result.get("fileName") or result.get("download_url")
    if not value:
        raise RuntimeError("RunningHub 素材上传响应缺少 fileName")
    return str(value)


async def _runninghub_cancel(api_key: str, task_id: str, host: str = "https://www.runninghub.cn") -> None:
    if not api_key or not task_id:
        return
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{host}/task/openapi/cancel",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"apiKey": api_key, "taskId": task_id},
        ) as response:
            await response.read()


async def _runninghub_result_text(session: aiohttp.ClientSession, results: list) -> str:
    for item in results:
        if isinstance(item, dict) and str(item.get("text") or "").strip():
            return str(item["text"]).strip()
    for item in results:
        if not isinstance(item, dict):
            continue
        output_type = str(item.get("outputType") or item.get("fileType") or "").lower().lstrip(".")
        url = item.get("url") or item.get("fileUrl")
        if output_type not in {"txt", "text"} or not url:
            continue
        async with session.get(str(url)) as response:
            body = await response.read()
            if response.status >= 400:
                raise RuntimeError(f"RunningHub TXT 结果下载失败 ({response.status})")
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                return body.decode(encoding).strip()
            except UnicodeDecodeError:
                continue
    raise RuntimeError("RunningHub 返回结果中没有文本或 TXT 文件")


def _local_model_path(config: dict) -> Path:
    selected = str(config.get("local_model") or "").strip()
    if not selected:
        raise ValueError("请先选择本地视觉模型")
    found = _find_visual_model(selected)
    if found is None:
        raise ValueError("所选本地模型不存在，或不是可识别的视觉模型")
    return Path(found["path"])


def _selected_local_model(config: dict) -> dict:
    selected = str(config.get("local_model") or "").strip()
    found = _find_visual_model(selected)
    if found is None:
        raise ValueError("所选本地模型不存在，或不是可识别的视觉模型")
    return found


def _selected_mmproj(config: dict, model: dict) -> Path:
    candidates = list(model.get("mmproj_candidates") or [])
    selected = str(config.get("local_mmproj") or "").strip()
    if selected:
        available = {item["relative_path"]: item for item in _scan_mmproj_models()}
        item = available.get(selected)
        if item is None:
            raise ValueError("已选择的mmproj视觉模型不存在，请重新选择")
        path = Path(item["path"])
        if not path.is_file():
            raise ValueError("已选择的mmproj文件不存在")
        return path
    if not candidates:
        raise ValueError("未找到与当前GGUF模型匹配的mmproj视觉模型")
    if len(candidates) > 1:
        raise ValueError("检测到多个匹配的mmproj视觉模型，请在配置页面选择一个版本")
    available = {item["relative_path"]: item for item in _scan_mmproj_models()}
    item = available.get(candidates[0])
    if item is None or not Path(item["path"]).is_file():
        raise ValueError("自动匹配的mmproj视觉模型不存在，请重新选择")
    return Path(item["path"])


def _cuda_tag() -> str | None:
    try:
        import torch
        value = str(torch.version.cuda or "")
    except Exception:
        value = ""
    match = re.match(r"(\d+)\.(\d+)", value)
    return f"cu{match.group(1)}{match.group(2)}" if match else None


def _gguf_dependency_status() -> dict:
    system = platform.system().lower()
    machine = platform.machine().lower()
    python_tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
    cuda_tag = _cuda_tag()
    platform_tag = "win_amd64" if system == "windows" and machine in {"amd64", "x86_64"} else (
        "linux_x86_64" if system == "linux" and machine in {"amd64", "x86_64"} else None
    )
    status = {
        "available": False,
        "reason": "",
        "system": platform.system(),
        "machine": platform.machine(),
        "python_tag": python_tag,
        "cuda_tag": cuda_tag or "",
        "release_url": "https://github.com/JamePeng/llama-cpp-python/releases",
        "wheel_url": "",
        "wheel_name": "",
    }
    try:
        import llama_cpp
        from llama_cpp.llama_chat_format import Qwen35ChatHandler  # noqa: F401
        status["available"] = True
        status["version"] = str(getattr(llama_cpp, "__version__", "unknown"))
        return status
    except Exception as error:
        status["reason"] = str(error)
    if system == "darwin":
        status["release_url"] = "https://github.com/JamePeng/llama-cpp-python/releases"
        return status
    if not cuda_tag or not platform_tag:
        return status
    # JamePeng release assets follow a stable version/cuda/python/platform
    # naming scheme. Resolve the current latest matching asset when online.
    try:
        request = urllib.request.Request(
            "https://api.github.com/repos/JamePeng/llama-cpp-python/releases?per_page=30",
            headers={"User-Agent": "Goohai-MiniMax-H3-Integration"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            releases = json.load(response)
        marker = f"-{cuda_tag}-{'win' if system == 'windows' else 'linux'}-"
        for release in releases:
            if marker not in str(release.get("tag_name") or ""):
                continue
            for asset in release.get("assets") or []:
                name = str(asset.get("name") or "")
                if python_tag in name and platform_tag in name:
                    status["wheel_name"] = name
                    status["wheel_url"] = str(asset.get("browser_download_url") or "")
                    status["release_url"] = str(release.get("html_url") or status["release_url"])
                    return status
    except Exception:
        pass
    return status


def _unload_gguf_model() -> bool:
    global _GGUF_MODEL, _GGUF_HANDLER, _GGUF_CONFIG
    with _GGUF_LOCK:
        loaded = _GGUF_MODEL is not None or _GGUF_HANDLER is not None
        try:
            if _GGUF_MODEL is not None:
                _GGUF_MODEL.close()
        except Exception:
            pass
        try:
            stack = getattr(_GGUF_HANDLER, "_exit_stack", None)
            if stack is not None:
                stack.close()
        except Exception:
            pass
        _GGUF_MODEL = _GGUF_HANDLER = _GGUF_CONFIG = None
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    return loaded


def _data_url_image(data_url: str):
    from io import BytesIO
    from PIL import Image
    _header, encoded = str(data_url).split(",", 1)
    return Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")


def _unload_comfy_models() -> None:
    """Release ComfyUI-managed models and cached allocations before/after local VLM use."""
    from comfy import model_management

    model_management.unload_all_models()
    gc.collect()
    model_management.soft_empty_cache()


def _local_generate(config: dict, payload: dict) -> str:
    """Run one local VLM request with ComfyUI models unloaded on both sides."""
    _unload_comfy_models()
    try:
        return _local_generate_impl(config, payload)
    finally:
        _unload_comfy_models()


def _local_generate_impl(config: dict, payload: dict) -> str:
    """Load one local VLM only for this request, then release its objects."""
    model_path = _local_model_path(config)
    if model_path.suffix.lower() == ".gguf":
        return _gguf_generate(config, payload)
    model = processor = inputs = output = generated = None
    try:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor, StoppingCriteria, StoppingCriteriaList
        cancel_event = payload.get("_cancel_event")

        class CancelledStoppingCriteria(StoppingCriteria):
            def __call__(self, input_ids, scores, **kwargs):
                return bool(cancel_event and cancel_event.is_set())
        device = config.get("local_device")
        if device not in {"cpu", "cuda"}:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        processor = AutoProcessor.from_pretrained(str(model_path), trust_remote_code=True)
        model = AutoModelForImageTextToText.from_pretrained(
            str(model_path), torch_dtype=dtype, device_map="auto" if device == "cuda" else None,
            trust_remote_code=True,
        )
        if device == "cpu":
            model.to("cpu")
        user_prompt = str(payload.get("prompt") or "")
        media = payload.get("media") if isinstance(payload.get("media"), list) else []
        content = [{"type": "text", "text": "User prompt:\n" + user_prompt}]
        for item in media:
            label = str(item.get("label") or "")
            kind = str(item.get("kind") or "")
            if kind == "audio":
                content.append({"type": "text", "text": f"{label} is an uploaded audio reference; audio data is not transmitted."})
            else:
                for data_url in item.get("images") or []:
                    content.append({"type": "image", "image": _data_url_image(data_url)})
                    content.append({"type": "text", "text": f"This visual belongs to {label}; use the label, never a filename."})
        system = _system_prompt(
            str(payload.get("task") or "T2VA"), float(payload.get("duration") or 5),
            [str(item.get("label")) for item in media if item.get("label")],
            str(config.get("output_language") or "English"),
            payload.get("context") if isinstance(payload.get("context"), dict) else {}, user_prompt,
            str(config.get("template") or "minimax_h3"),
            str(config.get("custom_system_prompt") or ""),
        )
        messages = [{"role": "system", "content": [{"type": "text", "text": system}]}, {"role": "user", "content": content}]
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        images = [part["image"] for part in content if part.get("type") == "image"]
        inputs = processor(text=[text], images=images or None, padding=True, return_tensors="pt")
        input_device = next(model.parameters()).device
        inputs = {key: value.to(input_device) if hasattr(value, "to") else value for key, value in inputs.items()}
        with torch.inference_mode():
            output = model.generate(
                **inputs, max_new_tokens=int(config.get("max_tokens") or 4096), do_sample=False,
                stopping_criteria=StoppingCriteriaList([CancelledStoppingCriteria()]),
            )
        if cancel_event and cancel_event.is_set():
            raise RuntimeError("提示词优化已取消")
        generated = output[:, inputs["input_ids"].shape[1]:]
        return processor.batch_decode(generated, skip_special_tokens=True)[0].strip()
    finally:
        output = generated = inputs = model = processor = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def _gguf_generate(config: dict, payload: dict) -> str:
    global _GGUF_MODEL, _GGUF_HANDLER, _GGUF_CONFIG
    dependency = _gguf_dependency_status()
    if not dependency.get("available"):
        suffix = f"\n下载地址: {dependency['wheel_url']}" if dependency.get("wheel_url") else (
            f"\n发布页面: {dependency['release_url']}"
        )
        raise RuntimeError(
            "GGUF视觉模型依赖不可用。"
            f"当前环境: {dependency['system']} {dependency['machine']} / {dependency['python_tag']} / "
            f"{dependency.get('cuda_tag') or '无CUDA'}。{suffix}\n安装后请重启ComfyUI。"
        )
    model = _selected_local_model(config)
    model_path = Path(model["path"])
    mmproj_path = _selected_mmproj(config, model)
    handler_name = _gguf_handler_name(model_path)
    if handler_name not in {"qwen35", "qwen3vl", "qwen25vl", "gemma3", "minicpmv"}:
        raise ValueError("当前GGUF视觉模型类型暂不支持")
    cancel_event = payload.get("_cancel_event")
    target_config = (str(model_path), str(mmproj_path), handler_name)
    try:
        from llama_cpp import Llama
        from llama_cpp.llama_chat_format import Qwen35ChatHandler, Qwen3VLChatHandler
        # 不同版本的 llama-cpp-python handler 命名可能有差异，逐个 try
        try:
            from llama_cpp.llama_chat_format import Qwen25VLChatHandler
        except ImportError:
            Qwen25VLChatHandler = None
        try:
            from llama_cpp.llama_chat_format import Gemma3ChatHandler
        except ImportError:
            Gemma3ChatHandler = None
        try:
            from llama_cpp.llama_chat_format import MiniCPMv26ChatHandler
        except ImportError:
            MiniCPMv26ChatHandler = None
        with _GGUF_LOCK:
            if _GGUF_MODEL is None or _GGUF_CONFIG != target_config:
                _unload_gguf_model()
                if handler_name == "qwen35":
                    handler_cls = Qwen35ChatHandler
                elif handler_name == "qwen3vl":
                    handler_cls = Qwen3VLChatHandler
                elif handler_name == "qwen25vl":
                    if Qwen25VLChatHandler is None:
                        raise ValueError("当前 llama-cpp-python 版本不支持 Qwen2.5-VL，请升级到最新版")
                    handler_cls = Qwen25VLChatHandler
                elif handler_name == "gemma3":
                    if Gemma3ChatHandler is None:
                        raise ValueError("当前 llama-cpp-python 版本不支持 Gemma 3，请升级到最新版")
                    handler_cls = Gemma3ChatHandler
                elif handler_name == "minicpmv":
                    if MiniCPMv26ChatHandler is None:
                        raise ValueError("当前 llama-cpp-python 版本不支持 MiniCPM-V，请升级到最新版")
                    handler_cls = MiniCPMv26ChatHandler
                else:
                    raise ValueError(f"未知的视觉模型类型: {handler_name}")
                kwargs = {"clip_model_path": str(mmproj_path), "verbose": False}
                if handler_name == "qwen35":
                    kwargs["enable_thinking"] = False
                elif handler_name == "qwen3vl":
                    kwargs["force_reasoning"] = False
                _GGUF_HANDLER = handler_cls(**kwargs)
                _GGUF_MODEL = Llama(
                    model_path=str(model_path), chat_handler=_GGUF_HANDLER,
                    n_gpu_layers=-1, n_ctx=16384, verbose=False,
                )
                _GGUF_CONFIG = target_config
        user_prompt = str(payload.get("prompt") or "")
        media = payload.get("media") if isinstance(payload.get("media"), list) else []
        labels = [str(item.get("label")) for item in media if item.get("label")]
        system = _system_prompt(
            str(payload.get("task") or "T2VA"), float(payload.get("duration") or 5), labels,
            str(config.get("output_language") or "English"),
            payload.get("context") if isinstance(payload.get("context"), dict) else {}, user_prompt,
            str(config.get("template") or "minimax_h3"),
            str(config.get("custom_system_prompt") or ""),
        )
        content = [{"type": "text", "text": "User prompt:\n" + user_prompt}]
        for item in media:
            label = str(item.get("label") or "")
            if str(item.get("kind") or "") == "audio":
                content.append({"type": "text", "text": f"{label} is an uploaded audio reference; audio data is not transmitted."})
                continue
            for index, data_url in enumerate(item.get("images") or []):
                content.append({"type": "text", "text": f"{label} visual {index + 1}."})
                content.append({"type": "image_url", "image_url": {"url": data_url}})
        if cancel_event and cancel_event.is_set():
            raise RuntimeError("提示词优化已取消")
        with _GGUF_LOCK:
            result = _GGUF_MODEL.create_chat_completion(
                messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
                max_tokens=int(config.get("max_tokens") or 4096), temperature=0.2, top_p=0.9,
            )
        if cancel_event and cancel_event.is_set():
            raise RuntimeError("提示词优化已取消")
        return str(result["choices"][0]["message"]["content"] or "").removeprefix(": ").strip()
    finally:
        _unload_gguf_model()


def _endpoint(config: dict) -> str:
    base = config["api_url"].rstrip("/")
    if config["protocol"] == "gemini":
        if re.search(r":generateContent(?:\?|$)", base):
            return base
        return f"{base}/models/{urllib.parse.quote(config['model'], safe='-_.')}:generateContent"
    if config["protocol"] == "responses":
        return base if base.endswith("/responses") else f"{base}/responses"
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _system_prompt_minimax_h3(
    task: str,
    duration: float,
    labels: list[str],
    output_language: str = "English",
    context: dict | None = None,
    user_prompt: str = "",
) -> str:
    task_upper = task.upper()
    fl2va = task_upper == "FL2VA"
    full_reference = task_upper in {"REF2VA", "HYBRID"}
    context = context if isinstance(context, dict) else {}
    label_rule = (
        "FL2VA picture labels must be bare lowercase: picture 1 and picture 2, never angle brackets. "
        "This is a mandatory content requirement, not merely a label-format example: the final prompt must explicitly "
        "contain both exact tokens 'picture 1' and 'picture 2'. The first line must state that picture 1 is the exact "
        f"opening-frame anchor at 0.00s and picture 2 is the exact ending-frame anchor at {duration:.2f}s. Never omit, "
        "rename, translate, capitalize, or replace either token, even when the requested output language is Chinese."
        if fl2va else
        "All media labels must use angle brackets exactly, for example <picture 1>, <video 1>, <audio 1>."
    )
    if full_reference:
        structure = (
            "Return exactly these six sections in this order, with each heading followed by a colon: "
            "subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, "
            "non_diegetic_music. Formatting is strict: every section heading must occupy its own line; put a newline "
            "immediately after the colon, write that section's content on the following line, and put one blank line "
            "between sections. Never place a heading and its content on the same line, and never join multiple sections "
            "into one paragraph. In subject_definitions, define reusable visible content as <Subject N> and cite "
            "its source label using one short sentence and no more than four identifying visual traits; define "
            "standalone <Picture N> only for a concrete frame anchor. The <Subject N> index must strictly equal "
            "the numeric index of the source <picture N> label it references. For example, <picture 7> must be "
            "defined as <Subject 7>, even if no <picture 2> through <picture 6> exists. Never renumber, compress, "
            "or offset Subject indices based on array position or the number of items. If a Picture index is missing, "
            "leave the corresponding Subject index unused; do not shift other subjects into it. "
            "CRITICAL: Never omit any referenced <picture N> from subject_definitions. Even if it is <picture 1>, "
            "you must define it as <Subject 1> if it is referenced in the user's prompt or if it is a character. "
            "Do not leave S1 undefined or hallucinate that its identity is unclear. "
            "IMPORTANT: While strictly obeying this index mapping, you must still actively expand the user's "
            "idea into vivid, professional, and detailed actions, physical movements, camera movements, and a rich "
            "dramatic arc. Do not merely translate the user's input. Also, the visual content of each <picture N> "
            "must be strictly read from the uploaded images to correctly distinguish characters from scenes. "
            "Do not arbitrarily swap or reassign the identity of any character or scene. "
            "In summary, use one sentence beginning "
            "with a square-bracketed combination of only the relationships that apply: keyframe completion, "
            "reference generation, video editing, video continuation, audio reuse, or audio reference. In "
            "retention_analysis, write one compact line per label and use fully_preserved, partially_preserved, "
            "attribute_transfer, or weak_reference for visual content, and fully_copy, partially_copy, reference, "
            "or weak_reference for audio. A relationship marker alone is never a complete entry. Every line must use "
            "the exact form '<label>: marker - explanation' and add a concise, concrete explanation after the hyphen. "
            "For fully_preserved, state which identity, appearance, scene, composition, or structural properties remain "
            "unchanged in the target. For attribute_transfer, state exactly which appearance, motion, scene, camera, "
            "timing, or structural attributes transfer from the reference and which target receives them. For audio, "
            "state whether the complete signal is copied unchanged, only selected portions or layers are copied, or "
            "only timbre, rhythm, delivery, or other specified attributes are referenced. Use enough information to "
            "make each reference relationship operational, normally one full sentence per label, but do not repeat an "
            "exhaustive appearance inventory already stated in subject_definitions. Never output bare entries such as "
            "'<picture 1>: fully_preserved', '<video 1>: attribute_transfer', or '<audio 1>: fully_copy'. "
            "Make detailed_description action-first, chronological, and production-ready. Give the scene a clear "
            "dramatic progression—establishment, development, a meaningful visual or emotional beat, and a resolved "
            "ending—without changing the user's intended event. Describe subject blocking, observable state changes, "
            "composition, camera movement, and the final visual landing. "
            "SHOT FORMAT IS STRICTLY ENFORCED: Every [Shot N] must begin with an explicit time range in the form "
            "'[Shot N] X.XXs-YY.YYs:' where X.XX is the shot start time and YY.YY is its end time in seconds. "
            "The first shot starts at 0.00s, shots are continuous and non-overlapping, and the final shot ends "
            "exactly at the target duration. Never omit the time range; never write just [Shot 1] without it. "
            "SHOT COUNT MUST RESPECT THE DURATION TABLE: 0-3s -> 1-2 shots; 3-5s -> 2-3 shots; 5-10s -> 3-5 shots; "
            "10-15s -> 4-6 shots; 15-20s -> 5-8 shots; 20-30s -> 6-10 shots. Each shot should feel like a coherent "
            "beat, not a fragment. HOWEVER, if a PACING OVERRIDE is present in this prompt (fast-cut or slow-paced), "
            "that override takes absolute precedence over this table and must be obeyed without exception. "
            "DIRECTOR NOT TRANSLATOR: A sentence-by-sentence paraphrase of the user's input, with no added shot "
            "design, camera movement, or physical action beats, is considered a failed output. You must actively "
            "invent concrete physical movements, expressive beats, motivated camera motion, and observable state "
            "changes that go beyond the literal words of the user's prompt. "
            "SUBJECT WEIGHT — SHOT-LEVEL ONLY (MANDATORY): Every media label may carry an optional ' weight=X.X' "
            "suffix in range 0.1 to 2.0. Weight affects ONLY the shot design in detailed_description. It NEVER "
            "affects subject_definitions and NEVER weakens the identity of any referenced subject. "
            "INVIOLABLE RULE for subject_definitions: every referenced subject MUST receive a complete identity "
            "description with 3-6 identifying traits (silhouette, color, key equipment, distinctive markings, "
            "material, scale), REGARDLESS of its weight. Visual consistency is the highest priority; a low-weight "
            "subject with a thin description will deform in the final video, which is a critical failure. Do not "
            "shorten or omit any subject definition based on weight. "
            "SUBJECT-TYPE RULE (MANDATORY): Every referenced subject that participates in the action MUST be "
            "defined as <Subject N> in subject_definitions, NEVER as <Picture N>, regardless of how low its weight "
            "is. <Picture N> is reserved exclusively for standalone frame anchors that the user explicitly treats "
            "as static references without action. Weight NEVER demotes a Subject into a Picture. "
            "retention_analysis markers by tier: weight <= 0.5 -> weak_reference; 0.5 < weight <= 0.9 -> "
            "partially_preserved; weight > 0.9 -> fully_preserved. The marker is a declarative label, not a "
            "description-length modifier. "
            "detailed_description (SHOT FOCUS): weight directly controls shot focus, action ownership, camera time, "
            "and dialogue attribution. A subject with weight >= 1.5 MUST be the primary action subject and camera "
            "focus of at least one shot. A subject with weight <= 0.5 MUST appear only as background or supporting "
            "presence and MUST NOT own any shot's primary action. Cross-tier weight differences (e.g., 0.5 vs 1.5 or "
            "1.0 vs 1.8) MUST produce a visible difference in camera time and action ownership. Same-tier weights "
            "(e.g., 1.0 vs 1.2, or 1.5 vs 1.7) MUST be treated as equal priority; never create artificial imbalance "
            "within the same tier. SAME-TIER RULE (MANDATORY, quantitative): When the maximum weight difference "
            "among all referenced subjects is <= 0.3, treat every subject as an absolute equal. Distribute camera "
            "time and action ownership evenly across the shot timeline. No subject may own more than 55% of the "
            "total shot timeline. The final shot must show all subjects on roughly equal footing, not one "
            "overpowering the other. If all referenced subjects share exactly the same weight, apply the same rule. "
            "Never omit a referenced subject from the shot design. Before returning, "
            "verify that every referenced subject has a full subject_definitions entry with 3-6 traits, and that "
            "shot-level focus matches the weight tier. "
            "Normally allow about 350-700 Chinese characters or 220-450 English words for the complete six-section "
            "result, and use more when duration, dialogue, multiple subjects, or genuine shot complexity requires it."
        )
    else:
        structure = (
            "Return exactly these three sections in order: integrated_multimodal_description, overall_soundscape, "
            "non_diegetic_music. Formatting is strict: every section heading must occupy its own line; put a newline "
            "immediately after the colon, write that section's content on the following line, and put one blank line "
            "between sections. Never place a heading and its content on the same line. Build a complete audiovisual "
            "progression rather than merely paraphrasing the user's sentence. Use [Shot 1] for the opening and "
            "timestamps only for motivated real later cuts. For I2VA, "
            "anchor the supplied picture at 0.00s and develop forward. For L2VA, infer a plausible opening and "
            "converge exactly to the supplied picture at the end. For FL2VA, describe one continuous, observable "
            "motion path from picture 1 at 0.00s to picture 2 at the target end time. Give the main description enough "
            "detail to establish the opening composition, action onset, intermediate development, camera evolution, "
            "and a visually resolved ending within the supplied duration. In FL2VA, mention picture 1 again when "
            "establishing the opening state and picture 2 again when describing the final visual landing; both labels "
            "are compulsory and must not be replaced by generic phrases such as 'the first image' or 'the last image'."
        )

    keyframe_lines = []
    for item in context.get("keyframes") or []:
        if not isinstance(item, dict) or not item.get("label") or not item.get("role"):
            continue
        role_text = {
            "exact_first_frame": "is the exact first-frame anchor at 0.00s",
            "exact_last_frame": f"is the exact last-frame anchor at {duration:.2f}s",
            "keyframe": "is a concrete visual keyframe anchor",
        }.get(str(item["role"]), "is a visual reference")
        keyframe_lines.append(f"{item['label']} {role_text}")
    keyframe_rule = (
        "Keyframe roles supplied by the node: " + "; ".join(keyframe_lines) + ". Preserve these roles exactly."
        if keyframe_lines else
        "No concrete keyframe role was supplied by the node; do not invent one."
    )

    audio_mode = str(context.get("audio_mode") or "native")
    audio_rule = {
        "lock_source": (
            "Audio mode is original-audio output. State only that the source video's original audio is preserved "
            "unchanged as the complete target soundtrack and mark it fully_copy. Because the optimizer does not "
            "receive or hear the audio binary, do not identify, describe, classify, or invent any dialogue, music, "
            "ambience, sound effect, instrument, language, rhythm, or other audible content. In overall_soundscape, "
            "write only the selected-language equivalent of 'Preserve the source video's original audio unchanged.' "
            "Do not add any new sound, voice, animal vocalization, ambience, or music."
        ),
        "reference_only": (
            "Audio mode is reference-only: treat supplied audio as audio reference; do not claim its waveform "
            "is copied into the final soundtrack."
        ),
        "remix_source": (
            "Audio mode is source-audio remix: describe only partial copying or remixing of the supplied audio, "
            "never a 1:1 complete copy."
        ),
        "native": "Audio mode is automatic generation: do not claim any uploaded audio is copied into the final output.",
    }.get(audio_mode, "Describe the audio relationship conservatively and do not invent how it is used.")

    singing_rule = ""
    if re.search(
        r"唱|歌曲|歌词|歌唱|演唱|口型|嘴型|对口型|lip\s*sync|sing(?:ing|s)?|lyrics?|vocal",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        singing_rule = (
            " The request involves singing or lip synchronization. Require accurate phoneme-level lip and jaw "
            "synchronization throughout the vocals: mouth movement should follow syllable onset and release, clear "
            "consonant closures, natural vowel shapes, pauses and breaths, and sustained notes; the mouth rests "
            "naturally during non-vocal spans. Also require stable facial identity and continuous mouth motion without "
            "generic loops, visible delay, frozen lips, or facial deformation. Do not reduce a singing performance "
            "to lip movement while the rest of the body remains still. Unless the user explicitly requests restrained "
            "or static performance, design evolving full-body or upper-body performance across the timeline: shifting "
            "weight, torso and shoulder rhythm, head movement, gaze changes, expressive but natural hand and arm "
            "phrasing, and transitions between distinct gestures. Make these movements non-repetitive and responsive "
            "to musical phrases, accents, pauses, intensity changes, and vocal emotion without inventing exact unheard "
            "beats. Coordinate purposeful camera motion and changing shot emphasis with the performance so the image "
            "does not feel like a static portrait with moving lips. Keep lip-sync requirements compact, but give the "
            "visible performance and camera progression enough concrete detail to guide a lively result. Because the audio binary is not "
            "transmitted to the optimizer, never invent exact lyrics, notes, beats, or timestamps and never claim "
            "to have analyzed or heard the file."
        )
    # ---- 节奏检测：快剪 / 慢镜 / 默认 ----
    pacing_rule = ""
    if re.search(
        r"快剪|快镜头|快速镜头|高速镜头|快切|快节奏|卡点|动感|爆发|急速|快速|高速|快速切换|快速剪辑|快闪|高频切换|快进|快动作|延时拍摄|降格|延时镜头|快放|加速|变速镜头|"
        r"quick\s*cut|fast\s*cut|rapid\s*cut|rapid|dynamic|high\s*energy|upbeat|fast-paced|quick-paced|fast\s*edit",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        pacing_rule = (
            f" PACING OVERRIDE (fast-cut) — MANDATORY, OVERRIDES THE STANDARD TABLE: "
            f"The user explicitly requested a fast-cut / high-energy rhythm. For this request, the standard "
            f"shot-count table is CANCELED and must NOT be used. Compute the minimum shot count as follows: "
            f"for durations 0-5s use AT LEAST 6 shots; 5-10s use AT LEAST 8 shots; 10-15s use AT LEAST 10 shots; "
            f"15-20s use AT LEAST 12 shots; 20-30s use AT LEAST 15 shots. Individual shots may be as short as "
            f"0.3-1.0s. You MUST prioritize rhythmic cutting, snappy transitions, and energetic motion in every shot. "
            f"Every shot must still begin with an explicit, non-overlapping time range like '[Shot N] X.XXs-YY.YYs:' "
            f"and the final shot must end exactly at {duration:.2f}s. "
            f"Failure to expand the shot count for a fast-cut request is considered a task failure. "
        )
    elif re.search(
        r"慢镜|慢镜头|慢动作|慢节奏|缓慢|抒情|沉浸|诗意|静谧|温柔|克制|升格|"
        r"slow\s*motion|slow-paced|lyrical|cinematic\s*slow|gentle|serene|introspective|slow\s*burn",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        pacing_rule = (
            f" PACING OVERRIDE (slow-paced): The user explicitly requested a slow, lyrical rhythm. "
            f"For the current target duration of {duration:.2f}s, compress the shot count to the LOWER end of "
            f"the standard table (for example, 5s may use 1-2 shots; 15-20s may use 3-5 shots), and extend each "
            f"shot's duration accordingly. Emphasize sustained camera motion, prolonged beats, and emotional "
            f"immersion over rapid cutting. Time ranges must still be explicit and non-overlapping, and the "
            f"final shot must end exactly at {duration:.2f}s. "
        )
    else:
        pacing_rule = (
            f" PACING: No explicit pacing was requested. Use the standard shot-count table for {duration:.2f}s. "
        )

    transfer_rule = ""
    if re.search(
        r"替换|置换|换成|变成|动作迁移|模仿.*动作|复刻.*动作|跟随.*动作|"
        r"replace|replacement|swap|motion\s*(?:transfer|reference)|imitate.*motion|copy.*motion",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        transfer_rule = (
            " This is a subject-replacement or motion-transfer request. The following is a strict task-specific "
            "exception that overrides the general instructions to describe actions, timing, performance, camera, "
            "sound, and shot-by-shot events. Describe only the source-to-target relationship: which subject from "
            "<picture N> replaces which subject in <video N>, while the source video's complete motion, timing, "
            "scene, props, composition, camera movement, cuts, and temporal structure remain unchanged. Never name, "
            "infer, enumerate, paraphrase, or timestamp any concrete source-video action, gesture, pose change, facial "
            "expression, dialogue, object interaction, prop function, story event, sound, ambience, or music, even if "
            "it appears visible or inferable in the sampled frames. Use the sampled frames only to distinguish the "
            "subjects that must be replaced. Define replacement subjects only with official numbered labels such as "
            "<Subject 1> and <Subject 2>, never semantic labels such as <cat> or a Chinese name. Give each subject only "
            "the minimum clearly visible identity cues needed to avoid mismatch: subject type or gender, approximate "
            "age when reliable, main clothing and color, hairstyle or fur pattern, hat, and glasses. Do not infer an "
            "occupation or describe pose, expression, action, scene details, lighting, or unrelated appearance. Do not "
            "define the original subjects being removed as target <Subject N> entries unless needed only to make an "
            "unambiguous one-to-one replacement mapping. In detailed_description, keep a single [Shot 1] for the source "
            "timeline, but write a complete operational paragraph rather than a bare one-sentence relationship. State "
            "which source subject or scene is replaced by which referenced target, which target identity and major "
            "appearance or environment attributes remain stable, and which source-video properties remain unchanged: "
            "motion performance, facial-expression timing, blocking, screen direction, camera trajectory, framing, "
            "cuts, pacing, and duration when applicable. Explain how replaced subjects remain spatially integrated with "
            "preserved props and scene elements, but never invent or enumerate the source video's concrete actions, "
            "dialogue, props, events, or sounds; do not expand the source timeline or reconstruct it from sampled frames. Treat the three sampled images from one <video N> as observation "
            "frames of that single reference video, never as separate target shots or evidence of cuts."
        )
    language_rule = (
        "输出语言强制为中文：所有自然语言说明、主体描述、摘要、镜头描述、声音说明和音乐说明必须使用简体中文，"
        "不得输出英文句子。只有官方固定字段名 subject_definitions、summary、retention_analysis、"
        "detailed_description、integrated_multimodal_description、overall_soundscape、non_diegetic_music，"
        "媒体与主体标签、[Shot N]，以及 fully_preserved、partially_preserved、attribute_transfer、"
        "weak_reference、fully_copy、partially_copy、reference 等固定关系标记保留英文。返回前必须检查并将"
        "其他英文自然语言全部改写成中文。"
        if output_language == "中文" else
        "Output all natural-language content in English. Keep supplied dialogue, lyrics, and visible text in their "
        "original language. Only the official field names (subject_definitions, summary, retention_analysis, "
        "detailed_description, integrated_multimodal_description, overall_soundscape, non_diegetic_music), media "
        "and subject labels (<picture N>, <Subject N>, <video N>, <audio N>), [Shot N], and relationship markers "
        "(fully_preserved, partially_preserved, attribute_transfer, weak_reference, fully_copy, partially_copy, "
        "reference) remain in English."
    )
    dialogue_rule = (
        "Official dialogue formatting is mandatory in every task and is independent of the selected narration "
        "language. Put every user-supplied spoken line or lyric inside exactly one <d>[Language]...</d> block, using "
        "the dialogue's actual language name in English. In particular, Chinese speech must use the exact form "
        "<d>[Chinese]中文原文</d>; never write Chinese dialogue only inside quotation marks, and never omit [Chinese]. "
        "Keep the speaker description, stable speaker ID such as (S1), speaking action, and delivery outside the <d> "
        "block; inside it preserve only the user's exact words and punctuation without translation or rewriting. "
        "The output-language setting controls narration only: an English prompt must still retain supplied Chinese "
        "dialogue as <d>[Chinese]...</d>. Placement is as mandatory as formatting: every <d> block must be embedded "
        "inside integrated_multimodal_description or detailed_description at the exact chronological moment when the "
        "speaker speaks or sings, immediately after that speaker's speaking/singing action and delivery description. "
        "Never collect dialogue into a list, appendix, footer, or separate paragraph after the official sections. "
        "Never place a <d> block in subject_definitions, summary, retention_analysis, overall_soundscape, or "
        "non_diegetic_music. The final section is always non_diegetic_music, and absolutely no text or <d> block may "
        "follow that section's content. For multiple supplied lines, preserve their original order and place each line "
        "at its corresponding point in the shot timeline, with intervening actions and pauses described between lines "
        "when the user's request implies them. Before returning, verify that every supplied line appears exactly once "
        "inside the main shot timeline and nowhere else. Do not wrap paraphrased soundscape descriptions, ambient "
        "sounds, or dialogue that the user did not explicitly supply in <d> tags."
    )
    subject_shorthand_rule = (
        "Subject shorthand formatting is mandatory and globally consistent. If a stable short subject ID is used, "
        "it must always be written with parentheses as (S1), (S2), ... through (S20). Never output a bare S1, S2, "
        "or any other unparenthesized S-number in narration, shot descriptions, actions, dialogue attribution, or "
        "sound descriptions. <Subject N> definitions remain unchanged; (S1) is only the shorthand used to refer back "
        "to a defined subject. Before returning, scan the complete result and replace every standalone bare S1-S20 "
        "with its exact parenthesized form."
    )
    return (
        "You are a professional prompt writer for the open-source MiniMax H3 audiovisual model. Return only the "
        "final production-ready prompt without explanations, markdown fences, filenames, or invented media. "
        "Preserve the user's intent and every supplied dialogue, lyric, and visible-text word verbatim; do not "
        "invent dialogue or lyrics that were not provided. This is a video-generation prompt, not image captioning "
        "or visual reverse-prompting. Reference images are already passed into model conditioning, so identify each "
        "visual subject only with the minimum distinctive cues needed to disambiguate it: usually gender or subject "
        "type, main clothing, main hairstyle, and scene. Do not describe facial features, lighting, pose, background "
        "objects, or composition exhaustively unless they are essential to the requested motion or must change over "
        "time. Spend most words on what happens after the reference frame: causally connected actions, reactions, "
        "story progression, timing, performance, camera behavior, and audio-visual synchronization. Develop the "
        "user's idea into concrete visible beats that fit the duration: establish the situation, let the central "
        "action evolve through meaningful intermediate changes, add a restrained climax or reveal when appropriate, "
        "and finish on a clear visual result rather than an abrupt stop. Do not introduce unrelated characters, props, "
        "locations, conflicts, or plot twists. Avoid repeating the same static trait across sections, avoid decorative "
        "adjectives, and never turn quality requirements into a long negative-prompt checklist. Use professional but "
        "executable cinematography with dynamic video direction by default. Unless the user explicitly requests a static pose, locked-off camera, "
        "minimal movement, or a specific fixed composition, do not let the subject remain nearly motionless after the "
        "opening frame. Build visible motion in successive phases with clear variation and continuity: changes in body "
        "weight, posture, orientation, gesture, interaction, expression, spatial position, or object state. Avoid one "
        "gesture repeated mechanically throughout the clip. For music, singing, dance, performance, fashion, or other "
        "rhythmic scenes, let the body express phrase changes through varied natural gestures and coordinated torso, "
        "shoulder, head, hand, and footwork where framing permits; align movement energy and camera emphasis with broad "
        "musical progression without fabricating unheard exact beats. Treat the reference image as a starting anchor, "
        "not the main subject of the description: spend only enough text to identify it, then prioritize motion design, "
        "performance evolution, kinetic atmosphere, and a visually active ending. For each shot, integrate the useful framing or shot scale, subject blocking, and "
        "camera path into the action. When motion benefits the scene, choose a motivated Push In, Pull Out, Pan, Tilt, "
        "Truck, Pedestal, Arc Shot, Tracking Shot, or controlled Zoom, and specify subtle/large amplitude and slow/fast "
        "speed only when meaningful. Let camera movement reveal information, follow motion, emphasize a transformation, "
        "or land on the final state; do not stack random camera terms or use constant movement without purpose. Vary "
        "composition and visual emphasis over time so the video feels directed rather than static, while preserving "
        "spatial continuity, screen direction, subject identity, and reference constraints. Expand into continuous "
        "actions, camera choreography, synchronized audible events, ambience, and music with enough detail to guide "
        "generation effectively. Prefer a well-designed continuous shot when it can express the event clearly, but "
        "allow a small number of motivated cuts when they materially improve narrative clarity or reveal new visual "
        "information. Do not create labels outside the supplied label list, renumber labels, "
        "or replace labels with filenames. "
        f"Task={task}; duration={duration:.2f}s; available labels={', '.join(labels) or 'none'}. "
        f"{label_rule} {keyframe_rule} {audio_rule} {structure}{pacing_rule}{singing_rule}{transfer_rule} {dialogue_rule} "
        f"{subject_shorthand_rule} "
        "Audio items are label-only references; never claim you listened to them. Before returning, silently check "
        "that every required section is present in the correct order, every used label exists, no filename appears, "
        "no audio content was fabricated, all timing fits the target duration, and the audio relationship matches "
        f"the supplied mode. {language_rule}"
    )

def _system_prompt_image(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    structure = (
        "Return exactly these four sections in this order, with each heading followed by a colon: "
        "subject_definitions, summary, retention_analysis, image_description. "
        "Formatting is strict: every section heading must occupy its own line; put a newline immediately after "
        "the colon, write that section's content on the following line, and put one blank line between sections. "
        "Never place a heading and its content on the same line, and never join multiple sections into one paragraph. "
        "In subject_definitions, define each referenced visual subject as <Subject N>. Every referenced subject "
        "MUST receive a complete identity description with 3-6 identifying traits (silhouette, color, key equipment, "
        "distinctive markings, material, scale), REGARDLESS of weight. Visual consistency is the highest priority; "
        "a low-weight subject with a thin description will deform in the final image, which is a critical failure. "
        "In summary, use one sentence beginning with '[image generation]' that describes the final still composition. "
        "In retention_analysis, write one compact line per label using fully_preserved, partially_preserved, "
        "weak_reference, or attribute_transfer, with a concise concrete explanation after a hyphen. Every line "
        "must use the exact form '<label>: marker - explanation'. "
        "The image_description section is ONE fluent continuous paragraph describing the still composition: "
        "subject placement (foreground/midground/background, left/right/center, gaze direction), shot scale and "
        "camera angle, lighting (direction, quality, color temperature), color palette, mood, art style, and any "
        "motion-blur or focus-capture technique. Write it as a single flowing paragraph, never as a shot list. "
        "STATIC FRAMING, NOT TIMELINE: This is a still-image prompt. Never use [Shot N], never use timestamps "
        "like 0.00s-2.50s, never describe shot progression over time, never produce overall_soundscape or "
        "non_diegetic_music sections. Never use time-flow words like 'then', 'subsequently', 'gradually', "
        "'接着', '随后', '然后'. "
        "PRESERVE PHOTOGRAPHIC LANGUAGE: You MUST use still-camera vocabulary: shot scale "
        "(特写/中景/全景/远景/close-up/medium/wide/long shot), angle (仰拍/俯视/平视/low angle/high angle/eye-level), "
        "lens (广角/长焦/浅景深/深焦/wide-angle/telephoto/shallow DOF/deep focus), composition "
        "(三分法/对称/对角/前景-中景-背景/rule of thirds/symmetry/diagonal), and mood-driven capture styles "
        "(追焦/motion blur/panning shot). These are space-based descriptors that guide the target image model's "
        "composition; they are NOT video camera movements. "
        "SUBJECT WEIGHT - SHOT-LEVEL ONLY (MANDATORY): Every media label may carry an optional ' weight=X.X' "
        "suffix in range 0.1 to 2.0. Weight affects ONLY the subject's prominence in image_description: higher "
        "weight subjects take the primary foreground position and richer visual detail; lower weight subjects are "
        "pushed to background, edges, or supporting placement. Weight NEVER weakens subject_definitions descriptions. "
        "retention_analysis markers by tier: weight <= 0.5 -> weak_reference; 0.5 < weight <= 0.9 -> "
        "partially_preserved; weight > 0.9 -> fully_preserved. Cross-tier weight differences (e.g., 0.5 vs 1.5) "
        "MUST produce a visible difference in foreground/background placement and visual detail. Same-tier weights "
        "(within 0.3) MUST be treated as equal priority. Never omit a referenced subject from image_description. "
        "DIRECTOR NOT TRANSLATOR: A sentence-by-sentence paraphrase of the user's input, with no added composition, "
        "camera angle, lighting, or atmospheric detail, is considered a failed output. You must actively invent "
        "concrete framing, lens, lighting, color, and mood choices that go beyond the literal words of the user's prompt. "
        "Normally allow about 250-500 Chinese characters or 150-300 English words for the complete four-section "
        "result, and use more when subject count, visual complexity, or multiple scenes require it."
    )
    language_rule = (
        "输出语言强制为中文：所有自然语言说明、主体描述、摘要、保留分析、构图描述必须使用简体中文，"
        "不得输出英文句子。只有官方固定字段名 subject_definitions、summary、retention_analysis、"
        "image_description，媒体与主体标签，以及 fully_preserved、partially_preserved、attribute_transfer、"
        "weak_reference 等固定关系标记保留英文。返回前必须检查并将其他英文自然语言全部改写成中文。"
        if output_language == "中文" else
        "Output all natural-language content in English. Keep supplied visible text in its original language."
    )
    return (
        "You are a professional prompt writer for text-to-image and reference-driven image generation models. "
        "Return only the final production-ready image prompt without explanations, markdown fences, filenames, "
        "or invented media. Preserve the user's intent and every supplied visible-text word verbatim; do not "
        "invent visible text that was not provided. This is a still-image prompt, not a video prompt and not image "
        "captioning. Reference images are already passed into model conditioning, so identify each visual subject "
        "only with the minimum distinctive cues needed to disambiguate it, then focus on the final still "
        "composition: subject placement, camera angle, framing, lighting, color, and mood. Do not narrate actions "
        "over time, and do not design a timeline. "
        f"available labels={', '.join(labels) or 'none'}. "
        f"{structure} {language_rule}"
    )



def _template_preamble() -> str:
    return (
        "Return only the final production-ready prompt without explanations, markdown fences, filenames, or invented "
        "media. Preserve the user's intent and every supplied dialogue, lyric, and visible-text word verbatim; do not "
        "invent dialogue or lyrics that were not provided. This is a generation prompt, not image captioning or visual "
        "reverse-prompting."
    )


def _template_language_rule(output_language: str) -> str:
    if str(output_language) == "中文":
        return (
            "输出语言强制为中文：所有自然语言说明必须使用简体中文，不得输出英文句子。只有固定格式标记（如官方字段名、"
            "段标题、[Shot N]、【镜头N】等）保留原文。返回前必须检查并将其他英文自然语言全部改写成中文。"
        )
    return (
        "Output all natural-language content in English. Keep supplied dialogue, lyrics, and visible text in their "
        "original language."
    )


def _template_extra_rules(user_prompt: str) -> str:
    rules = []
    if re.search(
        r"唱|歌曲|歌词|歌唱|演唱|口型|嘴型|对口型|lip\s*sync|sing(?:ing|s)?|lyrics?|vocal",
        user_prompt, flags=re.IGNORECASE,
    ):
        rules.append(
            "The request involves singing or lip sync: require accurate phoneme-level lip and jaw synchronization, "
            "stable facial identity, and continuous mouth motion throughout the vocals."
        )
    if re.search(
        r"替换|置换|换成|变成|动作迁移|模仿.*动作|复刻.*动作|跟随.*动作|"
        r"replace|replacement|swap|motion\s*(?:transfer|reference)|imitate.*motion|copy.*motion",
        user_prompt, flags=re.IGNORECASE,
    ):
        rules.append(
            "This is a subject-replacement or motion-transfer request: describe only which reference subject replaces "
            "which source subject while the source video's motion, timing, scene and camera remain unchanged."
        )
    return " ".join(rules)


def _template_context_note(task: str, duration: float, labels: list[str], context: dict | None, user_prompt: str) -> str:
    context = context if isinstance(context, dict) else {}
    keyframe_lines = []
    for item in context.get("keyframes") or []:
        if not isinstance(item, dict) or not item.get("label") or not item.get("role"):
            continue
        role_text = {
            "exact_first_frame": "is the exact first-frame anchor at 0.00s",
            "exact_last_frame": f"is the exact last-frame anchor at {duration:.2f}s",
            "keyframe": "is a concrete visual keyframe anchor",
        }.get(str(item["role"]), "is a visual reference")
        keyframe_lines.append(f"{item['label']} {role_text}")
    keyframe_rule = (
        "Keyframe roles supplied by the node: " + "; ".join(keyframe_lines) + ". Preserve these roles exactly."
        if keyframe_lines else
        "No concrete keyframe role was supplied by the node; do not invent one."
    )
    label_rule = (
        "Use the supplied media labels (for example <picture 1>, <video 1>) only when the target model's format "
        "benefits from referencing media; never invent labels, never renumber them, and never replace them with filenames."
    )
    return (
        f"Task={task}; duration={duration:.2f}s; available labels={', '.join(labels) or 'none'}. "
        f"{label_rule} {keyframe_rule}"
    )


def _system_prompt_ltx_2_5(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for LTX-Video 2.5 by Lightricks, a text-to-video / image-to-video model. "
        "video model. " + _template_preamble()
        + " Return the prompt in clearly labeled structured sections, in this exact order. Each section heading "
          "must occupy its own line followed immediately by a colon; write that section's content on the "
          "following line(s); put one blank line between sections. Never place a heading and its content on the "
          "same line, and never merge sections into one paragraph.\n\n"
          "scene:\n"
          "Describe the environment, location, time of day, weather, atmosphere and spatial layout. Be concrete "
          "and cinematic; avoid decorative adjective stacks and negative-prompt checklists.\n\n"
          "subject:\n"
          "Identify the main subject(s) with only the minimum distinctive cues needed to disambiguate them: "
          "subject type, approximate age when relevant, main clothing, hairstyle/fur pattern, plus any visible "
          "identity anchors from the reference. Do not exhaustively describe facial features or background "
          "objects unless they must change over time.\n\n"
          "action:\n"
          f"Write a chronological progression that fills the full {duration:.2f}s duration: establish the "
          "situation, let the central action evolve through meaningful intermediate changes, add a restrained "
          "climax or reveal when appropriate, and finish on a clear resolved visual result rather than an "
          "abrupt stop. Describe observable motion, subject blocking, state changes and reactions. Avoid "
          "repeating one gesture mechanically through the clip.\n\n"
          "camera:\n"
          "Specify shot scale and framing, plus one or more motivated camera movements (push in, pull out, pan, "
          "tilt, truck, pedestal, arc, tracking, crane, controlled zoom). Mention subtle/large amplitude and "
          "slow/fast speed only when meaningful. Choose movements that reveal information, follow motion, "
          "emphasize a transformation, or land on the final state; never stack random camera terms.\n\n"
          "lighting:\n"
          "Describe key light direction and quality, mood, color temperature and overall palette.\n\n"
          "style:\n"
          "Briefly describe genre, art direction, medium and visual mood.\n\n"
          "audio:\n"
          "Include only when the user mentions sound or a reference audio is supplied. Describe ambience and "
          "music in general terms; never invent specific lyrics, notes or heard details.\n\n"
          "Rules:\n"
          "- Use fluent, detailed natural-language sentences. Never keyword lists, never markdown, never bullet points.\n"
          "- Total length 200-500 words (or the Chinese equivalent), scaled to duration.\n"
          "- If the request spans multiple scenes or motivated cuts, expand the action and camera sections as "
          "[Shot 1], [Shot 2], ... paragraphs with smooth continuity.\n"
          "- If reference labels are supplied (for example <picture 1>, <video 1>), reference them naturally as "
          "the visual anchor and describe how content evolves from them; never use filenames.\n"
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_seedance_2_5(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for ByteDance Seedance 2.5, a video generation model with native audio. "
        + _template_preamble()
        + " Output the prompt as clearly labeled segments in this exact order, each segment written as fluent "
          "sentences, not tags: Subject (主体), Action (动作与情节), Scene (场景与环境), Camera (景别与运镜), Lighting (光线与色调), "
          "Style (风格与氛围), and Sound (声音设计) only when the model's audio channel applies or the user mentions audio. "
          "Write the segment labels in the selected output language. Give the subject enough identifying detail, drive "
          "the action through a clear temporal progression with a definite ending, use concrete camera vocabulary "
          "(景别 like 远景/全景/中景/近景/特写, and 运镜 like 推、拉、摇、移、跟、升降、环绕), and describe lighting mood and style. "
          "If the request contains multiple stages or time progression, expand into numbered shots 【镜头1】【镜头2】..., "
          "each shot repeating the segments inline. If reference labels are supplied, describe how the reference "
          "anchors the shot and how content evolves from it; never use filenames. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_wan_2_2(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for Alibaba Wan 2.2, a video generation model (Wan2.2 VACE supports "
        "reference images). "
        + _template_preamble()
        + " Output ONE plain descriptive prompt in natural language — no headings, no tags, no markdown, no lists. "
          "Describe in one or two compact paragraphs: the scene and environment, the subject and its appearance, the "
          "action and motion with clear temporal progression and a definite ending, camera movement when it matters, "
          "lighting and style. Wan interprets direct, concrete descriptions best; avoid overlong technical jargon and "
          "decorative adjective stacks. If reference images are supplied, describe them naturally as the visual anchor "
          "(for example the character or scene from the reference) and the motion that develops from it, never by "
          "filename. Aim for roughly 60–220 words (or the Chinese equivalent), scaled to the duration. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_flux_2(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    context = context if isinstance(context, dict) else {}
    chinese = str(output_language) == "中文"
    has_reference = bool(labels)

    # ---- 招 6 之一：标签跟着输出语言走 ----
    L = {
        "subject":     "【主体】" if chinese else "[Subject]",
        "expression":  "【表情】" if chinese else "[Expression]",
        "action":      "【动作】" if chinese else "[Action]",
        "clothing":    "【衣服】" if chinese else "[Clothing]",
        "scene":       "【场景】" if chinese else "[Scene]",
        "composition": "【构图】" if chinese else "[Composition]",
        "lighting":    "【打光】" if chinese else "[Lighting]",
        "tone":        "【色调】" if chinese else "[Color Tone]",
        "style":       "【风格】" if chinese else "[Style]",
        "text":        "【画面文字】" if chinese else "[On-screen Text]",
        "quality":     "【画质约束】" if chinese else "[Quality Constraints]",
    }

    # ---- 招 1：任务分岔（生图模型：有无参考图） ----
    reference_rule = (
        "This request has reference material attached. Treat the reference as the visual anchor for "
        "identity, appearance and composition. Never restate every visible detail of the reference; "
        "spend most of the description on how the target image should look, not on transcribing the "
        "reference. Never invent features that the reference does not contain unless the user asked for them."
        if has_reference else
        "This request has no reference material. Invent only the visual details required by the user's idea; "
        "never reference a filename or an uploaded asset that does not exist."
    )

    # ---- 招 3 + 4：硬格式契约 + 段落职责边界（写什么 / 绝不写什么） ----
    structure = (
        f"Return the prompt as a sequence of labeled bracket sections, in this exact order. "
        f"Formatting is strict: every bracket label must occupy its own line followed immediately "
        f"by a colon; write that section's content on the following line(s); put one blank line between "
        f"sections. Never place a bracket label and its content on the same line, and never merge two "
        f"sections into one paragraph.\n\n"
        f"{L['subject']}\n"
        f"Identity and the minimum distinctive cues needed to disambiguate the subject: subject type, "
        f"approximate age when relevant, main clothing silhouette, hairstyle or fur pattern. "
        f"Maximum four identifying traits. Never list facial features exhaustively and never repeat "
        f"clothing details that belong in the clothing section.\n\n"
        f"{L['expression']}\n"
        f"Facial expression, gaze direction and emotional intensity. Never describe body posture or "
        f"hand gestures here; those belong in the action section.\n\n"
        f"{L['action']}\n"
        f"Pose, gesture, body language and physical state. Written as a still-moment description — "
        f"no time progression, no camera motion, no dialogue. Never repeat what is already stated in "
        f"the expression section.\n\n"
        f"{L['clothing']}\n"
        f"Clothing, accessories, fabrics, textures, colors and how they sit on the body. "
        f"Never restate the subject's identity here.\n\n"
        f"{L['scene']}\n"
        f"Environment, location, background, time of day, weather, spatial layout. "
        f"Never repeat the subject or action; describe only the surrounding world.\n\n"
        f"{L['composition']}\n"
        f"Shot scale, framing, camera angle, subject placement in frame, foreground/midground/background "
        f"layering. Never describe lighting or color grading here.\n\n"
        f"{L['lighting']}\n"
        f"Key light direction and quality, fill and rim behavior, contrast, time-of-day cue. "
        f"Never describe palette or saturation here.\n\n"
        f"{L['tone']}\n"
        f"Color palette, saturation level, color grading, overall temperature. "
        f"Never repeat lighting direction.\n\n"
        f"{L['style']}\n"
        f"Genre, art direction, medium, visual style reference, level of realism. "
        f"Never restate subject or scene content.\n\n"
        f"{L['text']}\n"
        f"Include this section only when the user mentions signage, subtitles, captions, logos, or any "
        f"readable text in the image. When included, spell out the exact text in quotation marks and "
        f"state its position in the frame. When the user did not mention text, omit this section entirely — "
        f"do not write an empty heading and do not invent text.\n\n"
        f"{L['quality']}\n"
        f"Only necessary technical constraints such as aspect ratio tendency, resolution orientation, "
        f"or film grain. Never output quality-tag soup such as '8k', 'masterpiece', 'best quality', "
        f"'ultra detailed', 'highly detailed', 'award-winning'; those tokens are forbidden."
    )

    # ---- 招 7：反面清单 ----
    negatives = (
        "Global negative constraints, mandatory: never output keyword lists — every bracket section "
        "must read as a fluent sentence or short paragraph. Never merge two bracket sections on one line. "
        "Never repeat the same information across sections: identity lives only in the subject section, "
        "clothing only in the clothing section, lighting only in the lighting section, palette only in the "
        "tone section. Never mention a filename or any uploaded file path. Never invent media that the user "
        "did not supply. Never output markdown fences, bullet lists, numbered lists, or bold/italic markers."
    )

    # ---- 招 8：返回前自检 ----
    checklist = (
        "Before returning, silently check that: (1) every required bracket label appears exactly once "
        "and in the correct order; (2) no two sections describe the same attribute; (3) the total length "
        "stays within the stated budget; (4) no forbidden quality-tag token appears; (5) any quoted "
        "on-screen text is verbatim what the user supplied; (6) the on-screen text section is present only "
        "when the user actually asked for on-screen text."
    )

    # ---- 招 6 之二：语言规则（FLUX.2 专用，覆盖全局 _template_language_rule） ----
    if chinese:
        language_rule = (
            "输出语言强制为中文：所有段落标签必须使用中文方括号形式，例如【主体】【表情】【动作】【衣服】【场景】"
            "【构图】【打光】【色调】【风格】【画面文字】【画质约束】；绝不能输出 [Subject]、[Action] 这类英文标签。"
            "所有自然语言说明也必须使用简体中文，不得输出英文句子。"
            "画面文字若用户提供了英文原文，引号内保留英文原文，但描述该文字的句子本身仍用中文。"
            "返回前必须检查并将任何残留的英文标签或英文句子改写成中文。"
        )
    else:
        language_rule = (
            "Output all natural-language content in English, and use the English bracket labels shown above "
            "(for example [Subject], [Action], [Clothing]). Never output Chinese bracket labels such as "
            "【主体】 or 【动作】 in English mode. Keep any user-supplied on-screen text verbatim in its "
            "original language."
        )

    # ---- 招 5：条件式扩展 ----
    conditional = _template_extra_rules(user_prompt)

    # ---- 招 2：状态注入 ----
    state_note = (
        f"Task={task}; target duration context={duration:.2f}s (image model: duration is contextual only, "
        f"never write time or shot progression); available labels={', '.join(labels) or 'none'}."
    )

    return (
        "You are a professional prompt writer for FLUX.2 by Black Forest Labs, an image generation model. "
        + _template_preamble()
        + " "
        + structure
        + " Total length 80-200 words (or the Chinese equivalent). "
        + negatives + " "
        + reference_rule + " "
        + (conditional + " " if conditional else "")
        + state_note + " "
        + language_rule + " "
        + checklist
    )


def _system_prompt_z_image(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for Z-Image (Alibaba Tongyi), a text-to-image generation model. "
        + _template_preamble()
        + " Output ONE detailed descriptive paragraph in natural language — no headings, no tags, no markdown: the "
          "main subject and its appearance, the action or pose, the scene and composition, lighting, color, style and "
          "mood, and the details that carry the visual idea. Be specific and visually coherent; avoid generic "
          "quality-tag soup. If reference images are supplied, anchor the description on them without using filenames. "
          "Keep it about 50–150 words (or the Chinese equivalent). "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_kling(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for Kling (可灵) by Kuaishou, a video generation model. "
        + _template_preamble()
        + " Output the prompt as labeled segments in this order, each written as fluent sentences: 主体, 动作, 场景, "
          "镜头(景别与运镜), 光影, 风格. Write the segment labels and content in the selected output language. Describe the "
          "subject with enough identifying detail, build the action into a clear beginning–development–ending, use "
          "precise camera vocabulary (景别 and 运镜: 推、拉、摇、移、跟、升降、环绕、跟随), and specify lighting mood and style. "
          "If the request spans multiple phases, expand into numbered shots 【镜头1】【镜头2】..., each repeating the "
          "segments. If reference labels are supplied, describe how the reference anchors the shot and how motion "
          "develops from it; never use filenames. Aim for about 100–350 words (or the Chinese equivalent), scaled to "
          "duration. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_hunyuan_video(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for HunyuanVideo (混元视频) by Tencent, a video generation model. "
        + _template_preamble()
        + " Output ONE detailed, structured natural-language description. Prefer labeled segments — 画面内容(主体与动作), "
          "场景, 镜头(景别与运镜), 光影, 风格 — written as fluent sentences, or a single rich paragraph if the request is "
          "short. Drive a clear temporal progression with a resolved ending, use concrete camera vocabulary, describe "
          "lighting and style. If the request contains multiple stages, expand into 【镜头1】【镜头2】... blocks. If "
          "reference labels are supplied, anchor the description on them; never use filenames. Aim for about 80–300 "
          "words (or the Chinese equivalent), scaled to duration. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_veo_3(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for Google Veo 3, a cinematic video generation model. "
        + _template_preamble()
        + " Output one or more rich cinematic paragraphs in natural language — no headings, no lists, no markdown. "
          "Describe the scene and atmosphere, the subject and appearance, the action with a clear arc that fits the "
          "duration, explicit camera language (shot scale, framing, motivated movement such as push-in, dolly, pan, "
          "tilt, tracking, crane), lighting, color and style. When multiple phases or cuts are motivated, structure the "
          "prompt as [Shot 1], [Shot 2], ... blocks with smooth continuity. Veo also understands sound-design "
          "direction: if the user mentions audio or the scene calls for it, you may end with one short sentence "
          "describing ambience or music without inventing specific unheard details. If reference labels are supplied, "
          "anchor the opening on them; never use filenames. Aim for 150–450 words (or the Chinese equivalent), scaled "
          "to duration. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_sora_2(
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    return (
        "You are a professional prompt writer for OpenAI Sora 2, a video generation model. "
        + _template_preamble()
        + " Output the prompt in Sora 2's official three-part format with these exact English headings on their own "
          "lines, each followed by a colon: 'Visual description:', 'Dialogue:', 'Soundtrack:'. Under 'Visual "
          "description:', write a detailed scene-by-scene description with concrete camera language (shot scale, "
          "framing, motivated movement), subject actions with clear progression, environment, lighting and style; mark "
          "each new shot with [Shot N]. Include the 'Dialogue:' section only when the user supplied dialogue or "
          "lyrics, and keep the exact words verbatim. Include the 'Soundtrack:' section only when audio references "
          "were supplied or the user mentions sound, describing music and ambience in general terms without "
          "fabricating unheard details; otherwise omit both optional sections entirely. If reference labels are "
          "supplied, anchor the opening scene on them; never use filenames. Write the content under each heading in "
          "the selected output language, keeping the three English headings unchanged. Aim for 100–400 words (or the "
          "Chinese equivalent), scaled to duration. "
        + _template_extra_rules(user_prompt)
        + " "
        + _template_language_rule(output_language)
        + " " + _template_context_note(task, duration, labels, context, user_prompt)
    )


def _system_prompt_custom(
    custom_prompt: str,
    task: str, duration: float, labels: list[str],
    output_language: str = "English", context: dict | None = None, user_prompt: str = "",
) -> str:
    """User-provided system prompt with optional placeholders.

    Supported placeholders (case-sensitive):
      {task}             -> task code (T2VA / I2VA / L2VA / FL2VA / Ref2VA / Hybrid)
      {duration}         -> e.g. "5.00"
      {labels}           -> comma-joined media labels, or "none"
      {output_language}  -> "中文" or "English"
      {user_prompt}      -> raw user input
      {preamble}         -> shared generic preamble text
      {language_rule}    -> shared output-language rule text
    """
    text = str(custom_prompt or "")
    if not text.strip():
        return _system_prompt_minimax_h3(
            task, duration, labels, output_language, context, user_prompt,
        )
    replacements = {
        "{task}": str(task),
        "{duration}": f"{duration:.2f}",
        "{labels}": ", ".join(labels) or "none",
        "{output_language}": str(output_language),
        "{user_prompt}": str(user_prompt),
        "{preamble}": _template_preamble(),
        "{language_rule}": _template_language_rule(output_language),
    }
    for key, value in replacements.items():
        text = text.replace(key, value)
    return text.strip()


def _system_prompt(
    task: str,
    duration: float,
    labels: list[str],
    output_language: str = "English",
    context: dict | None = None,
    user_prompt: str = "",
    template: str = "minimax_h3",
    custom_prompt: str = "",
) -> str:
    """Route the optimizer system prompt to the selected target-model template."""
    template_key = str(template or "minimax_h3").lower()
    if template_key == "custom":
        return _system_prompt_custom(
            custom_prompt, task, duration, labels, output_language, context, user_prompt,
        )
    builder = _TEMPLATE_BUILDERS.get(template_key)
    if builder is None:
        builder = _system_prompt_minimax_h3
    return builder(task, duration, labels, output_language, context, user_prompt)


_TEMPLATE_BUILDERS = {
    "minimax_h3": _system_prompt_minimax_h3,
    "image": _system_prompt_image,
    "ltx_2_5": _system_prompt_ltx_2_5,
    "seedance_2_5": _system_prompt_seedance_2_5,
    "wan_2_2": _system_prompt_wan_2_2,
    "flux_2": _system_prompt_flux_2,
    "z_image": _system_prompt_z_image,
    "kling": _system_prompt_kling,
    "hunyuan_video": _system_prompt_hunyuan_video,
    "veo_3": _system_prompt_veo_3,
    "sora_2": _system_prompt_sora_2,
}


def _user_parts(prompt: str, media: list[dict], read_media: bool) -> list[dict]:
    parts = [{"type": "text", "text": "User prompt:\n" + prompt}]
    for item in media:
        label = str(item.get("label") or "")
        kind = str(item.get("kind") or "")
        if kind == "audio":
            parts.append({"type": "text", "text": f"{label} is an uploaded audio reference (content not transmitted)."})
        elif read_media:
            for index, data_url in enumerate(item.get("images") or []):
                parts.append({"type": "text", "text": f"{label} visual {index + 1}."})
                parts.append({"type": "image_url", "image_url": {"url": data_url, "detail": "low"}})
        else:
            parts.append({"type": "text", "text": f"{label} is an uploaded {kind} reference."})
    return parts


def _strip_filenames(text: str) -> str:
    return re.sub(
        r"(?<![\w/\\])[\w .()\-\u4e00-\u9fff]+\.(?:png|jpe?g|webp|bmp|gif|mp4|mov|webm|mkv|avi|mp3|wav|flac|m4a|ogg|aac)(?!\w)",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _format_prompt_sections(text: str) -> str:
    """Force official section headings onto separate lines without rewriting content."""
    headings = (
        "subject_definitions",
        "summary",
        "retention_analysis",
        "detailed_description",
        "image_description",
        "integrated_multimodal_description",
        "overall_soundscape",
        "non_diegetic_music",
    )
    pattern = r"\s*(" + "|".join(map(re.escape, headings)) + r")\s*:\s*"
    formatted = re.sub(pattern, lambda match: f"\n\n{match.group(1).lower()}:\n", str(text), flags=re.IGNORECASE)
    return formatted.strip()


def _normalize_subject_shorthand(text: str) -> str:
    """Guarantee that standalone S1-S20 references use official parentheses."""
    return re.sub(
        r"(?<![A-Za-z0-9_(<（])S([1-9]|1\d|20)(?![A-Za-z0-9_)>）])",
        lambda match: f"(S{match.group(1)})",
        str(text),
        flags=re.IGNORECASE,
    )


def _extract_explicit_dialogues(prompt: str) -> list[tuple[str, str]]:
    """Extract only dialogue that the user explicitly supplied, preserving its exact text."""
    source = str(prompt or "")
    candidates = []
    speech_marker = r"(?:说|说道|说着|喊|喊道|问|问道|回答|答道|台词|对白|says?|speaks?|shouts?|asks?|replies?)"
    patterns = (
        rf"{speech_marker}[^\n“”‘’\"']{{0,20}}[：:]?\s*[“\"]([^”\"\n]+)[”\"]",
        rf"{speech_marker}[^\n“”‘’\"']{{0,20}}[：:]?\s*[‘']([^’'\n]+)[’']",
        # 无引号时，只取到句末标点，避免把后续动作描述也吞进对话
        rf"{speech_marker}\s*[：:]\s*([^\n；;。！？.!?]+)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, source, flags=re.IGNORECASE):
            value = match.group(1).strip().strip("“”‘’\"'").strip()
            existing = {item[0] for item in candidates}
            if not value or value in existing or any(value in item or item in value for item in existing):
                continue
            language = "Chinese" if re.search(r"[\u3400-\u9fff]", value) else "English"
            candidates.append((value, language))
    return candidates


def _clean_nested_dialogue_tags(text: str) -> str:
    """【层1防御】修复 LLM 偶尔输出的嵌套 <d> 标签。
    支持：<d>[Chinese]、<d> [Chinese]（中间有空格）
    支持：结尾自动补齐未闭合的 </d>
    """
    result = []
    depth = 0
    i = 0
    text = str(text)
    while i < len(text):
        # 匹配 <d> 可选空格 [Lang]
        m = re.match(r'<d>\s*\[([A-Za-z]+)\]', text[i:])
        if m:
            if depth == 0:
                result.append(f'<d>[{m.group(1)}]')
                depth = 1
            else:
                depth += 1
            i += m.end()
            continue
        if text.startswith('<d>', i):
            if depth == 0:
                result.append('<d>')
                depth = 1
            else:
                depth += 1
            i += 3
            continue
        if text.startswith('</d>', i):
            if depth == 1:
                result.append('</d>')
                depth = 0
            elif depth > 1:
                depth -= 1
            i += 4
            continue
        result.append(text[i])
        i += 1
    # 【关键】结束时如果有未闭合的 <d>，补上闭合标签
    if depth > 0:
        result.append('</d>')
    return ''.join(result)
    """【层1防御】修复 LLM 偶尔输出的嵌套 <d> 标签。
    例：<d>[Chinese] <d>[Chinese]兄弟 </d>？...？</d>
    修：<d>[Chinese] 兄弟 ？...？</d>
    """
    result = []
    depth = 0
    i = 0
    text = str(text)
    while i < len(text):
        m = re.match(r'<d>\[([A-Za-z]+)\]', text[i:])
        if m:
            if depth == 0:
                result.append(m.group(0))
                depth = 1
            else:
                depth += 1
            i += m.end()
            continue
        if text.startswith('<d>', i):
            if depth == 0:
                result.append('<d>')
                depth = 1
            else:
                depth += 1
            i += 3
            continue
        if text.startswith('</d>', i):
            if depth == 1:
                result.append('</d>')
                depth = 0
            elif depth > 1:
                depth -= 1
            i += 4
            continue
        result.append(text[i])
        i += 1
    return ''.join(result)


def _ensure_supplied_dialogues(text: str, user_prompt: str, output_language: str) -> str:
    """Keep supplied dialogue exactly once and inside the main shot timeline."""
    result = str(text)
    dialogues_to_insert = []
    for index, (dialogue, language) in enumerate(_extract_explicit_dialogues(user_prompt), start=1):
        tag = f"<d>[{language}]{dialogue}</d>"
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        if tag in timeline:
            # Remove accidental duplicates outside the timeline while preserving the valid occurrence.
            prefix = result[:main_start].replace(tag, "")
            suffix = result[main_end:].replace(tag, "")
            result = prefix + timeline + suffix
            continue
        # A correctly tagged line outside the shot timeline is structurally invalid; move rather than duplicate it.
        result = result.replace(tag, "")
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        if dialogue in timeline:
            replaced = False
            for quoted in (f"“{dialogue}”", f"‘{dialogue}’", f'"{dialogue}"', f"'{dialogue}'"):
                if quoted in timeline:
                    timeline = timeline.replace(quoted, tag, 1)
                    replaced = True
                    break
            if not replaced:
                timeline = timeline.replace(dialogue, tag, 1)
            result = result[:main_start] + timeline + result[main_end:]
            continue
        dialogues_to_insert.append((index, tag))

    if dialogues_to_insert:
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        cue = re.search(
            r"(?:开口说话|开始说话|随后说|继续说|说话|演唱|唱着|begins? speaking|starts? speaking|speaks?|says?|sings?)",
            timeline,
            flags=re.IGNORECASE,
        )
        if cue:
            boundary = re.search(r"[。！？.!?](?:\s|$)", timeline[cue.end():])
            insert_at = cue.end() + boundary.end() if boundary else cue.end()
        else:
            shot = re.search(r"\[Shot 1\]\s*", timeline, flags=re.IGNORECASE)
            insert_at = shot.end() if shot else 0
        sentences = []
        for order, (index, tag) in enumerate(dialogues_to_insert):
            if str(output_language).lower() in {"中文", "chinese", "zh", "zh-cn"}:
                action = "说" if order == 0 else "随后继续说"
                sentences.append(f"画面中的说话者 (S{index}) {action}：{tag}")
            else:
                action = "says" if order == 0 else "then continues"
                sentences.append(f"The on-screen speaker (S{index}) {action}: {tag}")
        insertion = " " + " ".join(sentences) + " "
        timeline = timeline[:insert_at] + insertion + timeline[insert_at:]
        result = result[:main_start] + timeline + result[main_end:]
    return re.sub(r"[ \t]+\n", "\n", result).strip()


def _ensure_fl2va_picture_labels(text: str, task: str, duration: float, output_language: str) -> str:
    """Guarantee that an FL2VA result retains both official bare picture labels."""
    if str(task).upper() != "FL2VA":
        return text
    lowered = str(text).lower()
    if "picture 1" in lowered and "picture 2" in lowered:
        return text
    if str(output_language).lower() in {"中文", "chinese", "zh", "zh-cn"}:
        alignment = (
            f"参考图像与目标视频对齐关系：picture 1 对齐目标视频的 0.00 秒首帧；"
            f"picture 2 对齐目标视频的 {duration:.2f} 秒尾帧。"
        )
    else:
        alignment = (
            "Reference-picture alignment: picture 1 is the target video's exact opening frame at 0.00s; "
            f"picture 2 is its exact ending frame at {duration:.2f}s."
        )
    return f"{alignment}\n\n{text}".strip()


def _extract_openai(data: dict) -> str:
    try:
        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content")
        if isinstance(content, list):
            text = "".join(
                str((item.get("text") or {}).get("value") if isinstance(item.get("text"), dict) else item.get("text") or "")
                for item in content if isinstance(item, dict)
            ).strip()
        else:
            text = str(content or "").strip()
        if text:
            return text
        finish_reason = str(choice.get("finish_reason") or "unknown")
        reasoning = str(message.get("reasoning_content") or "").strip()
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        details = usage.get("completion_tokens_details") if isinstance(usage.get("completion_tokens_details"), dict) else {}
        reasoning_tokens = details.get("reasoning_tokens")
        if reasoning or reasoning_tokens:
            raise RuntimeError(
                "API 请求已完成，但模型仅返回了推理内容，没有最终提示词"
                f"（finish_reason={finish_reason}, reasoning_tokens={reasoning_tokens or 'unknown'}）。"
                "请关闭模型思考模式或提高输出 token 上限。"
            )
        raise RuntimeError(f"API 请求成功但返回内容为空（finish_reason={finish_reason}）")
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("The API returned no optimized prompt")


def _extract_openai_responses(data: dict) -> str:
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    texts = []
    for output in data.get("output") or []:
        if not isinstance(output, dict):
            continue
        for content in output.get("content") or []:
            if not isinstance(content, dict) or content.get("type") not in {"output_text", "text"}:
                continue
            value = content.get("text")
            if isinstance(value, dict):
                value = value.get("value")
            if value:
                texts.append(str(value))
    if texts:
        return "".join(texts).strip()
    raise RuntimeError("OpenAI Responses returned no optimized prompt")


def _request_parts(config: dict, payload: dict):
    task = str(payload.get("task") or "T2VA")
    duration = float(payload.get("duration") or 5)
    media = payload.get("media") if isinstance(payload.get("media"), list) else []
    labels = [str(item.get("label")) for item in media if item.get("label")]
    user_prompt = str(payload.get("prompt") or "")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    system = _system_prompt(
        task,
        duration,
        labels,
        str(config.get("output_language") or "English"),
        context,
        user_prompt,
        str(config.get("template") or "minimax_h3"),
        str(config.get("custom_system_prompt") or ""),
    )
    parts = _user_parts(user_prompt, media, bool(config.get("read_media")))
    max_tokens = max(512, min(8192, int(config.get("max_tokens") or 4096)))
    headers = {"Content-Type": "application/json"}
    if config["protocol"] == "gemini":
        gemini_parts = []
        for part in parts:
            if part["type"] == "text":
                gemini_parts.append({"text": part["text"]})
            else:
                url = part["image_url"]["url"]
                header, encoded = url.split(",", 1)
                mime = header.split(";")[0].split(":", 1)[1]
                gemini_parts.append({"inline_data": {"mime_type": mime, "data": encoded}})
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": gemini_parts}],
            "generationConfig": {"temperature": 0.35, "maxOutputTokens": max_tokens},
        }
        url = _endpoint(config)
        separator = "&" if "?" in url else "?"
        url += separator + "key=" + urllib.parse.quote(config["api_key"])
    elif config["protocol"] == "responses":
        response_parts = []
        for part in parts:
            if part["type"] == "text":
                response_parts.append({"type": "input_text", "text": part["text"]})
            else:
                response_parts.append({
                    "type": "input_image",
                    "image_url": part["image_url"]["url"],
                    "detail": part["image_url"].get("detail", "low"),
                })
        body = {
            "model": config["model"],
            "instructions": system,
            "input": [{"role": "user", "content": response_parts}],
            "temperature": 0.35,
            "max_output_tokens": max_tokens,
        }
        headers["Authorization"] = f"Bearer {config['api_key']}"
        url = _endpoint(config)
    else:
        body = {
            "model": config["model"],
            "temperature": 0.35,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": parts},
            ],
        }
        # SiliconFlow reasoning models may consume the whole output budget in
        # reasoning_content and return an empty final content while still
        # charging for a successful request. Prompt optimization needs the
        # final answer only, so explicitly disable thinking on this compatible
        # endpoint. Unsupported models ignore or accept this documented field.
        api_host = urllib.parse.urlparse(str(config.get("api_url") or "")).hostname or ""
        model_name = str(config.get("model") or "").lower()
        siliconflow_thinking_model = any(marker in model_name for marker in (
            "qwen3", "deepseek", "glm-4.5", "glm-4.6", "glm-4.7", "glm-5", "hunyuan-a13b",
        ))
        if api_host.lower() == "api.siliconflow.cn" and siliconflow_thinking_model:
            body["enable_thinking"] = False
        headers["Authorization"] = f"Bearer {config['api_key']}"
        url = _endpoint(config)
    return url, headers, body


async def _request_runninghub(config: dict, payload: dict) -> str:
    api_key = str(config.get("api_key") or "")
    provider = str(config.get("provider") or "runninghub").lower()
    overseas = provider == "runninghub_overseas"
    app_nodes = RUNNINGHUB_APP_NODES["runninghub_overseas" if overseas else "runninghub"]
    rh_base = "https://www.runninghub.ai" if overseas else "https://www.runninghub.cn"
    rh_api_base = f"{rh_base}/openapi/v2"
    rh_app_id = RUNNINGHUB_OVERSEAS_APP_ID if overseas else RUNNINGHUB_APP_ID
    rh_host = "https://www.runninghub.ai" if overseas else "https://www.runninghub.cn"
    model_cache = _RUNNINGHUB_OVERSEAS_MODELS_CACHE if overseas else _RUNNINGHUB_MODELS_CACHE
    request_id = str(payload.get("request_id") or "")
    media = payload.get("media") if isinstance(payload.get("media"), list) else []
    task = str(payload.get("task") or "T2VA")
    duration = float(payload.get("duration") or 5)
    labels = [str(item.get("label")) for item in media if item.get("label")]
    system_prompt = _system_prompt(
        task, duration, labels, str(config.get("output_language") or "English"),
        payload.get("context") if isinstance(payload.get("context"), dict) else {},
        str(payload.get("prompt") or ""),
        str(config.get("template") or "minimax_h3"),
        str(config.get("custom_system_prompt") or ""),
    )
    mapping_notes = []
    video_node = str(app_nodes["video"])
    image_nodes = tuple(str(node_id) for node_id in app_nodes["images"])
    node_values = {video_node: "None", **{node_id: "None" for node_id in image_nodes}}
    timeout = aiohttp.ClientTimeout(total=200)
    temp_dir = Path(tempfile.mkdtemp(prefix="gh_h3_rh_"))
    task_id = ""
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            image_index = 0
            video_uploaded = False
            for item in media:
                kind = str(item.get("kind") or "")
                label = str(item.get("label") or "")
                if kind == "image":
                    images = item.get("images") or []
                    if image_index < len(image_nodes) and images:
                        node_id = image_nodes[image_index]
                        node_values[node_id] = await _runninghub_upload(
                            session, api_key, data_url=images[0], filename=f"reference_{image_index + 1}.jpg", api_base=rh_api_base
                        )
                        mapping_notes.append(f"{label} corresponds to uploaded image {image_index + 1}.")
                        image_index += 1
                    else:
                        mapping_notes.append(f"{label} exists as an image reference label, but its visual file was not transmitted.")
                elif kind == "video" and not item.get("labelOnly"):
                    if not video_uploaded and item.get("source_name"):
                        processed = temp_dir / "reference_1fps.mp4"
                        await _runninghub_video(str(item["source_name"]), duration, processed)
                        node_values[video_node] = await _runninghub_upload(session, api_key, path=processed, api_base=rh_api_base)
                        mapping_notes.append(f"{label} corresponds to the uploaded 1 FPS reference video.")
                        video_uploaded = True
                    else:
                        mapping_notes.append(f"{label} exists as a video reference label, but its visual file was not transmitted.")
                elif kind == "audio":
                    mapping_notes.append(f"{label} is an audio reference label; audio data is not separately transmitted.")

            user_prompt = "User prompt:\n" + str(payload.get("prompt") or "")
            if mapping_notes:
                user_prompt += "\n\nReference mapping:\n" + "\n".join(mapping_notes)
            node_info = [
                {"nodeId": video_node, "fieldName": "file", "fieldValue": node_values[video_node]},
                *[
                    {"nodeId": node_id, "fieldName": "image", "fieldValue": node_values[node_id]}
                    for node_id in image_nodes
                ],
                {"nodeId": str(app_nodes["model"]), "fieldName": "model", "fieldValue": str(config.get("model") or model_cache[0])},
                {"nodeId": str(app_nodes["system_prompt"]), "fieldName": "Text", "fieldValue": system_prompt},
                {"nodeId": str(app_nodes["user_prompt"]), "fieldName": "Text", "fieldValue": user_prompt},
                {"nodeId": str(app_nodes["max_tokens"]), "fieldName": "value", "fieldValue": str(int(config.get("max_tokens") or 4096))},
            ]
            async with session.post(
                f"{rh_api_base}/run/ai-app/{rh_app_id}",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"nodeInfoList": node_info, "instanceType": "default", "usePersonalQueue": False},
            ) as response:
                body = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"RunningHub 应用启动失败 ({response.status}): {body[:1000]}")
                started = json.loads(body)
            if started.get("code") not in (0, "0", None):
                raise RuntimeError(f"RunningHub 应用启动失败: {started.get('msg') or started}")
            start_data = started.get("data") if isinstance(started.get("data"), dict) else started
            task_id = str(start_data.get("taskId") or "")
            if not task_id:
                edition = "海外版" if overseas else "国内版"
                error_code = str(start_data.get("errorCode") or started.get("errorCode") or "").strip()
                error_message = str(start_data.get("errorMessage") or started.get("errorMessage") or "").strip()
                if error_code or error_message:
                    details = ": ".join(part for part in (error_code, error_message) if part)
                    raise RuntimeError(f"RunningHub {edition}应用启动失败：{details}")
                raise RuntimeError(
                    f"RunningHub {edition}应用启动响应缺少 taskId；请确认使用的是{edition}专用 API Key。"
                    f"服务端响应: {body[:800]}"
                )
            if request_id:
                _ACTIVE_RH_TASKS[request_id] = (api_key, task_id, rh_host)

            while True:
                cancel_event = payload.get("_cancel_event")
                if cancel_event is not None and cancel_event.is_set():
                    await _runninghub_cancel(api_key, task_id, rh_host)
                    raise asyncio.CancelledError
                await asyncio.sleep(2)
                async with session.post(
                    f"{rh_api_base}/query",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"taskId": task_id},
                ) as response:
                    body = await response.text()
                    if response.status >= 400:
                        raise RuntimeError(f"RunningHub 任务查询失败 ({response.status}): {body[:1000]}")
                    queried = json.loads(body)
                if queried.get("code") not in (0, "0", None):
                    raise RuntimeError(f"RunningHub 任务查询失败: {queried.get('msg') or queried}")
                query_data = queried.get("data") if isinstance(queried.get("data"), dict) else queried
                status = str(query_data.get("status") or query_data.get("taskStatus") or "").upper()
                if status == "SUCCESS":
                    return await _runninghub_result_text(session, query_data.get("results") or [])
                if status in {"FAILED", "CANCELLED", "CANCELED"}:
                    message = query_data.get("errorMessage") or query_data.get("failedReason") or status
                    raise RuntimeError(f"RunningHub 提示词优化失败: {message}")
    except asyncio.CancelledError:
        active = _ACTIVE_RH_TASKS.get(request_id)
        if active:
            await _runninghub_cancel(*active)
        elif task_id:
            await _runninghub_cancel(api_key, task_id, rh_host)
        raise
    except asyncio.TimeoutError as error:
        if task_id:
            await _runninghub_cancel(api_key, task_id, rh_host)
        raise RuntimeError("RunningHub 提示词优化超过200秒，云端任务已取消") from error
    finally:
        if request_id:
            _ACTIVE_RH_TASKS.pop(request_id, None)
        shutil.rmtree(temp_dir, ignore_errors=True)


async def _request_async(config: dict, payload: dict) -> str:
    if config.get("mode") == "local":
        model_path = _local_model_path(config)
        if model_path.suffix.lower() != ".gguf" and _local_missing_dependencies():
            raise RuntimeError("本地视觉模型依赖缺失: " + ", ".join(_local_missing_dependencies()))
        try:
            return await asyncio.wait_for(asyncio.to_thread(_local_generate, config, payload), timeout=200)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            cancel_event = payload.get("_cancel_event")
            if cancel_event:
                cancel_event.set()
            raise
    if config.get("provider") == "runninghub" or config.get("protocol") == "runninghub":
        return await _request_runninghub(config, payload)
    url, headers, body = _request_parts(config, payload)
    try:
        timeout = aiohttp.ClientTimeout(total=200)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=body) as response:
                text = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"API request failed ({response.status}): {text[:1000]}")
                data = json.loads(text)
    except asyncio.CancelledError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        raise RuntimeError(f"API request failed: {error}") from error
    if config["protocol"] == "gemini":
        try:
            return "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"]).strip()
        except (KeyError, IndexError, TypeError):
            raise RuntimeError("Gemini returned no optimized prompt")
    if config["protocol"] == "responses":
        return _extract_openai_responses(data)
    return _extract_openai(data)


async def get_prompt_optimizer_config(_request):
    config = _public_config(DEFAULT_CONFIG)
    config["models"] = _scan_visual_models()
    config["mmproj_models"] = _scan_mmproj_models()
    config["missing_dependencies"] = _local_missing_dependencies()
    config["gguf_dependency"] = _gguf_dependency_status()
    return web.json_response(config)


def _local_missing_dependencies() -> list[str]:
    import importlib.util
    required = ("torch", "transformers", "PIL", "accelerate", "safetensors")
    return [name for name in required if importlib.util.find_spec(name) is None]


async def list_prompt_optimizer_models(_request):
    return web.json_response({
        "models": _scan_visual_models(),
        "mmproj_models": _scan_mmproj_models(),
        "missing_dependencies": _local_missing_dependencies(),
        "gguf_dependency": _gguf_dependency_status(),
    })


async def refresh_runninghub_models(_request):
    try:
        provider = str(_request.query.get("provider") or "runninghub").lower()
        if provider not in {"runninghub", "runninghub_overseas"}:
            provider = "runninghub"
        models = await _refresh_runninghub_models(provider)
        return web.json_response({
            "provider": provider,
            "runninghub_models": list(models) if provider == "runninghub" else list(_RUNNINGHUB_MODELS_CACHE),
            "runninghub_overseas_models": list(models) if provider == "runninghub_overseas" else list(_RUNNINGHUB_OVERSEAS_MODELS_CACHE),
        })
    except Exception as error:
        if str(_request.query.get("provider") or "").lower() == "runninghub_overseas":
            return web.json_response({
                "provider": "runninghub_overseas",
                "runninghub_models": list(_RUNNINGHUB_MODELS_CACHE),
                "runninghub_overseas_models": list(_RUNNINGHUB_OVERSEAS_MODELS_CACHE),
                "warning": f"RunningHub 海外版模型页暂时无法公开读取，继续使用内置列表: {error}",
            })
        return web.json_response({"error": str(error)}, status=502)


async def save_prompt_optimizer_config(request):
    return web.json_response(_public_config(_normalize_config(await request.json())))


def _prepare_prompt_optimization(payload: dict) -> tuple[dict, threading.Event]:
    node_config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    config = _normalize_config(node_config)
    if config.get("mode") == "local":
        model_path = _local_model_path(config)
        if model_path.suffix.lower() == ".gguf":
            _selected_mmproj(config, _selected_local_model(config))
        elif _local_missing_dependencies():
            raise RuntimeError("本地视觉模型依赖缺失: " + ", ".join(_local_missing_dependencies()))
    elif not config.get("api_url") or not config.get("model") or not config.get("api_key"):
        raise ValueError("请先配置提示词优化 API")
    cancel_event = threading.Event()
    payload["_cancel_event"] = cancel_event
    return config, cancel_event


def _cleanup_generic_prompt(text: str) -> str:
    """Light cleanup for non-H3 templates: fences, quoting, blank-line collapse."""
    value = str(text or "").strip()
    lines = value.splitlines()
    if lines and re.match(r"^```[a-zA-Z]*\s*$", lines[0].strip()):
        lines = lines[1:]
    if lines and re.match(r"^```\s*$", lines[-1].strip()):
        lines = lines[:-1]
    value = "\n".join(lines).strip()
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    for opening, closing in (("\u201c", "\u201d"), ('"', '"'), ("'", "'")):
        if len(value) >= 2 and value.startswith(opening) and value.endswith(closing):
            value = value[len(opening):-len(closing)].strip()
            break
    return value


async def _run_prompt_optimization(config: dict, payload: dict) -> str:
    result = await _request_async(config, payload)
    if not result:
        raise RuntimeError("API 返回了空提示词")
    template = str(config.get("template") or "minimax_h3").lower()
    formatted = _strip_filenames(result)
    if template == "minimax_h3":
        formatted = _format_prompt_sections(formatted)
        # 【层1防御】清洗 LLM 偶尔输出的嵌套 <d> 标签
        formatted = _clean_nested_dialogue_tags(formatted)
        formatted = _ensure_fl2va_picture_labels(
            formatted,
            str(payload.get("task") or "T2VA"),
            float(payload.get("duration") or 5),
            str(config.get("output_language") or "English"),
        )
        formatted = _ensure_supplied_dialogues(
            formatted,
            str(payload.get("prompt") or ""),
            str(config.get("output_language") or "English"),
        )
        return _normalize_subject_shorthand(formatted)
    if template == "image":
        formatted = _format_prompt_sections(formatted)
        return _normalize_subject_shorthand(formatted)
    return _cleanup_generic_prompt(formatted)


def _register_optimizer_task(request_id: str, task: asyncio.Task, cancel_event: threading.Event) -> None:
    previous_cancel_event = _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    if previous_cancel_event is not None:
        previous_cancel_event.set()
    previous = _ACTIVE_REQUESTS.pop(request_id, None)
    if previous is not None:
        previous.cancel()
    _ACTIVE_CANCEL_EVENTS[request_id] = cancel_event
    _ACTIVE_REQUESTS[request_id] = task


async def optimize_prompt(request):
    request_id = ""
    try:
        payload = await request.json()
        request_id = str(payload.get("request_id") or "")
        config, cancel_event = _prepare_prompt_optimization(payload)
        task = asyncio.create_task(_run_prompt_optimization(config, payload))
        if request_id:
            _register_optimizer_task(request_id, task, cancel_event)
        formatted = await task
        return web.json_response({"prompt": formatted})
    except asyncio.CancelledError:
        return web.json_response({"error": "提示词优化已取消"}, status=499)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)
    finally:
        if request_id:
            _ACTIVE_REQUESTS.pop(request_id, None)
            _ACTIVE_CANCEL_EVENTS.pop(request_id, None)


async def start_prompt_optimization(request):
    """Start a long optimization without holding a hosted reverse-proxy request open."""
    try:
        payload = await request.json()
        request_id = str(payload.get("request_id") or "")
        if not request_id:
            raise ValueError("提示词优化请求缺少 request_id")
        config, cancel_event = _prepare_prompt_optimization(payload)
        task = asyncio.create_task(_run_prompt_optimization(config, payload))
        old_job = _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
        if old_job is not None:
            old_job.cancel()
        _ASYNC_OPTIMIZER_JOBS[request_id] = task
        _register_optimizer_task(request_id, task, cancel_event)
        return web.json_response({"request_id": request_id, "status": "running"}, status=202)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


async def prompt_optimization_status(request):
    request_id = str(request.query.get("request_id") or "")
    task = _ASYNC_OPTIMIZER_JOBS.get(request_id)
    if task is None:
        return web.json_response({"error": "找不到提示词优化任务"}, status=404)
    if not task.done():
        return web.json_response({"status": "running"})
    _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
    _ACTIVE_REQUESTS.pop(request_id, None)
    _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    try:
        return web.json_response({"status": "success", "prompt": task.result()})
    except asyncio.CancelledError:
        return web.json_response({"error": "提示词优化已取消"}, status=499)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


async def cancel_prompt_optimization(request):
    payload = await request.json()
    request_id = str(payload.get("request_id") or "")
    task = _ACTIVE_REQUESTS.pop(request_id, None)
    async_job = _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
    cancel_event = _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    if cancel_event is not None:
        cancel_event.set()
    if task is not None:
        task.cancel()
    if async_job is not None and async_job is not task:
        async_job.cancel()
    runninghub_task = _ACTIVE_RH_TASKS.pop(request_id, None)
    if runninghub_task is not None:
        try:
            await _runninghub_cancel(*runninghub_task)
        except Exception:
            pass
    return web.json_response({"cancelled": task is not None or async_job is not None or cancel_event is not None or runninghub_task is not None})


def register_prompt_optimizer_routes() -> bool:
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return True
    instance = getattr(PromptServer, "instance", None)
    if instance is None:
        return False
    routes = instance.routes
    routes.get("/universal-prompt-optimizer/config")(get_prompt_optimizer_config)
    routes.get("/universal-prompt-optimizer/models")(list_prompt_optimizer_models)
    routes.get("/universal-prompt-optimizer/runninghub-models")(refresh_runninghub_models)
    routes.post("/universal-prompt-optimizer/config")(save_prompt_optimizer_config)
    routes.post("/universal-prompt-optimizer/optimize")(optimize_prompt)
    routes.post("/universal-prompt-optimizer/start")(start_prompt_optimization)
    routes.get("/universal-prompt-optimizer/status")(prompt_optimization_status)
    routes.post("/universal-prompt-optimizer/cancel")(cancel_prompt_optimization)
    _ROUTES_REGISTERED = True
    return True


register_prompt_optimizer_routes()
#（注：内容由AI生成）
