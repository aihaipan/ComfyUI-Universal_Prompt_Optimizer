# Original work by aihaipan. Licensed under GPL-3.0-or-later.
# See LICENSE for full text.


from __future__ import annotations

import logging

from comfy_api.latest import ComfyExtension, io


NODE_CATEGORY = "Universal Prompt/R2V Bridge"


class MiniMaxH3R2VBridgeGH(io.ComfyNode):
    """Bridge a universal prompt + media bundle into the MiniMax H3 Director.

    The Director's ``r2v_groups`` input expects a single ``MMX_DIR_GROUP``
    dict (or a list of them). This node builds exactly that, so the universal
    prompt optimizer can drive the Director's r2v mode without duplicating
    upload / optimization UI inside the Director node.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MiniMaxH3R2VBridgeGH",
            display_name="MiniMax H3 R2V 桥接器",
            category=NODE_CATEGORY,
            description=(
                "Convert a universal prompt + media bundle into the MiniMax H3 "
                "Director's r2v_groups input. Connect the universal optimizer's "
                "prompt and media_bundle outputs, then wire this node into the "
                "Director's r2v_groups. Set the Director task_type to r2v."
            ),
            inputs=[
                io.String.Input(
                    "prompt",
                    multiline=True,
                    dynamic_prompts=True,
                    default="",
                    tooltip="优化后的提示词（来自通用优化节点的 prompt 输出）",
                ),
                io.Float.Input(
                    "duration_sec",
                    default=5.0,
                    min=0.1,
                    max=30.0,
                    step=0.1,
                    tooltip="该 r2v 组的时长（秒）",
                ),
                io.Custom("GH_MEDIA_BUNDLE").Input(
                    "media_bundle",
                    optional=True,
                    tooltip="通用优化节点的 media_bundle 输出；未连接则视为空组",
                ),
            ],
            outputs=[
                io.Custom("MMX_DIR_GROUP").Output("r2v_group"),
            ],
        )

    @classmethod
    def execute(cls, prompt="", duration_sec=5.0, media_bundle=None):
        bundle = media_bundle if isinstance(media_bundle, dict) else {}
        images = dict(bundle.get("images") or {})
        videos = dict(bundle.get("videos") or {})
        audios = dict(bundle.get("audios") or {})
        video_audios = dict(bundle.get("video_audios") or {})

        # 结构与 Director external_groups.pack_r2v_group 完全对齐。
        # Director 的 normalize_groups_list 会接受单个 dict 并包成 [dict]。
        group = {
            "version": 1,
            "family": "r2v",
            "kind": "r2v",
            "prompt": str(prompt or "").strip(),
            "duration_sec": float(duration_sec) if duration_sec else 5.0,
            "first_frame": None,
            "last_frame": None,
            "ref_images": images,
            "ref_videos": videos,
            "ref_video_audios": video_audios,
            "ref_audios": audios,
        }
        logging.info(
            "MiniMax H3 R2V bridge: %d image(s), %d audio(s), prompt=%d chars",
            len(images),
            len(audios),
            len(group["prompt"]),
        )
        return io.NodeOutput(group)


class MiniMaxH3R2VBridgeExtension(ComfyExtension):
    async def get_node_list(self):
        return [MiniMaxH3R2VBridgeGH]


def comfy_entrypoint():
    return MiniMaxH3R2VBridgeExtension()