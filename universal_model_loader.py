import json
import folder_paths
import comfy.sd
import comfy.utils
from comfy_api.latest import io, ComfyExtension

class UniversalH3ModelLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="UniversalH3ModelLoader",
            display_name="Universal 模型动态加载台台",
            category="Universal Prompt/Loaders",
            description="动态加载各种格式的模型、LoRA和VAE。",
            inputs=[
                io.String.Input("loader_config", default="{}", multiline=True, dynamic_prompts=False),
            ],
            outputs=[
                io.Model.Output(display_name="model"),
                io.Clip.Output(display_name="clip"),
                io.Vae.Output(display_name="vae"),
                io.Vae.Output(display_name="audio_vae"),
            ],
        )

    @classmethod
    def execute(cls, loader_config):
        try:
            config = json.loads(loader_config)
        except Exception:
            config = {}

        def normalize_list(lst):
            res = []
            for item in lst:
                if isinstance(item, str):
                    res.append({"name": item})
                else:
                    res.append(item)
            return res

        models = normalize_list(config.get("models", []))
        loras = normalize_list(config.get("loras", []))
        clips = normalize_list(config.get("clips", []))
        vaes = normalize_list(config.get("vaes", []))
        audio_vaes = normalize_list(config.get("audio_vaes", []))

        model = None
        clip = None
        vae = None
        audio_vae = None

        # 1. 加载主模型
        for m_info in models:
            m_name = m_info.get("name")
            if not m_name: continue
            
            dtype = m_info.get("weight_dtype", "default")
            model_options = {}
            if dtype != "default":
                model_options["weight_dtype"] = dtype

            path = folder_paths.get_full_path("diffusion_models", m_name)
            if path:
                model = comfy.sd.load_diffusion_model(path, model_options=model_options)
            else:
                path = folder_paths.get_full_path("checkpoints", m_name)
                out = comfy.sd.load_checkpoint_guess_config(path, output_vae=True, output_clip=True, model_options=model_options)
                model, clip, vae = out[0], out[1], out[2]

        if model is None:
            raise ValueError("必须至少加载一个主模型！")

        # 2. LoRA
        for l_info in loras:
            l_name = l_info.get("name")
            l_strength = float(l_info.get("strength", 1.0))
            if not l_name or l_name == "(无可用文件)": continue
            path = folder_paths.get_full_path("loras", l_name)
            if path:
                # 【关键修复】新版 ComfyUI 要求先加载 state_dict，不能直接传路径
                lora_sd = comfy.utils.load_torch_file(path, safe_load=True)
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora_sd, l_strength, l_strength)

        # 3. CLIP
        if clips:
            c_info = clips[-1]
            c_name = c_info.get("name")
            if c_name:
                path = folder_paths.get_full_path("clip", c_name) or folder_paths.get_full_path("text_encoders", c_name)
                c_type = c_info.get("clip_type", "minimax")
                
                # 【修复】新版 ComfyUI 不再接受 clip_device 关键字，直接去掉，它会在底层自动分配设备
                model_options = {}
                clip = comfy.sd.load_clip(
                    ckpt_paths=[path], 
                    embedding_directory=folder_paths.get_folder_paths("embeddings"), 
                    clip_type=c_type,
                    model_options=model_options
                )

        # 4. 视频 VAE
        if vaes:
            v_name = vaes[-1].get("name")
            if v_name:
                path = folder_paths.get_full_path("vae", v_name)
                vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(path))

        # 5. 音频 VAE
        if audio_vaes:
            a_name = audio_vaes[-1].get("name")
            if a_name:
                path = folder_paths.get_full_path("vae", a_name)
                audio_vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(path))

        return io.NodeOutput(model, clip, vae, audio_vae)

class UniversalModelLoaderExtension(ComfyExtension):
    async def get_node_list(self):
        return [UniversalH3ModelLoader]

__all__ = ["UniversalModelLoaderExtension"]