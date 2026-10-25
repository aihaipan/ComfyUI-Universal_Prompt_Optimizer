import torch
import json
import logging
from comfy_api.latest import io, ComfyExtension

# 导入采样器类
from .h3_sampler.segment_sampler import UniversalSegmentSampler

class UniversalMiniMax_H3Director(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="UniversalMiniMax_H3Director",
            display_name="Universal MiniMax_H3 导演台mini",
            category="Universal Prompt/Director",
            description="直接接收模型和素材，一键输出最终视频和音频。",
            enable_expand=True,  # 允许图展开
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.Vae.Input("vae"),
                io.Vae.Input("audio_vae"),
                # 接收万能节点的数据
                io.Custom("UNIVERSAL_MEDIA_BUNDLE").Input("media_bundle", optional=True),
                io.Custom("UNIVERSAL_PROMPT_STR").Input("prompt_finite", optional=True),
                io.Custom("UNIVERSAL_SEGMENTS_STR").Input("segments_json", optional=True),
                
                # 参数配置
                io.String.Input("director_config", optional=True, default=""),
                io.Int.Input("width", default=864, min=64, max=4096, step=32, optional=True),
                io.Int.Input("height", default=480, min=64, max=4096, step=32, optional=True),
                io.Int.Input("fps", default=24, min=1, max=60, optional=True),
                io.Int.Input("steps", default=8, min=1, max=100, optional=True),
                io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF, optional=True),
                
                # 二采参数
                io.Boolean.Input("second_pass", default=False, label_on="开启二采", label_off="关闭二采", optional=True),
                io.String.Input("second_pass_model", default="", optional=True),
                io.Int.Input("second_pass_high_steps", default=2, min=1, max=10, optional=True),
            ],
            outputs=[
                io.Custom("VIDEO").Output("video"),
            ],
        )

    @classmethod
    def execute(cls, model, clip, vae, audio_vae, media_bundle, prompt_finite, segments_json, 
                director_config="", width=864, height=480, fps=24, steps=8, seed=0,
                refine_width=None, refine_height=None,
                second_pass=False, second_pass_model="", second_pass_high_steps=2, second_pass_mode="selflift", exec_mode="full",
                audio_mode="参考音色", bridge_overlaps="", save_video=False, 
                filename_prefix="Universal_MiniMax_H3director/Universal_MiniMax_H3director", refmod_mods=None,
                tile_overlap_patches=0):
        
        # 【防御】检查所有必须的模型输入
        if vae is None or clip is None or model is None or audio_vae is None:
            raise ValueError("【导演台错误】缺失核心模型输入（model/clip/vae/audio_vae），请检查上游连线！")
        if media_bundle is None and not segments_json:
            raise ValueError("【导演台错误】缺少数据输入！请连接万能节点的 media_bundle 和 segments_json。")
        
        # 【核心清理】从 segments_json 中提取万能节点塞进来的 director_config，并剔除它
        clean_segments_json = segments_json
        try:
            if segments_json:
                seg_obj = json.loads(segments_json)
                # 如果里面有 director_config，把它取出来，并从原始 JSON 里删掉
                cfg_from_json = seg_obj.pop("director_config", None)
                clean_segments_json = json.dumps(seg_obj)
                
                # 如果接口上没传配置，但有 JSON 配置，就用 JSON 配置覆盖
                if not director_config and cfg_from_json:
                    director_config = json.dumps(cfg_from_json)
        except Exception as e:
            logging.warning("解析 segments_json 失败: %s", e)

        # 如果连了万能节点传来的配置，优先使用配置里的参数
        if director_config:
            try:
                cfg = json.loads(director_config)
                width = int(cfg.get("width", width))
                height = int(cfg.get("height", height))
                steps = int(cfg.get("steps", steps))
                seed = int(cfg.get("seed", seed))
            except Exception as e:
                logging.warning("Failed to parse director_config: %s", e)

        # 调用底层采样器（底层会自动处理视频保存逻辑）
        out = UniversalSegmentSampler.execute(
            model=model, clip=clip, vae=vae, audio_vae=audio_vae,
            finite_plan=None, 
            media_bundle=media_bundle,
            prompt_finite=prompt_finite,
            segments_json=clean_segments_json, 
            duration_sec=5.0, 
            width=width, height=height, 
            refine_width=refine_width or width,
            refine_height=refine_height or height,
            audio_mode=audio_mode,
            second_pass=second_pass, 
            second_pass_model=second_pass_model, 
            second_pass_high_steps=second_pass_high_steps, 
            second_pass_mode=second_pass_mode,
            tile_overlap_patches=tile_overlap_patches,
            exec_mode=exec_mode,
            bridge_overlaps=bridge_overlaps,
            sampler_name="euler", scheduler="simple", steps=steps, denoise=1.0, seed=seed,
            continue_audio_latent=True, ref_image_size="match",
            fps=fps, 
            save_video=save_video, 
            video_prefix=filename_prefix,
            refmod_mods=refmod_mods
        )

                # 【对齐底层】取底层传来的第 5 个值（Video）
        return io.NodeOutput(out.result[4], expand=out.expand)


class UniversalMiniMax_H3DirectorExtension(ComfyExtension):
    async def get_node_list(self):
        return [UniversalMiniMax_H3Director]

__all__ = ["UniversalMiniMax_H3DirectorExtension"]