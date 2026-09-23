# ComfyUI Universal Prompt Optimizer

[English](#english) | [中文](#中文)

---

## English

A universal prompt optimizer node for ComfyUI. Turn rough natural-language ideas into production-ready prompts for any model — video (MiniMax H3, LTX, Wan, Kling, Veo, Sora) or image (Flux, Z-Image, Qwen-Image).

### Features

- Rich-text prompt editor with `@图N` / `@video N` / `@audio N` references
- Media upload with per-item **weight** (0.1–2.0) for attention control
- Dual mode: **video** and **image** prompts, each with isolated cache and history
- History menu with up to 3 cached optimization results per mode
- Optimize once, compare original ↔ optimized with one-click toggle
- Free duration control (0–30s) with fast-cut / slow-motion adaptive pacing
- Optional **R2V Bridge** node for MiniMax H3 Director (`r2v_groups` input)
- Multi-language output (Chinese / English)

### Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/aihaipan/ComfyUI-Universal_Prompt_Optimizer.git
```
Restart ComfyUI.

Quick Start
Add Universal Prompt Optimizer node.

Upload reference images / videos / audio.

Write your idea in plain language, referencing media with @图1, @图2 etc.

Click ✦ to optimize.

Connect the prompt output to any text encoder (CLIP, T5, etc.).

Optional: MiniMax H3 Director Integration
If you use AIMixer/ComfyUI_MiniMaxH3_Director:

Add the MiniMax H3 R2V Bridge (GH) node.

Connect media_bundle and prompt from the optimizer to the bridge.

Connect the bridge's r2v_group output to the Director's r2v_groups input.

Set the Director's task type to r2v.

### Configuration
Open the ⚙ settings panel and choose:

Optimization mode: Online API (OpenAI / Gemini / OpenRouter / DashScope / SiliconFlow / RunningHub) or Local vision model (GGUF / Transformers)

Output language: Chinese / English

Prompt format template: video templates + image prompt

### Credits

This plugin's core prompt optimization pipeline (`prompt_optimizer.py`) and the base framework of the frontend rich-text editor (`web/universal_prompt_optimizer.js`) are derived from **[goohai](https://github.com/goohai)**'s open-source project **[Goohai-MiniMax-H3_Integration](https://github.com/goohai/Goohai-MiniMax-H3_Integration)**. Sincere thanks to the original author.

The original project is licensed under **GPL-3.0-or-later**; this plugin strictly follows the same license and preserves all original copyright notices.

Special thanks to [AIMixer/ComfyUI_MiniMaxH3_Director](https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director) for providing the official MiniMax H3 Director foundation. The R2V bridge node in this plugin is designed specifically for its `r2v_groups` input.

### License

GPL-3.0-or-later

### 中文
一个通用的 ComfyUI 提示词优化节点。把大白话想法变成任何模型都能用的专业提示词 —— 视频（MiniMax H3、LTX、Wan、可灵、Veo、Sora）或图片（Flux、Z-Image、Qwen-Image）。

功能特性
富文本提示词编辑器，支持 @图N / @video N / @audio N 引用

素材上传，每张可设权重（0.1–2.0）控制注意力

双模式：视频与图片提示词，各自的缓存与历史完全隔离

历史菜单，每个模式最多保留 3 条优化缓存

一键对比大白话 ↔ 优化稿

时长自由控制（0–30 秒），自动识别快剪 / 慢镜节奏

可选 R2V 桥接器节点，配合 MiniMax H3 Director（r2v_groups 输入）

中英双语输出

### 安装
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/aihaipan/ComfyUI-Universal_Prompt_Optimizer.git
```

重启 ComfyUI。

### 快速开始
添加 万能提示词优化 节点。

上传参考图 / 视频 / 音频。

用大白话写你的想法，用 @图1、@图2 引用素材。

点击 ✦ 优化。

把 prompt 输出接到任何文本编码器（CLIP、T5 等）。

可选：MiniMax H3 Director 整合
如果你使用 AIMixer/ComfyUI_MiniMaxH3_Director：

添加 MiniMax H3 R2V 桥接器 (GH) 节点。

把优化器的 media_bundle 和 prompt 输出连到桥接器。

把桥接器的 r2v_group 输出连到导演台的 r2v_groups 输入。

把导演台的任务类型设为 r2v。

### 配置
打开 ⚙ 设置面板：

优化方式：在线 API（OpenAI / Gemini / OpenRouter / 阿里云百炼 / SiliconFlow / RunningHub）或本地视觉模型（GGUF / Transformers）

输出语言：中文 / English

提示词格式模板：视频模板 + Image Prompt

### 致谢 / Credits

本插件的核心提示词优化管线（`prompt_optimizer.py`）以及前端富文本编辑器的基础框架（`web/universal_prompt_optimizer.js`）源自 **[goohai](https://github.com/goohai)** 的开源项目 **[Goohai-MiniMax-H3_Integration](https://github.com/goohai/Goohai-MiniMax-H3_Integration)**，在此表示诚挚感谢。

原项目采用 **GPL-3.0-or-later** 协议，本插件严格遵循同一协议发布，并保留了原项目的所有版权声明。

同时感谢 [AIMixer/ComfyUI_MiniMaxH3_Director](https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director) 提供的 MiniMax H3 官方导演台底子，本插件的 R2V 桥接器专为其 `r2v_groups` 输入接口设计。

### 许可证
GPL-3.0-or-later