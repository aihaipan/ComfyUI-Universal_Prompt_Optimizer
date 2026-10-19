// Modified by aihaipan (2026-09) from goohai/Goohai-MiniMax-H3_Integration.
// Licensed under GPL-3.0-or-later. See LICENSE for full text.


import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE = "UniversalDirectorUI";
const OPTIMIZER_ROUTE = "/universal-prompt-optimizer";
const DONE_SOUND_URL = new URL("../audio/done.mp3", import.meta.url).href;

const PROMPT_TEMPLATES = {
    minimax_h3: "MiniMax H3",
    image: "Image Prompt",
    ltx_2_5: "LTX 2.5",
    seedance_2_5: "Seedance 2.5",
    wan_2_2: "Wan 2.2",
    flux_2: "FLUX.2",
    z_image: "Z-Image",
    qwen_image: "Qwen-Image",
    kling: "Kling 可灵",
    hunyuan_video: "HunyuanVideo 混元视频",
    veo_3: "Veo 3",
    sora_2: "Sora 2",
    custom: "自定义模板",
};

const WIDTH = 500;
const PANEL_WIDTH = 476;

const IMAGE_SLOTS = Array.from({ length: 9 }, (_, i) => `ref_image_${i + 1}`);
const VIDEO_SLOTS = Array.from({ length: 3 }, (_, i) => `ref_video_${i + 1}`);
const AUDIO_SLOTS = Array.from({ length: 3 }, (_, i) => `ref_audio_${i + 1}`);
const REFMOD_SLOTS = Array.from({ length: 8 }, (_, i) => `refmod_${i + 1}`);
const ALL_SLOTS = [...IMAGE_SLOTS, ...VIDEO_SLOTS, ...AUDIO_SLOTS, ...REFMOD_SLOTS];

const DOM_TRANSLATIONS = {
    "+ Add media": "＋ 添加素材",
    "Prompt: Type @ to reference uploaded media, e.g. @图片1, @video 1, @audio 2": "提示词：输入 @ 引用素材，如 @图片1、@video 1、@audio 2",
    "Reference media": "参考素材",
    "全能参考": "全能参考",
    "Images x9 · Videos x3 · Audios x3": "图像x9 · 视频x3 · 音频x3",
    "Optimize": "优化",
    "Optimizing click to cancel": "优化中 点击取消",
    "Optimizing": "优化中",
    "Restore before optimization": "恢复优化前",
    "Configure API": "配置API",
    "Save": "保存", "Cancel": "取消",
    "LLM Prompt Optimization Configuration": "LLM提示词优化配置",
    "Optimization mode": "优化方式", "Online API": "在线 API", "Local vision model": "本地视觉模型",
    "Provider": "平台", "API key": "API Key", "API URL": "API 地址", "Model": "模型",
    "Protocol": "协议", "Output language": "输出语言", "Read visual references": "读取视觉素材",
    "Prompt format template": "提示词格式模板（目标模型）",
    "Maximum output tokens": "最大输出 Tokens",
    "Automatic optimization before run": "运行前自动优化提示词",
    "Refresh local models": "刷新本地模型", "Local model": "本地模型", "Local device": "本地设备",
    "Search local models": "搜索本地模型", "Search models": "搜索模型",
    "No matching models": "没有匹配的模型",
    "No compatible local vision models found": "未找到可用的本地视觉模型",
    "Missing local model dependencies": "缺少本地模型依赖",
    "Choose vision projector": "选择视觉投影模型", "Vision model (mmproj)": "视觉模型（mmproj）",
    "No mmproj models found": "未找到mmproj视觉模型",
    "Multiple matching mmproj files were found. Choose one:": "检测到多个匹配的mmproj文件，请选择一个：",
    "GGUF dependency unavailable": "GGUF运行依赖不可用",
    "Download matching dependency": "下载匹配依赖",
    "Restart ComfyUI after installation": "安装后请重启ComfyUI",
    "Custom": "自定义",
    "Prompt optimizer API is not configured. Open settings now?": "尚未配置提示词优化 API，是否立即打开设置？",
    "Confirm": "确定",
    "自定义系统提示词": "自定义系统提示词",
    "Reference image": "参考图",
    "Reference video": "参考视频",
    "Reference audio": "参考音频",
    "Up to 9 images": "最多9张图",
    "Up to 3 videos": "最多3个视频",
    "Up to 3 audios": "最多3个音频",
    "Remove": "移除",
    "Trim audio": "裁剪音频",
};

Object.assign(DOM_TRANSLATIONS, {
    "Audio trim": "音频截取", "Start": "开始", "End": "结束",
    "Selected duration": "选取时长", "Play selection": "播放选区", "Pause preview": "暂停预览",
    "Sync target duration": "同步目标时长", "Saving": "保存中",
    "Audio decoding failed": "音频解码失败", "Audio trim failed": "音频裁剪失败",
});

function currentLocale() {
    const c = [
        app?.ui?.settings?.getSettingValue?.("Comfy.Locale"),
        app?.ui?.settings?.getSettingValue?.("Comfy.Language"),
        document.documentElement?.lang,
        localStorage.getItem("Comfy.Settings.Language"),
        navigator.language,
    ];
    return c.find(v => typeof v === "string" && v.trim())?.toLowerCase() || "en";
}
function isChineseLocale() { return /^(zh|cn|中文)/i.test(currentLocale()); }
function t(text) { return isChineseLocale() ? (DOM_TRANSLATIONS[text] || text) : text; }

function make(tag, css = {}, text = "") {
    const el = document.createElement(tag);
    Object.assign(el.style, css);
    if (text) el.textContent = text;
    return el;
}
function widget(node, name) { return node.widgets?.find(w => w.name === name); }
function hideWidget(w) {
    if (!w) return;
    w.hidden = true; w.options = w.options || {}; w.options.hidden = true;
    w.computeSize = () => [0, -4]; w.serialize = true;
}
function kindOf(file) {
    if (file.type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) return "image";
    if (file.type?.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) return "video";
    if (file.type?.startsWith("audio/") || /\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|wma|aif|aiff|alac|amr|caf|ac3|mp2)$/i.test(file.name)) return "audio";
    return null;
}
function fileUrl(name) {
    if (!name || name === "(none)") return "";
    const parts = String(name).replaceAll("\\", "/").split("/").filter(Boolean);
    const filename = parts.pop() || "";
    const params = new URLSearchParams({ filename, type: "input", subfolder: parts.join("/") });
    const path = `/view?${params.toString()}`;
    return typeof api.apiURL === "function" ? api.apiURL(path) : path;
}
async function uploadFile(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");
    const r = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    const result = await r.json();
    return [result.subfolder, result.name].filter(Boolean).join("/");
}

function createPanel(node) {
    if (typeof node.addDOMWidget !== "function") return false;

    // root 宽度 100% 跟随节点，高度 100% 用 flex 把空间分配给子元素。
    // 关键点：
    //   - height: 100% —— root 撑满 ComfyUI 的 DOM 容器，否则 flex:1 无意义
    //   - minHeight: 0 —— 允许 flex 子元素（编辑器）收缩到比内容小，触发滚动
    //   - overflow: hidden —— 防止内容溢出节点边界
    //   - 不再锁 width —— 用户拖宽节点时面板跟着变宽
    const root = make("div", {
        position: "relative", width: "100%", boxSizing: "border-box",
        color: "#d7e3ef", fontFamily: "Arial,sans-serif",
        fontSize: "12px", userSelect: "none", padding: "3px 0 2px",
        display: "flex", flexDirection: "column", gap: "6px",
        height: "100%", minHeight: "0", overflow: "hidden",
    });

    const style = make("style");
    style.textContent = `
        .ghupo-box{border:1px solid #334a5d;border-radius:8px;padding:7px;background:#111c27}
        .ghupo-banner{background:#0aa4d6;color:#06131b;font:13px/1 Arial,sans-serif;font-weight:600;margin:-7px -7px 7px -7px;border-radius:8px 8px 0 0;letter-spacing:.5px;overflow:hidden}
        .ghupo-tabs{display:flex;gap:0}
        .ghupo-tab{flex:1;text-align:center;padding:10px 12px;cursor:pointer;user-select:none;font:12px/1 Arial,sans-serif;font-weight:600;background:rgba(6,19,27,.45);color:rgba(224,242,242,.68);transition:background .15s,color .15s;white-space:nowrap}
        .ghupo-tab:hover{background:rgba(6,19,27,.58)}
        .ghupo-tab.active{background:#0aa4d6;color:#06131b}
        .ghupo-banner-count-row{padding:6px 12px;text-align:center;font:11px/1 Arial,sans-serif;color:rgba(6,19,27,.72);font-weight:400;background:#0aa4d6}
        .ghupo-banner-count{white-space:nowrap}
        .ghupo-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
        .ghupo-drop{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#08b4ed;cursor:pointer;border:1px dashed #2c5368;border-radius:6px;background:#101b26;padding:4px;box-sizing:border-box}
        .ghupo-drop:hover{border-color:#0aa4d6;background:#142633}
        .ghupo-drop-icon{font-size:14px;line-height:1.2;color:#08b4ed}
        .ghupo-drop-title{font-size:10px;line-height:1.2;color:#d9e8f2}
        .ghupo-empty{grid-column:1/-1;width:100%;aspect-ratio:5.2/1;align-items:flex-start;justify-content:center;text-align:left;padding:18px 24px}
        .ghupo-empty .ghupo-drop-icon{font-size:14px;margin-right:8px}
        .ghupo-empty .ghupo-drop-title{font-size:12px}
        .ghupo-empty .ghupo-drop-subtitle{font-size:9px;margin-top:8px;color:#8697a7}
        .ghupo-card{position:relative;aspect-ratio:1;border:1px solid #30485c;border-radius:6px;background:#1a2938;overflow:hidden;cursor:pointer}
        .ghupo-card img,.ghupo-card video{display:block;width:100%;height:100%;object-fit:cover;background:#071018}
        .ghupo-card:hover img,.ghupo-card:hover video{object-fit:contain}
        .ghupo-card-name{position:absolute;left:0;right:0;bottom:0;padding:2px 15px 2px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;background:rgba(10,20,30,.6);font-size:7px;line-height:1.15}
        .ghupo-remove{position:absolute;right:1px;bottom:0;border:0;background:transparent;color:#d3e0ea;cursor:pointer;font-size:11px;z-index:3}
        .ghupo-weight{position:absolute;right:3px;top:3px;display:inline-flex;align-items:center;height:14px;background:rgba(20,32,44,.88);border:1px solid #2c4255;border-radius:3px;padding:0 1px;font:9px/12px Arial,sans-serif;z-index:4}
        .ghupo-weight-dec,.ghupo-weight-inc{width:10px;height:12px;padding:0;border:0;background:transparent;color:#6f8291;font:10px/12px Arial,sans-serif;cursor:pointer;user-select:none}
        .ghupo-weight-dec:hover,.ghupo-weight-inc:hover{color:#cdf0f7}
        .ghupo-weight-input{width:22px;height:12px;background:transparent;border:0;color:#a9bac8;text-align:center;font:9px/12px Arial,sans-serif;outline:none;padding:0;-moz-appearance:textfield;cursor:ew-resize}
        .ghupo-weight-input::-webkit-outer-spin-button,.ghupo-weight-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .ghupo-weight-input.high{color:#ffd76b}
        .ghupo-weight-input.low{color:#6ba6ff}
        /* 【体验修复】音频跟图片一样正方缩略图 */
        .ghupo-audio{aspect-ratio:1}
        .ghupo-audio .ghupo-card-name{font-size:7px;padding-left:3px}
        .ghupo-audio-icon{display:flex;align-items:center;justify-content:center;height:100%;color:#0aa4d6;font-size:48px;background:linear-gradient(135deg,#14222d 0%,#1a3040 100%)}
        .ghupo-tools{display:flex;align-items:center;gap:4px;padding:2px 4px;background:#1d2731;border-radius:6px;height:22px}
        .ghupo-template{max-width:112px;height:17px;padding:0 2px;border:1px solid #2c4255;border-radius:3px;background:#14202c;color:#a9bac8;font:9px/15px Arial,sans-serif;outline:none;cursor:pointer}
        .ghupo-tool{height:17px;min-width:17px;padding:0 3px;border:0;border-radius:3px;background:#1d2731;color:#6f8291;font:11px/17px Arial,sans-serif;cursor:pointer;opacity:.72}
        .ghupo-tool:hover{color:#9aabb8;background:#24323e}
        .ghupo-tool:disabled{opacity:.25;cursor:not-allowed}
        .ghupo-elapsed{display:none;color:#617684;font:9px/17px Arial,sans-serif}
        .ghupo-elapsed.visible{display:inline-block}
        .ghupo-duration{display:inline-flex;align-items:center;height:17px;background:#14202c;border:1px solid #2c4255;border-radius:3px;padding:0 2px;font:9px/15px Arial,sans-serif;gap:1px;margin-right:auto}
        .ghupo-duration-label{color:#6f8291;padding:0 2px;white-space:nowrap}
        .ghupo-duration-input{width:24px;height:15px;background:transparent;border:0;color:#cdf0f7;text-align:center;font:9px/15px Arial,sans-serif;outline:none;padding:0;-moz-appearance:textfield;cursor:ew-resize}
        .ghupo-duration-input::-webkit-outer-spin-button,.ghupo-duration-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .ghupo-duration-btn{width:12px;height:15px;padding:0;border:0;background:transparent;color:#6f8291;font:11px/15px Arial,sans-serif;cursor:pointer;user-select:none}
        .ghupo-duration-btn:hover{color:#cdf0f7}
        .ghupo-duration-unit{color:#6f8291;padding:0 2px;white-space:nowrap}
        .ghupo-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:rgba(96,116,130,.6);font:8px/17px Arial,sans-serif;margin-left:auto}
        .ghupo-loading{color:#0aa4d6!important;opacity:1!important;animation:ghupo-spin 1.6s linear infinite}
        @keyframes ghupo-spin{to{transform:rotate(360deg)}}
        .ghupo-prompt-wrap{flex:1;position:relative;width:100%;min-height:0;overflow:hidden;background:#1d2731;border-radius:6px}
        /* 【进度条】双条：总进度（蓝）+ 本段进度（绿） */
        .ghupo-progress-panel{display:none;flex-direction:column;gap:5px;padding:8px 10px;background:#0f1a24;border:1px solid #2c4255;border-radius:6px;flex-shrink:0}
        .ghupo-progress-panel.visible{display:flex}
        .ghupo-progress-title{color:#cdf0f7;font-weight:600;font-size:11px;margin-bottom:2px}
        .ghupo-progress-row{display:flex;align-items:center;gap:8px;font:11px/1.4 Arial}
        .ghupo-progress-tag{min-width:44px;text-align:right;font-weight:600}
        .ghupo-progress-tag.total{color:#4a90e2}
        .ghupo-progress-tag.seg{color:#52d17a}
        .ghupo-progress-track{flex:1;height:6px;background:#0a141d;border-radius:3px;overflow:hidden;position:relative}
        .ghupo-progress-fill{position:absolute;left:0;top:0;bottom:0;width:0%;transition:width .25s ease;border-radius:3px}
        .ghupo-progress-fill.total{background:linear-gradient(90deg,#0aa4d6,#4a90e2)}
        .ghupo-progress-fill.seg{background:linear-gradient(90deg,#52d17a,#27d9e5)}
        .ghupo-progress-val{min-width:70px;color:#6f8291;font-size:10px;text-align:right}
        .ghupo-prompt{position:absolute;left:0;right:0;top:0;bottom:0;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:transparent;color:#e1e9ef;border-radius:6px;padding:7px;font:12px/2.35 Arial,sans-serif;outline:none;user-select:text;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;scrollbar-width:thin;scrollbar-color:#3a5364 #1d2731}
        .ghupo-prompt::-webkit-scrollbar{width:8px}
        .ghupo-prompt::-webkit-scrollbar-track{background:#1d2731;border-radius:4px}
        .ghupo-prompt::-webkit-scrollbar-thumb{background:#3a5364;border-radius:4px}
        .ghupo-prompt::-webkit-scrollbar-thumb:hover{background:#4a6878}
        .ghupo-prompt.ghupo-prompt-empty:before{content:attr(data-placeholder);position:absolute;left:7px;right:7px;top:7px;color:#52616d;white-space:pre-wrap;pointer-events:none}
        .ghupo-tag{display:inline-block;padding:1px 5px;margin:0 2px;border-radius:5px;background:#3b3b3b;color:#cdcdcd;font-size:.86em;line-height:1.35;vertical-align:middle;white-space:nowrap}
        .ghupo-tag-picture{background:#31515a;color:#cdf0f7}
        .ghupo-tag-video{background:#493f59;color:#e0cdf7}
        .ghupo-tag-audio{background:#3b3b3b;color:#cdcdcd}
        .ghupo-tag-ghost{background:transparent!important;border:1px dashed #5b7c8f!important;color:#8ea3b4!important;cursor:not-allowed}
        .ghupo-tag-refmod{background:#5a4930;color:#f7e0cd;-webkit-text-fill-color:#f7e0cd;border:1px solid #8a6d43}
        .ghupo-refmod-kind{cursor:pointer;user-select:none;transition:filter .12s}
        .ghupo-refmod-kind:hover{filter:brightness(1.4)}
        .ghupo-preview.ghupo-refmod-name{flex:initial;width:auto;height:auto;padding:0 5px;font:9px/1.4 Arial;color:#f7e0cd;background:rgba(90,73,48,.55);border:1px solid #8a6d43;border-radius:3px;display:inline-block;vertical-align:middle;margin:0 3px 0 1px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}
        .ghupo-preview{display:inline-flex;vertical-align:middle;flex:0 0 26px;width:26px;height:26px;margin-left:.5em;margin-right:4px;border:1px solid rgba(91,124,143,.72);border-radius:5px;background:#14222d;color:#77a5b7;align-items:center;justify-content:center;font:14px/26px Arial,sans-serif;overflow:hidden;vertical-align:middle}
        .ghupo-preview img{width:100%;height:100%;object-fit:cover}
        .ghupo-preview.audio{border-radius:50%}
        .ghupo-preview.audio:before{content:"♫";font-size:13px}
        .ghupo-tag-subject{background:#2d3a4d;color:#a8c4e0;-webkit-text-fill-color:#a8c4e0;padding:1px 5px;border-radius:5px;font-size:.86em;line-height:1.35;white-space:nowrap;display:inline-block;margin:0 2px}
        .ghupo-tag-bracket{background:#3d2d4d;color:#d0b6e8;-webkit-text-fill-color:#d0b6e8;padding:1px 5px;border-radius:5px;font-size:.86em;line-height:1.35;white-space:nowrap;display:inline-block;margin:0 2px}
        .ghupo-tag-shorthand{background:#1d4a4a;color:#88d8d0;-webkit-text-fill-color:#88d8d0;padding:1px 5px;border-radius:5px;font-size:.86em;line-height:1.35;white-space:nowrap;display:inline-block;margin:0 2px}
        .ghupo-tag-other{background:#3b3b3b;color:#cdcdcd;-webkit-text-fill-color:#cdcdcd;padding:1px 5px;border-radius:5px;font-size:.86em;line-height:1.35;white-space:nowrap;display:inline-block;margin:0 2px}
        .ghupo-section{color:#27d9e5;-webkit-text-fill-color:#27d9e5;font-weight:600;background:transparent}
        .ghupo-dialogue{color:#27d9e5;-webkit-text-fill-color:#27d9e5;background:transparent;padding:0;font:inherit}
        .ghupo-token{display:inline-flex;align-items:center;vertical-align:middle}
        .ghupo-mention{position:fixed;z-index:10100;min-width:180px;max-height:240px;overflow-y:auto;background:#17222c;border:1px solid #3a4d5b;border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.5);padding:4px;font:12px Arial,sans-serif}
        .ghupo-mention-item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;color:#dce7ee;cursor:pointer}
        .ghupo-mention-item:hover{background:#274252}
        .ghupo-mention-item.selected{background:#274252}
        .ghupo-mention-thumb{flex:0 0 22px;width:22px;height:22px;border-radius:4px;background:#14222d;border:1px solid rgba(91,124,143,.72);display:flex;align-items:center;justify-content:center;overflow:hidden}
        .ghupo-mention-thumb img,.ghupo-mention-thumb video{width:100%;height:100%;object-fit:cover}
        .ghupo-mention-thumb.audio:before{content:"♫";color:#77a5b7;font-size:12px}
        .ghupo-mention-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ghupo-history-menu{position:fixed;z-index:10100;min-width:220px;max-width:280px;background:#17222c;border:1px solid #3a4d5b;border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.5);padding:4px;font:12px Arial,sans-serif}
        .ghupo-history-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:4px;color:#dce7ee;cursor:pointer;white-space:nowrap;overflow:hidden}
        .ghupo-history-item:hover{background:#274252}
        .ghupo-history-info{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ghupo-history-del{flex-shrink:0;width:16px;height:16px;padding:0;border:0;background:transparent;color:#6f8291;font:12px/16px Arial,sans-serif;cursor:pointer;border-radius:3px}
        .ghupo-history-del:hover{color:#ff8080;background:rgba(255,80,80,.15)}
        .ghupo-history-empty{padding:12px;text-align:center;color:#6f8291;font:11px Arial,sans-serif}
        .ghupo-toast-container{position:fixed;right:20px;bottom:20px;z-index:10200;display:flex;flex-direction:column;gap:8px;pointer-events:none}
        .ghupo-toast{pointer-events:auto;background:#17222c;color:#d7e3ec;border:1px solid #3a4d5b;border-left:3px solid #0aa4d6;border-radius:6px;padding:8px 12px;font:12px Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);display:flex;align-items:center;gap:8px;max-width:280px}
        .ghupo-toast-close{border:0;background:transparent;color:#8ea3b4;cursor:pointer;font:14px Arial,sans-serif;padding:0 2px}
        .ghupo-toast-close:hover{color:#cdf0f7}
        .ghupo-overlay{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.58);font:12px Arial,sans-serif}
        .ghupo-dialog{width:min(470px,calc(100vw - 30px));max-height:calc(100vh - 40px);overflow-y:auto;background:#17222c;color:#d7e3ec;border:1px solid #344958;border-radius:9px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px}
        .ghupo-dialog-title{font-size:12px;margin-bottom:12px;white-space:nowrap}
        .ghupo-row{display:grid;grid-template-columns:140px minmax(0,1fr);align-items:center;gap:8px;min-height:34px;margin:0}
        .ghupo-row>span{white-space:nowrap}
        .ghupo-row input,.ghupo-row select,.ghupo-row textarea{width:100%;box-sizing:border-box;background:#1d2b36;color:#dce7ee;border:1px solid #3a4d5b;border-radius:4px;padding:5px;font:inherit}
        .ghupo-row.ghupo-custom-row{grid-template-columns:1fr;align-items:start;gap:6px}
        .ghupo-row.ghupo-custom-row textarea{font:12px/1.45 Consolas,Menlo,monospace;resize:vertical}
        .ghupo-row.ghupo-hidden{display:none!important}
        .ghupo-lang{display:grid;grid-template-columns:1fr 1fr;gap:4px}
        .ghupo-lang label{display:flex;align-items:center;gap:4px}
        .ghupo-lang input{width:auto}
        .ghupo-check{width:auto!important;justify-self:end}
        .ghupo-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
        .ghupo-actions button{border:1px solid #3a4d5b;border-radius:4px;background:#1d2b36;color:#cbd8e0;padding:5px 14px;cursor:pointer}
        .ghupo-actions button:last-child{background:#17535a;border-color:#26717a;color:#e0f2f2}
        .ghupo-storyboard{background:#0f1a24;border:1px solid #2c4255;border-radius:6px;overflow:hidden;flex-shrink:0}
        .ghupo-sb-header{display:flex;align-items:center;gap:6px;padding:5px 8px;background:#1a2a38;cursor:pointer;user-select:none;font:10px/1.4 Arial,sans-serif}
        .ghupo-sb-header:hover{background:#1f3140}
        .ghupo-sb-title{color:#cdf0f7;font-weight:600}
        .ghupo-sb-meta{color:#6f8291;font-size:9px;margin-left:auto}
        .ghupo-sb-toggle{color:#6f8291;font-size:11px;padding:0 2px;min-width:12px;text-align:center}
        .ghupo-sb-body{padding:0;overflow-x:auto;overflow-y:hidden;position:relative;scrollbar-width:thin;scrollbar-color:#3a5364 #0f1a24}
        .ghupo-sb-body::-webkit-scrollbar{height:10px}
        .ghupo-sb-body::-webkit-scrollbar-track{background:#0a141d;border-radius:5px}
        .ghupo-sb-body::-webkit-scrollbar-thumb{background:#3a5364;border-radius:5px}
        .ghupo-sb-body::-webkit-scrollbar-thumb:hover{background:#4a6878}
        .ghupo-sb-body.hidden{display:none}
        .ghupo-tl-inner{position:relative;min-width:100%}
        /* 【L2-b】时间线刻度 */
        .ghupo-tl-ruler{position:relative;height:18px;background:#0a141d;border-bottom:1px solid #1e3344;user-select:none;overflow:hidden}
        .ghupo-tl-tick{position:absolute;top:0;height:100%;border-left:1px solid #1e3344;padding-left:3px;font:9px/18px Arial;color:#5a7183;box-sizing:border-box;white-space:nowrap;pointer-events:none}
        .ghupo-tl-tick.sub{border-left-color:#16283a;height:8px}
        /* 【L2-b】时间线轨道 */
        .ghupo-tl-track{position:relative;height:180px;background:#0f1a24;overflow:hidden}
        .ghupo-tl-seg{position:absolute;top:6px;bottom:6px;border:1px solid;border-radius:6px;box-sizing:border-box;padding:8px 10px;overflow:hidden;font:11px/1.35 Arial;cursor:grab;transition:box-shadow .12s}
        .ghupo-tl-seg.edge-hover{cursor:ew-resize}
        .ghupo-tl-seg.dragging{opacity:.35;cursor:grabbing}
        .ghupo-tl-seg.active{box-shadow:0 0 0 2px #0aa4d6 inset}
        .ghupo-tl-seg-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;margin-bottom:3px;font-size:12px}
        .ghupo-tl-seg-time{opacity:.7;font-size:10px}
        .ghupo-tl-seg-thumbs{display:flex;gap:3px;margin-top:6px;flex-wrap:wrap}
        .ghupo-tl-seg-thumb{width:44px;height:44px;border-radius:4px;background:#0d1820;overflow:hidden;display:flex;align-items:center;justify-content:center;font:9px/44px Arial;color:#5a7183;flex-shrink:0}
        .ghupo-tl-seg-thumb img{width:100%;height:100%;object-fit:cover}
        /* 【L2-b】段块删除按钮（hover 显示） */
        .ghupo-tl-seg-del{position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:4px;background:rgba(0,0,0,.45);color:#8ea3b4;font:13px/20px Arial;cursor:pointer;padding:0;display:none;z-index:2}
        .ghupo-tl-seg:hover .ghupo-tl-seg-del{display:block}
        .ghupo-tl-seg-del:hover{background:#ff5b5b;color:#fff}
        /* 【L2-b】标题栏"加段"按钮 */
        .ghupo-sb-add{height:18px;padding:0 8px;border:1px solid #2c4255;border-radius:3px;background:#1a2a38;color:#cdf0f7;font:10px/16px Arial;cursor:pointer;margin-left:8px}
        .ghupo-sb-add:hover{background:#24475a;border-color:#0aa4d6}
        .ghupo-sb-shot{flex-shrink:0;display:flex;flex-direction:column;gap:2px;align-items:center;padding:2px 3px;background:#14222d;border:1px solid #233a4a;border-radius:4px;min-width:28px}
        .ghupo-sb-thumbs{display:flex;gap:1px;flex-wrap:wrap;justify-content:center;max-width:64px}
        .ghupo-sb-thumb{width:22px;height:22px;border:1px solid #3a4d5b;border-radius:3px;background:#0d1820;display:flex;align-items:center;justify-content:center;overflow:hidden;font:8px/22px Arial;color:#8ea3b4;text-align:center}
        .ghupo-sb-thumb img{width:100%;height:100%;object-fit:cover}
        .ghupo-sb-label{font:8px/1 Arial;color:#6f8291;white-space:nowrap}
        /* ===== 二级 tab（生视频下的参考素材 / 参考模型） ===== */
        .ghupo-subtabs{display:flex;gap:0;margin:-7px -7px 0 -7px;overflow:hidden;background:#0aa4d6}
        .ghupo-subtab{flex:1;text-align:center;padding:6px 10px;cursor:pointer;user-select:none;font:11px/1 Arial;font-weight:500;background:rgba(6,19,27,.45);color:rgba(224,242,242,.68);transition:background .15s,color .15s;white-space:nowrap}
        .ghupo-subtab:hover{background:rgba(6,19,27,.58)}
        .ghupo-subtab.active{background:#0aa4d6;color:#06131b;font-weight:600}
        .ghupo-subpanel{padding-top:7px}
        .ghupo-subpanel.hidden{display:none}
        /* ===== RefMod 参考模型区 ===== */
        /* ===== RefMod 卡片网格 ===== */
        .ghupo-refmod-box{margin-top:0}
        .ghupo-refmod-body{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:0}
        .ghupo-refmod-card{position:relative;aspect-ratio:1;border:1px solid #30485c;border-radius:6px;background:#1a2938;overflow:hidden;cursor:pointer;transition:background .12s,border-color .12s}
        .ghupo-refmod-card:hover{background:#203648;border-color:#0aa4d6}
        .ghupo-refmod-card-icon{position:absolute;left:0;right:0;top:32%;text-align:center;font-size:32px;line-height:1;pointer-events:none}
        .ghupo-refmod-card-name-text{position:absolute;left:6px;right:6px;bottom:22px;height:20px;display:flex;align-items:center;justify-content:center;font:10px/1.2 Arial;color:#dce7ee;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;pointer-events:none;padding:0 2px}
        .ghupo-refmod-card-name-text::after{content:"▾";margin-left:3px;font-size:9px;color:#8ea3b4;flex-shrink:0;transition:color .12s}
        .ghupo-refmod-card:hover .ghupo-refmod-card-name-text::after{color:#0aa4d6}
        .ghupo-refmod-card-name-select{display:none}
        .ghupo-refmod-card-copies-group{position:absolute;top:3px;left:3px;display:inline-flex;align-items:center;height:16px;background:#0f1a24;border:1px solid #2c4255;border-radius:3px;padding:0 4px 0 2px;z-index:3}
        .ghupo-refmod-card-copies-group:hover{border-color:#0aa4d6}
        .ghupo-refmod-card-copies{width:16px;height:14px;background:transparent;border:0;color:#cdf0f7;text-align:center;font:10px/14px Arial;outline:none;-moz-appearance:textfield;padding:0;cursor:ew-resize}
        .ghupo-refmod-card-copies::-webkit-outer-spin-button,.ghupo-refmod-card-copies::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .ghupo-refmod-card-copies-unit{color:#6f8291;font:9px/14px Arial;padding-left:1px}
        .ghupo-refmod-card-strength{position:absolute;top:3px;right:3px;display:inline-flex;align-items:center;height:16px;background:#0f1a24;border:1px solid #2c4255;border-radius:3px;padding:0 1px;z-index:3}
        .ghupo-refmod-card-str-dec,.ghupo-refmod-card-str-inc{width:11px;height:14px;padding:0;border:0;background:transparent;color:#6f8291;font:11px/14px Arial;cursor:pointer;user-select:none}
        .ghupo-refmod-card-str-dec:hover,.ghupo-refmod-card-str-inc:hover{color:#cdf0f7}
        .ghupo-refmod-card-str-input{width:24px;height:14px;background:transparent;border:0;color:#cdf0f7;text-align:center;font:10px/14px Arial;outline:none;-moz-appearance:textfield;padding:0;cursor:ew-resize}
        .ghupo-refmod-card-str-input::-webkit-outer-spin-button,.ghupo-refmod-card-str-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .ghupo-refmod-card-del{position:absolute;bottom:3px;right:3px;width:18px;height:18px;padding:0;border:0;border-radius:3px;background:rgba(0,0,0,.4);color:#8ea3b4;font:12px/18px Arial;cursor:pointer;z-index:3}
        .ghupo-refmod-card-del:hover{background:#ff5b5b;color:#fff}
        .ghupo-refmod-card-kind{position:absolute;left:3px;bottom:3px;padding:1px 4px;border-radius:3px;font:9px/12px Arial;font-weight:600;white-space:nowrap;z-index:3}
        .ghupo-refmod-card-kind.picture{background:#31515a;color:#cdf0f7}
        .ghupo-refmod-card-kind.video{background:#493f59;color:#e0cdf7}
        .ghupo-refmod-card-kind.audio{background:#3b3b3b;color:#cdcdcd}
        .ghupo-refmod-card-kind.bundle{background:#5a4930;color:#f7e0cd}
        .ghupo-refmod-add-card{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#08b4ed;cursor:pointer;border:1px dashed #2c5368;border-radius:6px;background:#101b26;padding:6px;box-sizing:border-box}
        .ghupo-refmod-add-card:hover{border-color:#0aa4d6;background:#142633}
        .ghupo-refmod-add-card .icon{font-size:22px;line-height:1.2;color:#08b4ed}
        .ghupo-refmod-add-card .title{font-size:10px;line-height:1.3;color:#d9e8f2;margin-top:4px}
        .ghupo-refmod-add-card:disabled{opacity:.4;cursor:not-allowed}
        .ghupo-refmod-empty{grid-column:1/-1;padding:12px;text-align:center;color:#6f8291;font:10px Arial;font-style:italic}
        .ghupo-refmod-card-select optgroup{background:#0f1a24;color:#8ea3b4}
        .ghupo-refmod-card-select option{background:#0f1a24;color:#dce7ee}
        /* RefMod 模型选择浮层（复用 mention 风格） */
        .ghupo-refmod-picker{position:fixed;z-index:10100;min-width:200px;max-width:320px;max-height:280px;overflow-y:auto;background:#17222c;border:1px solid #3a4d5b;border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.5);padding:4px;font:12px Arial}
        .ghupo-refmod-picker-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;color:#dce7ee;cursor:pointer}
        .ghupo-refmod-picker-item:hover{background:#274252}
        .ghupo-refmod-picker-item.selected{background:#274252}
        .ghupo-refmod-picker-kind{flex-shrink:0;padding:1px 5px;border-radius:3px;font:9px/12px Arial;font-weight:600}
        .ghupo-refmod-picker-kind.picture{background:#31515a;color:#cdf0f7}
        .ghupo-refmod-picker-kind.video{background:#493f59;color:#e0cdf7}
        .ghupo-refmod-picker-kind.audio{background:#3b3b3b;color:#cdcdcd}
        .ghupo-refmod-picker-kind.bundle{background:#5a4930;color:#f7e0cd}
        .ghupo-refmod-picker-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ghupo-refmod-picker-group{padding:6px 8px 3px;color:#6f8291;font:9px Arial;font-weight:600}
        .ghupo-refmod-row .ghupo-refmod-select{flex:1;min-width:0;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:20px;padding:0 4px;font:10px Arial;outline:none}
        .ghupo-refmod-kind{padding:1px 5px;border-radius:3px;font:9px/14px Arial;font-weight:600;white-space:nowrap}
        .ghupo-refmod-kind.picture{background:#31515a;color:#cdf0f7}
        .ghupo-refmod-kind.video{background:#493f59;color:#e0cdf7}
        .ghupo-refmod-kind.audio{background:#3b3b3b;color:#cdcdcd}
        .ghupo-refmod-kind.bundle{background:#5a4930;color:#f7e0cd}
        .ghupo-refmod-num{width:32px;height:18px;background:#0f1a24;color:#cdf0f7;border:1px solid #2c4255;border-radius:3px;text-align:center;font:10px Arial;outline:none;-moz-appearance:textfield;padding:0}
        .ghupo-refmod-num::-webkit-outer-spin-button,.ghupo-refmod-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .ghupo-refmod-label{color:#6f8291;font-size:9px;white-space:nowrap}
        .ghupo-refmod-del{width:18px;height:18px;padding:0;border:0;border-radius:3px;background:transparent;color:#8ea3b4;font:13px/18px Arial;cursor:pointer}
        .ghupo-refmod-del:hover{background:#ff5b5b;color:#fff}
        .ghupo-refmod-add{height:22px;padding:0 10px;border:1px dashed #2c5368;border-radius:4px;background:transparent;color:#08b4ed;font:11px Arial;cursor:pointer}
        .ghupo-refmod-add:hover{background:#142633;border-color:#0aa4d6}
        .ghupo-refmod-add:disabled{opacity:.4;cursor:not-allowed}
        .ghupo-refmod-empty{padding:8px;text-align:center;color:#6f8291;font:10px Arial;font-style:italic}
        .ghupo-refmod-select optgroup{background:#0f1a24;color:#8ea3b4}
        .ghupo-refmod-select option{background:#0f1a24;color:#dce7ee}
    `;
    root.appendChild(style);

    // Media grid
    const mediaBox = make("div"); mediaBox.className = "ghupo-box";
    // 顶部横幅：跟导演台"全能参考"标签视觉一致，并显示当前素材计数。
    // 标题固定；计数每次 render() 时动态更新。
    const banner = make("div"); banner.className = "ghupo-banner";
    const tabsRow = make("div"); tabsRow.className = "ghupo-tabs";
    const videoTab = make("div", {}, t("生视频提示词优化")); videoTab.className = "ghupo-tab active"; videoTab.dataset.mode = "video";
    const imageTab = make("div", {}, t("生图提示词优化")); imageTab.className = "ghupo-tab"; imageTab.dataset.mode = "image";
    imageTab.style.display = "none"; // 【Max专属】隐藏生图Tab
    tabsRow.append(videoTab);
    const countRow = make("div"); countRow.className = "ghupo-banner-count-row";
    const bannerCount = make("span", {}, "图片 0/9 · 视频 0/3 · 音频 0/3"); bannerCount.className = "ghupo-banner-count";
    countRow.append(bannerCount);
    banner.append(tabsRow, countRow);
    mediaBox.appendChild(banner);

    // ---- 二级 tab（仅生视频模式下显示）：参考素材 / 参考模型 ----
    const subTabsRow = make("div"); subTabsRow.className = "ghupo-subtabs";
    const subTabMedia = make("div", {}, "参考素材"); subTabMedia.className = "ghupo-subtab active";
    subTabMedia.dataset.sub = "media";
    const subTabRefmod = make("div", {}, "参考模型"); subTabRefmod.className = "ghupo-subtab";
    subTabRefmod.dataset.sub = "refmod";
    subTabsRow.append(subTabMedia, subTabRefmod);
    mediaBox.appendChild(subTabsRow);

    // 参考素材容器（= 原来的素材网格）
    const mediaSubPanel = make("div"); mediaSubPanel.className = "ghupo-subpanel";
    const mediaGrid = make("div"); mediaGrid.className = "ghupo-grid";
    mediaSubPanel.appendChild(mediaGrid);
    mediaBox.appendChild(mediaSubPanel);

    // 参考模型容器（内容稍后填充）
    const refmodSubPanel = make("div"); refmodSubPanel.className = "ghupo-subpanel hidden";
    mediaBox.appendChild(refmodSubPanel);

    root.appendChild(mediaBox);

    // ---- RefMod 参考模型区（作为二级 tab 内容，默认全部展开，无折叠） ----
    const refmodBox = make("div"); refmodBox.className = "ghupo-refmod-box";
    const refmodBody = make("div"); refmodBody.className = "ghupo-refmod-body";
    refmodBox.appendChild(refmodBody);
    refmodSubPanel.appendChild(refmodBox);

    // Tools bar
    const tools = make("div"); tools.className = "ghupo-tools";
    const elapsed = make("span"); elapsed.className = "ghupo-elapsed";

    // ---- 【Max专属】分辨率计算器 ----
    const dirSizeGroup = make("span"); dirSizeGroup.className = "ghupo-duration";
    const arSelect = make("select"); arSelect.className = "ghupo-duration-input"; arSelect.style.width = "50px";
    arSelect.innerHTML = `<option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:3">4:3</option><option value="3:4">3:4</option>`;
    const mpInput = make("input"); mpInput.type = "number"; mpInput.step = "0.1"; mpInput.value = "0.4"; mpInput.className = "ghupo-duration-input"; mpInput.style.width = "30px"; mpInput.title = "百万像素";
    
    // 【新增】一采步数
    const stepsInput = make("input"); stepsInput.type = "number"; stepsInput.value = "8"; stepsInput.className = "ghupo-duration-input"; stepsInput.style.width = "30px"; stepsInput.title = "一采步数";
    
    const calcDimensions = () => {
        const ar = arSelect.value.split(":");
        const wRatio = parseInt(ar[0]) || 16;
        const hRatio = parseInt(ar[1]) || 9;
        const mp = parseFloat(mpInput.value) || 0.4;
        let w = Math.sqrt(mp * 1000000 * (wRatio / hRatio));
        let h = w * (hRatio / wRatio);
        w = Math.round(w / 32) * 32;
        h = Math.round(h / 32) * 32;
        return { w, h };
    };
    
    arSelect.onchange = () => { if (typeof persist === "function") persist(); };
    mpInput.onchange = () => { if (typeof persist === "function") persist(); };

    dirSizeGroup.append(make("span", {}, "比例"), arSelect, make("span", {}, "MP"), mpInput, make("span", {}, "步数"), stepsInput);

    // ---- 【Max专属】二采与音频独立面板 ----
    const audioSelect = make("select"); 
    audioSelect.className = "ghupo-duration-input"; 
    audioSelect.style.flex = "1";
    audioSelect.innerHTML = `<option value="参考音色">参考音色</option><option value="强制使用音频1">强制使用音频1</option>`;
    
    const spCheck = make("input"); spCheck.type = "checkbox"; spCheck.style.margin = "0";

    const spModelSelect = make("select"); 
    spModelSelect.className = "ghupo-duration-input"; 
    spModelSelect.style.flex = "1"; 
    spModelSelect.style.minWidth = "120px"; // 保证模型名字能显示完整
    spModelSelect.innerHTML = `<option value="">加载中...</option>`;
    
    const spStepsInput = make("input"); 
    spStepsInput.type = "number"; spStepsInput.value = "2"; spStepsInput.className = "ghupo-duration-input"; spStepsInput.style.width = "40px";

    // 构建独立面板
    const dirAdvancedPanel = make("div");
    dirAdvancedPanel.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:8px;background:#1d2731;border-radius:6px;margin:4px 0;border:1px solid #2c4255;";

    // 第一行：音频模式
    const audioRow = make("div");
    audioRow.style.cssText = "display:flex;align-items:center;gap:8px;";
    audioRow.append(make("span", {}, "音频模式"), audioSelect);

    // 第二行：二采设置
    const overlapInput = make("input"); 
    overlapInput.type = "text"; 
    overlapInput.value = ""; 
    overlapInput.placeholder = "如 [0, 24, 24]";
    overlapInput.className = "ghupo-duration-input";
    overlapInput.style.flex = "1";
    overlapInput.title = "段间重叠帧数（0 为硬切）。留空则默认 24 帧";

    const overlapRow = make("div");
    overlapRow.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;margin-top:4px;";
    overlapRow.append(make("span", {}, "段间重叠"), overlapInput);

    const execModeSelect = make("select");
    execModeSelect.className = "ghupo-duration-input";
    execModeSelect.style.flex = "1";
    execModeSelect.innerHTML = `<option value="full">全自动 (一采+二采)</option><option value="pass1">仅一采 (生成缓存)</option><option value="pass2">仅二采 (读取缓存)</option>`;
    
    const spRow = make("div");
    spRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px;";
    const spModeSelect = make("select");
    spModeSelect.className = "ghupo-duration-input";
    spModeSelect.style.flex = "1";
    spModeSelect.innerHTML = `<option value="selflift">极速二采 (SelfLift)</option><option value="refine">高清二采 (Refine)</option>`;
    
    const spToggle = make("label");
    spToggle.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;font-weight:bold;color:#0aa4d6;";
    spToggle.append(spCheck, make("span", {}, "开启二采"));

    const spStepsWrap = make("div");
    spStepsWrap.style.cssText = "display:flex;align-items:center;gap:4px;white-space:nowrap;";
    spStepsWrap.append(make("span", {}, "高清步数"), spStepsInput);

    spRow.append(spToggle, spModeSelect, spModelSelect, spStepsWrap);
    const execRow = make("div");
    execRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px;";
    execRow.append(make("span", {}, "显存调度"), execModeSelect);

    dirAdvancedPanel.append(audioRow, overlapRow, spRow, execRow);

    // 获取二采模型列表
    fetch("/minimax-bridge/upscalers").then(r => r.json()).then(data => {
        if (data && data.h3_compatible) {
            spModelSelect.innerHTML = "";
            if (data.h3_compatible.length === 0) {
                spModelSelect.appendChild(new Option("(无兼容模型)", ""));
            } else {
                data.h3_compatible.forEach(m => spModelSelect.appendChild(new Option(m.split('.')[0], m)));
            }
            // 触发一次持久化恢复
            if (typeof persist === "function") persist();
        }
    });

    // ---- 时长控件（视频提示词优化用）----
    // 0~30 秒自由输入，加减按钮步进 1，按住数字左右拖动可快速调整。
    const durationGroup = make("span"); durationGroup.className = "ghupo-duration";
    const durationLabel = make("span", {}, "时长"); durationLabel.className = "ghupo-duration-label";
    const durationDec = make("button", {}, "−"); durationDec.className = "ghupo-duration-btn";
    const durationInput = make("input"); durationInput.type = "number";
    durationInput.className = "ghupo-duration-input";
    durationInput.min = "0"; durationInput.max = "30"; durationInput.step = "1";
    durationInput.value = "5";
    const durationInc = make("button", {}, "+"); durationInc.className = "ghupo-duration-btn";
    const durationUnit = make("span", {}, "秒"); durationUnit.className = "ghupo-duration-unit";
    durationGroup.append(durationLabel, durationDec, durationInput, durationInc, durationUnit);

    const templateSelect = make("select"); templateSelect.className = "ghupo-template";
    for (const [value, label] of Object.entries(PROMPT_TEMPLATES)) templateSelect.append(new Option(label, value));
    const modelName = make("span"); modelName.className = "ghupo-model";
    const resetBtn = make("button", {}, "↻"); resetBtn.className = "ghupo-tool";
    const optBtn = make("button", {}, "✦"); optBtn.className = "ghupo-tool";
    const historyBtn = make("button", {}, "⏰"); historyBtn.className = "ghupo-tool";
    historyBtn.title = t("Optimization history");
    const gearBtn = make("button", {}, "⚙"); gearBtn.className = "ghupo-tool";
    tools.append(elapsed, dirSizeGroup, durationGroup, templateSelect, modelName, resetBtn, optBtn, historyBtn, gearBtn);
    root.appendChild(tools);
    // 把刚才做好的高级面板插到工具栏下方
    root.appendChild(dirAdvancedPanel); 

    // ---- 历史菜单（固定定位）----
    // 【挂到 body】ComfyUI 节点容器带 transform，会让 position:fixed 相对节点定位，
    // 导致浮层随画布漂移。挂到 body 才能真·固定在视口。
    const historyMenu = make("div"); historyMenu.className = "ghupo-history-menu";
    historyMenu.style.display = "none";
    document.body.appendChild(historyMenu);

    // ---- Toast 容器（右下角浮窗，非打断）----
    const toastContainer = make("div"); toastContainer.className = "ghupo-toast-container";
    document.body.appendChild(toastContainer);
    // RefMod 模型选择浮层
    const refmodPicker = make("div"); refmodPicker.className = "ghupo-refmod-picker";
    refmodPicker.style.display = "none";
    document.body.appendChild(refmodPicker);
    const showToast = (msg) => {
        const toast = make("div"); toast.className = "ghupo-toast";
        const text = make("span", {}, msg);
        const close = make("button", {}, "×"); close.className = "ghupo-toast-close";
        toast.append(text, close);
        toastContainer.appendChild(toast);
        let timer = setTimeout(() => toast.remove(), 5000);
        toast.onmouseenter = () => { clearTimeout(timer); };
        toast.onmouseleave = () => { timer = setTimeout(() => toast.remove(), 5000); };
        close.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
        close.onclick = (e) => { e.stopPropagation(); toast.remove(); };
    };

    // ---- 历史菜单：渲染 + 定位 ----
    const renderHistoryMenu = () => {
        historyMenu.replaceChildren();
        const stack = modeState[currentSlot()].history || [];
        if (!stack.length) {
            const empty = make("div", {}, t("暂无优化历史")); empty.className = "ghupo-history-empty";
            historyMenu.appendChild(empty);
            return;
        }
        for (const entry of stack) {
            const row = make("div"); row.className = "ghupo-history-item";

            // ---- 信息区（可点击恢复）----
            const info = make("span"); info.className = "ghupo-history-info";
            const d = new Date(entry.timestamp || 0);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const durText = (entry.duration != null && viewMode === "video") ? ` · ${entry.duration}s` : "";
            const summary = String(entry.originalPrompt || "").replace(/\s+/g, " ").slice(0, 12) || "(空)";
            const templateLabel = PROMPT_TEMPLATES[entry.template] || entry.template || "—";
            info.textContent = `[${templateLabel}] · ${hh}:${mm}${durText} · ${summary}`;

            info.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
            info.onclick = (e) => {
                e.stopPropagation();
                // 【提升到栈顶】用户"使用"过的历史版本 = 最近使用，应该出现在下拉最上面。
                // 同时，后续 runOptimization 的历史栈复用 find() 会优先返回它，
                // 避免"刚恢复 22:13，点 ✦ 却看到 22:24"的困惑。
                {
                    const s = modeState[currentSlot()].history || [];
                    const curIdx = s.indexOf(entry);
                    if (curIdx > 0) {
                        s.splice(curIdx, 1);
                        s.unshift(entry);
                    }
                }
                // 恢复历史条目到编辑器
                promptState = "optimized";
                prompt.value = entry.result || "";
                optimizerCache = {
                    signature: entry.signature,
                    originalPrompt: entry.originalPrompt || "",
                    result: entry.result || ""
                };
                modeState[currentSlot()].cache = optimizerCache;
                if (entry.duration != null && viewMode === "video") setDuration(entry.duration, false);
                // 【模板跟随切换】视频模式下，历史条目记住的模板要同步生效
                if (viewMode === "video") {
                    switchVideoTemplate(entry.template);
                }
                // 【关键修复】恢复历史时，大白话权威存储也要回到那个版本。
                // 否则点 ↻ 时大白话从 modeState.original 来，可能跟历史条目的 originalPrompt 有细微差异，
                // 导致签名/历史栈复用全部匹配失败，触发意外的重新优化。
                if (entry.originalPrompt != null) {
                    modeState[currentSlot()].original = entry.originalPrompt;
                }
                renderRich();
                prompt.blur();
                prompt.scrollTop = 0;
                historyMenu.style.display = "none";
                updateOptimizeButton();
                renderStoryboard();
                persist();
            };

            // ---- 删除按钮 ----
            const del = make("button", {}, "×"); del.className = "ghupo-history-del";
            del.title = t("删除此历史版本");
            del.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
            del.onclick = (e) => {
                e.stopPropagation();
                const curStack = modeState[currentSlot()].history || [];
                const idx = curStack.indexOf(entry);
                if (idx >= 0) {
                    curStack.splice(idx, 1);
                    modeState[currentSlot()].cache = curStack.length ? modeState[currentSlot()].cache : modeState[currentSlot()].cache;
                    renderHistoryMenu();
                    persist();
                }
            };

            row.append(info, del);
            historyMenu.appendChild(row);
        }
    };

    historyBtn.onclick = (e) => {
        e.stopPropagation();
        if (historyMenu.style.display === "block") { historyMenu.style.display = "none"; return; }
        renderHistoryMenu();
        const rect = historyBtn.getBoundingClientRect();
        historyMenu.style.left = Math.max(4, rect.right - 260) + "px";
        historyMenu.style.top = (rect.bottom + 4) + "px";
        historyMenu.style.display = "block";
    };
    // 【点击其他地方关闭历史菜单】用 document.click 的 capture 阶段：
    // click 比 mousedown / pointerdown 晚触发，也不容易被 stopImmediatePropagation 吞掉，
    // 因此能覆盖 ComfyUI 的 +Add 面板、Manager 弹窗、任意 DOM 元素的场景。
    const closeHistoryOnOutsideClick = (e) => {
        if (historyMenu.style.display !== "block") return;
        if (historyMenu.contains(e.target)) return;
        if (historyBtn.contains(e.target)) return;
        historyMenu.style.display = "none";
    };
    document.addEventListener("click", closeHistoryOnOutsideClick, true);
    window.addEventListener("click", closeHistoryOnOutsideClick, true);
    // 【一动就关】滚轮缩放 / 按下并拖动时自动关闭菜单，避免菜单固定在原位不动
    const closeHistoryOnMove = () => {
        if (historyMenu.style.display === "block") historyMenu.style.display = "none";
    };
    window.addEventListener("wheel", closeHistoryOnMove, { capture: true, passive: true });
    window.addEventListener("dragstart", closeHistoryOnMove, true);
    // 用"按下 + 指针移动"判定拖动。只要用户在拖动过程中移动指针，菜单立即关闭。
    let pointerDownForDrag = false;
    window.addEventListener("pointerdown", () => { pointerDownForDrag = true; }, true);
    window.addEventListener("pointerup", () => { pointerDownForDrag = false; }, true);
    window.addEventListener("pointercancel", () => { pointerDownForDrag = false; }, true);
    window.addEventListener("pointermove", () => {
        if (pointerDownForDrag && historyMenu.style.display === "block") {
            historyMenu.style.display = "none";
        }
    }, true);

    // ---- 时长读写工具 ----
    // 【L2-b】时长精度支持 0.5 秒（拖动吸附需要）
    const readDuration = () => {
        const v = parseFloat(durationInput.value);
        return Number.isFinite(v) ? Math.max(0, Math.min(30, v)) : 5;
    };
    const setDuration = (v, triggerUpdate = true) => {
        const clamped = Math.max(0, Math.min(30, Math.round(Number(v) * 2) / 2));
        if (String(clamped) === String(durationInput.value)) return;
        durationInput.value = String(clamped);
        if (triggerUpdate) {
            // 【按钮状态不受时长影响】用户在优化稿页面永远是 ↻，在大白话页面永远是 ✦。
            // 时长变化只影响 signature（下次点 ✦ 时按新签名判断是否命中缓存）。
            if (typeof persist === "function") persist();
            // 【L2-b】改时长时间线跟随
            renderStoryboard();
        }
    };
    durationDec.onclick = e => { e.preventDefault(); setDuration(readDuration() - 1); };
    durationInc.onclick = e => { e.preventDefault(); setDuration(readDuration() + 1); };
    durationInput.addEventListener("input", () => {
        // 【按钮状态不受时长影响】输入时长不改变视图状态，按钮保持用户当前视图对应的显示。
        // 【L2-b】输入时时间线实时跟随
        if (viewMode === "video" && segments[activeSegmentIndex]) {
            const v = parseInt(durationInput.value, 10);
            if (Number.isFinite(v) && v > 0) segments[activeSegmentIndex].duration = v;
        }
        if (typeof renderStoryboard === "function") renderStoryboard();
    });
    durationInput.addEventListener("blur", () => setDuration(readDuration()));
    // 按住数字左右拖动，自由滑动调整
    let durationDragState = null;
    durationInput.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        durationDragState = { startX: e.clientX, startVal: readDuration(), dragging: false, id: e.pointerId };
    });
    durationInput.addEventListener("pointermove", e => {
        const s = durationDragState;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.startX;
        if (!s.dragging && Math.abs(dx) > 4) {
            s.dragging = true;
            durationInput.blur();
            durationInput.setPointerCapture?.(e.pointerId);
        }
        if (s.dragging) {
            e.preventDefault();
            const next = s.startVal + Math.round(dx / 8);
            durationInput.value = String(Math.max(0, Math.min(30, next)));
            if (typeof updateOptimizeButton === "function") updateOptimizeButton();
            // 【L2-b】拖动时时间线实时跟随（先把值写进当前段再重绘）
            if (viewMode === "video" && segments[activeSegmentIndex]) {
                segments[activeSegmentIndex].duration = readDuration();
            }
            if (typeof renderStoryboard === "function") renderStoryboard();
        }
    });
    const endDurationDrag = e => {
        const s = durationDragState;
        if (!s) return;
        if (s.dragging) {
            durationInput.releasePointerCapture?.(s.id);
            if (typeof persist === "function") persist();
        }
        durationDragState = null;
    };
    durationInput.addEventListener("pointerup", endDurationDrag);
    durationInput.addEventListener("pointercancel", endDurationDrag);

    // Rich prompt editor
    const prompt = make("div");
    prompt.className = "ghupo-prompt ghpO-prompt-empty";
    prompt.contentEditable = "true";
    prompt.style.minHeight = "150px"; // 【防挤压】保证提示词输入框至少 150px 高
    prompt.spellcheck = false;
    prompt.tabIndex = 0;
    prompt.setAttribute("role", "textbox");
    prompt.dataset.placeholder = t("Prompt: Type @ to reference uploaded media, e.g. @图片1, @video 1, @audio 1，图1，视频1，音频1，图一，video1，audio1，picture1，image1；你甚至还可以鼠标左键直接点击上面的素材进行快速选择引用！");
    // 明确指定编辑器占 grid 的第 3 行 —— 即使 DOM 顺序变化也不会错位。
    prompt.style.gridRow = "3";
    // 用 wrap 包裹编辑器：wrap 作为定位参考系，编辑器用绝对定位填充。
    // 绝对定位的元素不参与文档流，因此编辑器不会撑开 root、进而撑开节点。
    // root 高度由 ComfyUI 容器（= node.size[1]）决定，编辑器高度由
    // grid 第三行的 minmax(0, 1fr) 决定 —— 编辑器自动跟随节点纵向缩放。
    // ---- 优化预览：故事板时间轴（只在优化稿视图显示）----
    const storyboard = make("div"); storyboard.className = "ghupo-storyboard"; storyboard.style.display = "none";
    const storyboardHeader = make("div"); storyboardHeader.className = "ghupo-sb-header";
    const storyboardTitle = make("span", {}, t("故事板")); storyboardTitle.className = "ghupo-sb-title";
    const storyboardMeta = make("span"); storyboardMeta.className = "ghupo-sb-meta";
    const storyboardToggle = make("span", {}, "▾"); storyboardToggle.className = "ghupo-sb-toggle";
    // 【L2-b】"+" 加段按钮
    const storyboardAddBtn = make("button", {}, "＋ 加段");
    storyboardAddBtn.className = "ghupo-sb-add";
    storyboardAddBtn.title = "在当前段后插入新段";
    storyboardAddBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof addSegment === "function") addSegment();
    };
    storyboardHeader.append(storyboardToggle, storyboardTitle, storyboardAddBtn, storyboardMeta);
    const storyboardBody = make("div"); storyboardBody.className = "ghupo-sb-body";
    // 【L2-b】时间线：tlInner 是内容层（宽度随 zoom 变），storyboardBody 是滚动容器
    const tlInner = make("div"); tlInner.className = "ghupo-tl-inner";
    const tlRuler = make("div"); tlRuler.className = "ghupo-tl-ruler";
    const tlTrack = make("div"); tlTrack.className = "ghupo-tl-track";
    tlInner.append(tlRuler, tlTrack);
    storyboardBody.append(tlInner);
    storyboard.append(storyboardHeader, storyboardBody);
    let storyboardCollapsed = false;
    storyboardHeader.onclick = () => {
        storyboardCollapsed = !storyboardCollapsed;
        storyboardBody.classList.toggle("hidden", storyboardCollapsed);
        storyboardToggle.textContent = storyboardCollapsed ? "▸" : "▾";
    };
    root.appendChild(storyboard);

    const promptWrap = make("div");
    promptWrap.className = "ghupo-prompt-wrap";
    promptWrap.style.flex = "1 1 auto";
    promptWrap.style.minHeight = "150px"; // 兜底防挤压
    promptWrap.appendChild(prompt);
    root.appendChild(promptWrap);

    // 【进度条】底部双条：总进度（蓝）+ 本段进度（绿）
    const progressPanel = make("div"); progressPanel.className = "ghupo-progress-panel";
    const progressTitle = make("div"); progressTitle.className = "ghupo-progress-title";
    const progressRow1 = make("div"); progressRow1.className = "ghupo-progress-row";
    const progressTag1 = make("span", {}, "总进度"); progressTag1.className = "ghupo-progress-tag total";
    const progressTrack1 = make("div"); progressTrack1.className = "ghupo-progress-track";
    const progressFill1 = make("div"); progressFill1.className = "ghupo-progress-fill total";
    progressTrack1.appendChild(progressFill1);
    const progressVal1 = make("span"); progressVal1.className = "ghupo-progress-val";
    progressRow1.append(progressTag1, progressTrack1, progressVal1);
    const progressRow2 = make("div"); progressRow2.className = "ghupo-progress-row";
    const progressTag2 = make("span", {}, "本段"); progressTag2.className = "ghupo-progress-tag seg";
    const progressTrack2 = make("div"); progressTrack2.className = "ghupo-progress-track";
    const progressFill2 = make("div"); progressFill2.className = "ghupo-progress-fill seg";
    progressTrack2.appendChild(progressFill2);
    const progressVal2 = make("span"); progressVal2.className = "ghupo-progress-val";
    progressRow2.append(progressTag2, progressTrack2, progressVal2);
    progressPanel.append(progressTitle, progressRow1, progressRow2);
    root.appendChild(progressPanel);

    // 【进度条】状态 + 控制函数
    let progressState = { total: 0, current: 0, segStartedAt: 0 };
    function showProgress(total, current, titleText) {
        progressState.total = total;
        progressState.current = current;
        progressState.segStartedAt = performance.now();
        progressTitle.textContent = titleText || "提示词优化中";
        progressPanel.classList.add("visible");
        const donePct = total > 0 ? ((current - 1) / total) * 100 : 0;
        progressFill1.style.width = donePct + "%";
        progressVal1.textContent = `${current - 1}/${total}`;
        progressFill2.style.width = "0%";
        progressVal2.textContent = "0%";
    }
    function updateProgress() {
        if (!progressPanel.classList.contains("visible")) return;
        const elapsed = performance.now() - progressState.segStartedAt;
        // 单段内进度：30 秒到 90%，之后卡住等返回
        const pct = Math.min(90, (elapsed / 30000) * 90);
        progressFill2.style.width = pct + "%";
        progressVal2.textContent = Math.round(pct) + "% · " + Math.floor(elapsed / 1000) + "s";
    }
    function advanceProgress(current) {
        progressState.current = current;
        progressState.segStartedAt = performance.now();
        const total = progressState.total;
        const donePct = total > 0 ? ((current - 1) / total) * 100 : 0;
        progressFill1.style.width = donePct + "%";
        progressVal1.textContent = `${current - 1}/${total}`;
        progressFill2.style.width = "0%";
        progressVal2.textContent = "0%";
    }
    function hideProgress() {
        progressPanel.classList.remove("visible");
        progressFill1.style.width = "0%";
        progressFill2.style.width = "0%";
        progressVal1.textContent = "";
        progressVal2.textContent = "";
    }

    // 在 mousedown 阶段取消"焦点转移"默认行为：
    // - 不影响 click 事件正常触发
    // - 只阻止浏览器在点击素材格/工具栏时把焦点从 prompt 抢走
    // - 点 prompt 内部、或任何输入控件时仍然放行
    root.addEventListener("mousedown", event => {
        const target = event.target;
        if (target === prompt || prompt.contains(target)) return;
        if (target.closest?.("input,select,textarea,button,a,[contenteditable='true']")) return;
        event.preventDefault();
    }, true);

    // ---- DOM widget 挂载 ----
    const domWidget = node.addDOMWidget("gh_upo_panel", "gh_upo_panel", root, { serialize: false, hideOnZoom: false });
    domWidget.options = domWidget.options || {};
    domWidget.options.serialize = false;
    //domWidget.options.getMinHeight = () => 0;
    domWidget.options.getMinHeight = () => {
    // 大约填一个合适的基础高度，剩下的靠节点本身的 size 来调整
    return 1300; 
};
    domWidget.options.minNodeSize = [WIDTH, 0];

    // Hide native widgets
    const promptWidget = widget(node, "prompt");
    hideWidget(promptWidget);
    hideWidget(widget(node, "gh_state_json"));
    for (const name of ALL_SLOTS) hideWidget(widget(node, name));

    // ---- 双模式：原生 size 控件的显示/隐藏 ----
    const sizeWidgets = [widget(node, "width"), widget(node, "height"), widget(node, "resize_mode")];
    const setSizeWidgetsVisible = (visible) => {
        for (const w of sizeWidgets) {
            if (!w) continue;
            w.hidden = !visible;
            w.options = w.options || {};
            w.options.hidden = !visible;
            if (visible) {
                if (w._ghOriginalComputeSize !== undefined) {
                    w.computeSize = w._ghOriginalComputeSize;
                } else {
                    delete w.computeSize;
                }
            } else {
                if (w._ghOriginalComputeSize === undefined) {
                    w._ghOriginalComputeSize = w.computeSize;
                }
                w.computeSize = () => [0, -4];
            }
        }
        node.setDirtyCanvas?.(true, true);
        node.setSize?.(node.size);
    };

    // ---- 双模式：模板分类与每模式记忆 ----
    const VIDEO_TEMPLATE_IDS = ["minimax_h3", "ltx_2_5", "seedance_2_5", "wan_2_2", "kling", "hunyuan_video", "veo_3", "sora_2", "custom"];
    // 图片模式：下拉已被隐藏，template 固定走 "image"
    const IMAGE_TEMPLATE_IDS = ["image"];
    const viewTemplateRemember = { video: templateSelect.value || "minimax_h3", image: "image" };
    const rebuildTemplateSelect = () => {
        const allowed = viewMode === "image" ? IMAGE_TEMPLATE_IDS : VIDEO_TEMPLATE_IDS;
        const remembered = viewTemplateRemember[viewMode] || allowed[0];
        templateSelect.replaceChildren();
        for (const [value, label] of Object.entries(PROMPT_TEMPLATES)) {
            if (allowed.includes(value)) templateSelect.append(new Option(label, value));
        }
        if ([...templateSelect.options].some(o => o.value === remembered)) {
            templateSelect.value = remembered;
        } else {
            templateSelect.value = allowed[0];
            viewTemplateRemember[viewMode] = allowed[0];
        }
    };

    // 初次创建时保证至少 WIDTH 宽；用户拖宽后不再强制。
    // 之前这里把 m[0] 恒定写成 WIDTH，导致拖宽被立刻打回 500。
    // 【体验修复】新节点给足高度（故事板 + 素材区 + 提示词框都可见）
    const MIN_HEIGHT = 560;
    if (!node.size || !node.size[0]) {
        node.size = [WIDTH, node.size?.[1] || MIN_HEIGHT];
    } else {
        if (node.size[0] < WIDTH) node.size[0] = WIDTH;
        if (!node.size[1] || node.size[1] < MIN_HEIGHT) node.size[1] = MIN_HEIGHT;
    }
    const baseComputeSize = node.computeSize.bind(node);
    node.computeSize = function(out) {
        return baseComputeSize(out);
    };

    // ---- 状态 ----
    let media = new Map();
    let userHeight = 1080;
    let restoringState = true;
    let viewMode = "video"; // "video" | "image" —— 双模式切换
    const stateKey = "gh_upo_state";

      const CONFIG_KEY = "gh_upo_config";
    const LOCAL_STORAGE_KEY = "gh_upo_config_v1";

    const persist = () => {
        if (restoringState) return;
        // 只在"配置有效"时才写配置，避免初始化期间把 null 覆盖到已存数据上。
        const hasValidConfig = !!(
            optimizerSettings
            && typeof optimizerSettings === "object"
            && typeof optimizerSettings.mode === "string"
            && optimizerSettings.mode.length > 0
        );
        // 关键：把 optimizer / optimizerCache 一起塞进 gh_state_json 的
        // value 里。ComfyUI 主序列化路径是 widgets_values，比 properties
        // 更可靠。原节点也是这么做的（serializedState 里带 optimizer）。
        // 【双模式】持久化前把当前编辑器内容与缓存同步回当前模式槽位
        if (promptState === "original") modeState[currentSlot()].original = editorText();
        modeState[currentSlot()].cache = optimizerCache;
        // 【L2-b】回写镜像到激活段（duration 独立，不走镜像）
        // 仅参考素材子 tab（原生 video 槽）参与段镜像，参考模型子 tab 走独立槽
        if (viewMode === "video" && currentSlot() === "video" && segments[activeSegmentIndex]) {
            segments[activeSegmentIndex].duration = readDuration();
            modeState.video.cache = optimizerCache;
            syncMirrorToSegment();
        }
        // 【L2-c】重新提取每段的图片索引（大白话优先，优化稿兜底）
        if (viewMode === "video") {
            for (const s of segments) {
                s.imageIndices = extractSegmentImageIndices(s);
            }
        }
        const value = JSON.stringify({
            media: [...media.entries()],
            modeState: modeState,
            viewMode: viewMode,
            promptState: promptState,
            height: userHeight,
            template: templateSelect.value,
            duration: readDuration(),
            optimizer: hasValidConfig ? optimizerSettings : null,
            segments: segments,
            activeSegmentIndex: activeSegmentIndex,
            currentSubView: currentSubView,
            dirAR: arSelect.value,
            dirMP: mpInput.value,
            dirWidth: calcDimensions().w,
            dirHeight: calcDimensions().h,
            dirSteps: parseInt(stepsInput.value, 10) || 8,
            dirSecondPass: spCheck.checked,
            dirSecondPassModel: spModelSelect.value,
            dirSecondPassSteps: parseInt(spStepsInput.value, 10) || 2,
            dirSecondPassMode: spModeSelect.value,
            dirExecMode: execModeSelect.value,
            dirAudioMode: audioSelect.value,
            dirBridgeOverlaps: overlapInput.value,
        });
        node.properties = node.properties || {};
        node.properties[stateKey] = value;
        try { node.properties["gh_upo_cache"] = JSON.stringify(optimizerCache || null); } catch {}
        try { saveCacheToLocalStorage(modeState); } catch {}
        // properties 里也再存一份（兼容不恢复 widget 的旧 ComfyUI）。
        if (hasValidConfig) {
            try { node.properties[CONFIG_KEY] = JSON.stringify(optimizerSettings); } catch {}
            saveConfigToLocalStorage(optimizerSettings);
        }
        // widget.value 是 ComfyUI 官方主序列化路径 —— 必须写。
        const sw = widget(node, "gh_state_json");
        if (sw) sw.value = value;
        // 【L2-c + 时长同步】总是生成 segments_json：
        // - 单段 / 多段统一处理
        // - duration 由万能节点主控（桥接器跟随时长）
        // - images: 有 @ 引用时为数组，否则为 null（= 用全部素材）
        let segmentsPayload = "";
        if (viewMode === "video") {
            // 确保当前段的 media 是最新的
            if (!segments[activeSegmentIndex].media) segments[activeSegmentIndex].media = {};
            segments[activeSegmentIndex].media = Object.fromEntries(media.entries());
            
            segmentsPayload = JSON.stringify({
                segments: segments.map(s => ({
                    duration: s.duration,
                    prompt: s.cache?.result || s.original || "",
                    images: s.imageIndices,
                    media_snapshot: s.media || {} // 【核心】把每段的素材池传给后端
                })),
            });
        }
        const segWidget = widget(node, "segments_json");
        if (segWidget && segWidget.value !== segmentsPayload) segWidget.value = segmentsPayload;
    };

    const saveOptimizerConfigToNode = () => {
        node.properties = node.properties || {};
        try { node.properties[CONFIG_KEY] = JSON.stringify(optimizerSettings || {}); } catch {}
    };
    const loadOptimizerConfigFromNode = () => {
        const raw = node.properties?.[CONFIG_KEY];
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && typeof parsed.mode === "string" && parsed.mode) {
                return parsed;
            }
            return null;
        } catch { return null; }
    };

    // localStorage 作为主存储：不依赖 ComfyUI 的 workflow 保存/恢复机制，
    // 刷新页面、关闭浏览器、重启 ComfyUI 都保留。跨机器/跨浏览器不共享。
    const saveConfigToLocalStorage = cfg => {
        if (!cfg || typeof cfg !== "object" || typeof cfg.mode !== "string" || !cfg.mode) return;
        try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cfg)); }
        catch (e) { console.warn("[UPO] localStorage 保存失败", e); }
    };
    const loadConfigFromLocalStorage = () => {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && typeof parsed.mode === "string" && parsed.mode) {
                return parsed;
            }
            return null;
        } catch { return null; }
    };

    // optimizerCache 也走 localStorage —— 原因跟配置一样：
    // ComfyUI 的 hidden widget 恢复时机不稳定，只放在 widget 里刷新后会丢。
    // 丢了的后果是"刷新后 ↻ 消失，点 ✦ 又重跑一遍"，用户没法对比原稿。
    const CACHE_KEY = "gh_upo_cache_v1";
    const saveCacheToLocalStorage = cache => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache || null)); } catch {}
    };
    const loadCacheFromLocalStorage = () => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // 新格式：{ video: {original, cache}, image: {original, cache} }
            if (parsed && typeof parsed === "object" && (parsed.video !== undefined || parsed.image !== undefined)) {
                return parsed;
            }
            return null;
        } catch { return null; }
    };

    // ---- 编辑器的 value/selection 兼容层（供 @tag 高亮和 setRangeText 使用）----
    const ignored = node => node?.classList?.contains("ghupo-preview");
    const domText = n => {
        if (!n) return "";
        if (n.nodeType === Node.TEXT_NODE) return n.data;
        if (n.nodeType !== Node.ELEMENT_NODE) return "";
        if (ignored(n)) return "";
        if (n.tagName === "BR") return "\n";
        return [...n.childNodes].map(domText).join("");
    };
    const editorText = () => /^\n*$/.test(domText(prompt).replace(/\r/g, "")) ? "" : domText(prompt).replace(/\r/g, "");

    Object.defineProperties(prompt, {
        value: {
            configurable: true,
            get: () => editorText(),
            set: v => {
                const next = String(v ?? "");
                prompt.replaceChildren();
                prompt.append(document.createTextNode(next));
                // 关键修复：程序化写入编辑器后，必须立即同步 hidden widget。
                // 否则桥接器 / prompt 输出端口读到的仍是旧值，
                // 导致"点 ✦ 优化后的提示词没被下游收到"。
                // 手动输入走 input 事件本来就同步；程序化写入不触发 input，
                // 所以在这里统一同步。
                const w = widget(node, "prompt");
                if (w && w.value !== next) {
                    w.value = next;
                    try { w.callback?.call(w, w.value); } catch {}
                }
            },
        },
    });

    prompt.setRangeText = (replacement, start, end, mode = "end") => {
        const cur = editorText();
        const next = cur.slice(0, start) + replacement + cur.slice(end);
        prompt.value = next;
        // 传 false 阻止 renderRich 用旧位置（可能已是 0）覆盖我们下面精确设置的光标。
        renderRich(false);
        const caret = mode === "select"
            ? [start, start + replacement.length]
            : [start + replacement.length, start + replacement.length];
        applyCaret(caret[0], caret[1]);
    };

    // ---- @tag 匹配 ----
    // 支持：@图片1 / 图片1 / @image1 / Image 1 / @picture1 / @图1 / <Picture 1> / <Video 1> / <Audio 1>
    const CN_DIGITS = { "一":1, "二":2, "三":3, "四":4, "五":5, "六":6, "七":7, "八":8, "九":9, "十":10 };
    const parseOrdinal = raw => {
        if (/^\d+$/.test(raw)) return Number(raw);
        return CN_DIGITS[raw] || NaN;
    };

    const TAG_RE = /@?\s*(?:<\s*)?(Picture|Image|Video|Audio|图片|图像|图|视频|音频)\s*#?\s*(\d+|[一二三四五六七八九十])\s*(?:>)?/gi;

    const mediaMatches = source => {
        const matches = [];
        let m;
        TAG_RE.lastIndex = 0;
        while ((m = TAG_RE.exec(source))) {
            const rawWord = String(m[1] || "");
            // RefMod 标签首字母大写（Video/Picture/Audio），原生标签小写或中文
            let isRefmod = /^[A-Za-z]/.test(rawWord) && rawWord[0] === rawWord[0].toUpperCase() && rawWord[0] !== rawWord[0].toLowerCase();
            if (!(viewMode === "video" && currentSubView === "refmod")) {
                isRefmod = false; // 只要不在参考模型子tab下，强制降级为原生小写标签
            }
            const lowerType = rawWord.toLowerCase();
            const baseType = ["picture", "image", "图片", "图像", "图"].includes(lowerType) ? "picture"
                : ["video", "视频"].includes(lowerType) ? "video" : "audio";
            const type = isRefmod ? `refmod-${baseType}` : baseType;
            const ordinal = parseOrdinal(m[2]);
            if (ordinal >= 1) matches.push({ index: m.index, raw: m[0], type, ordinal, isRefmod });
            if (!m[0].length) TAG_RE.lastIndex++;
        }
        return matches;
    };

    const resolveMedia = (type, ordinal) => {
        // RefMod 池：按 kind 独立计数，序号对应同 kind 的第 N 个
        if (type.startsWith("refmod-")) {
            const kindSuffix = type.slice(7); // "video" / "picture" / "audio"
            const refmodKind = kindSuffix === "picture" ? "image" : kindSuffix;
            const ordered = REFMOD_SLOTS.filter(s => {
                const e = media.get(s);
                return e && e.kind === "refmod" && (e.refmodKind || "video") === refmodKind;
            });
            const slot = ordered[ordinal - 1];
            return slot ? (media.get(slot) || null) : null;
        }
        const slots = type === "picture" ? IMAGE_SLOTS : type === "video" ? VIDEO_SLOTS : AUDIO_SLOTS;
        // 【终极物理锁死】绝对不动态顺延，图N永远指向 ref_xxx_N
        // 删了图3，图4绝不补位。找不到素材就返回 null，交由渲染层处理成幽灵状态。
        const slot = slots[ordinal - 1];
        return slot ? (media.get(slot) || null) : null;
    };

        const offsetOf = (node, offset) => {
        let total = 0, found = false;
        const walk = n => {
            if (found || !n) return;
            if (n === node) {
                if (n.nodeType === Node.TEXT_NODE) total += offset;
                else if (n.nodeType === Node.ELEMENT_NODE) {
                    const lim = Math.min(offset, n.childNodes.length);
                    for (let i = 0; i < lim; i++) total += domText(n.childNodes[i]).length;
                }
                found = true;
                return;
            }
            if (n.nodeType === Node.TEXT_NODE) { total += n.data.length; return; }
            if (n.nodeType !== Node.ELEMENT_NODE || ignored(n)) return;
            if (n.tagName === "BR") { total += 1; return; }
            for (const c of n.childNodes) { walk(c); if (found) break; }
        };
        walk(prompt);
        return total;
    };
    // ---- 光标工具集（自包含） ----
    const selectionOffsets = () => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return null;
        const range = sel.getRangeAt(0);
        // 光标可以直接落在 prompt 自身上，此时 contains 返回 false，要用 === 放行。
        if (range.startContainer !== prompt && !prompt.contains(range.startContainer)) return null;
        return [offsetOf(range.startContainer, range.startOffset), offsetOf(range.endContainer, range.endOffset)];
    };

    // 把"纯文本 offset"翻译成新 DOM 里的 (node, offset)。
    const locateInPrompt = target => {
        let remaining = Math.max(0, target), loc = null;
        const walk = n => {
            if (loc || !n) return;
            if (n.nodeType === Node.TEXT_NODE) {
                if (remaining <= n.data.length) { loc = [n, remaining]; return; }
                remaining -= n.data.length; return;
            }
            if (n.nodeType !== Node.ELEMENT_NODE) return;
            if (n.classList?.contains("ghupo-preview")) return;
            if (n.classList?.contains("ghupo-tag")) return;
            if (n.tagName === "BR") {
                const p = n.parentNode, idx = [...p.childNodes].indexOf(n);
                if (remaining === 0) loc = [p, idx];
                else if (remaining === 1) loc = [p, idx + 1];
                else remaining -= 1;
                return;
            }
            for (const c of n.childNodes) { walk(c); if (loc) return; }
        };
        walk(prompt);
        return loc || [prompt, prompt.childNodes.length];
    };

    // 把光标放到指定纯文本 offset（end 不同则为选区）。
    const applyCaret = (start, end = start) => {
        if (document.activeElement !== prompt) prompt.focus({ preventScroll: true });
        const sel = window.getSelection();
        if (!sel) return;
        const [sn, so] = locateInPrompt(start);
        const [en, eo] = locateInPrompt(end);
        const range = document.createRange();
        try {
            range.setStart(sn, so);
            range.setEnd(en, eo);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            const r = document.createRange();
            r.selectNodeContents(prompt);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
        }
    };

    // 读取当前光标在纯文本中的 offset。
    const readCaret = () => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (range.startContainer !== prompt && !prompt.contains(range.startContainer)) return null;
        const offsetOfSelf = (node, off) => {
            let total = 0, found = false;
            const walk = n => {
                if (found || !n) return;
                if (n === node) {
                    if (n.nodeType === Node.TEXT_NODE) total += off;
                    else if (n.nodeType === Node.ELEMENT_NODE) {
                        const lim = Math.min(off, n.childNodes.length);
                        for (let i = 0; i < lim; i++) total += domText(n.childNodes[i]).length;
                    }
                    found = true;
                    return;
                }
                if (n.nodeType === Node.TEXT_NODE) { total += n.data.length; return; }
                if (n.nodeType !== Node.ELEMENT_NODE) return;
                if (n.classList?.contains("ghupo-preview")) return;
                if (n.tagName === "BR") { total += 1; return; }
                for (const c of n.childNodes) { walk(c); if (found) return; }
            };
            walk(prompt);
            return total;
        };
        return [
            offsetOfSelf(range.startContainer, range.startOffset),
            offsetOfSelf(range.endContainer, range.endOffset),
        ];
    };
    const restoreSelection = (start, end = start) => {
        const sel = window.getSelection(); if (!sel) return;
        const locate = target => {
            let remaining = Math.max(0, target), loc = null;
            const walk = n => {
                if (loc || ignored(n)) return;
                if (n.nodeType === Node.TEXT_NODE) {
                    if (remaining <= n.data.length) loc = [n, remaining];
                    else remaining -= n.data.length;
                    return;
                }
                if (n.nodeType !== Node.ELEMENT_NODE) return;
                if (n.tagName === "BR") {
                    const p = n.parentNode, idx = [...p.childNodes].indexOf(n);
                    if (remaining === 0) loc = [p, idx];
                    else if (remaining === 1) loc = [p, idx + 1];
                    else remaining -= 1;
                    return;
                }
                for (const c of n.childNodes) { walk(c); if (loc) return; }
            };
            walk(prompt);
            return loc || [prompt, prompt.childNodes.length];
        };
        const [sn, so] = locate(start), [en, eo] = locate(end);
        const range = document.createRange();
        range.setStart(sn, so); range.setEnd(en, eo);
        sel.removeAllRanges(); sel.addRange(range);
    };

    // 统一收集所有需要着色的片段：media 标签、<Subject N>、[Shot N]、
    // (S1)、段落标题、<d> 对白。返回按位置排好序、且互不重叠的列表。
    const promptDecorations = source => {
        const mediaRanges = mediaMatches(source);
        const overlapsMedia = (s, e) => mediaRanges.some(m => {
            const me = m.index + m.raw.length;
            return s < me && e > m.index;
        });

        const items = mediaRanges.map(m => ({
            kind: "media", subtype: m.type,
            index: m.index, end: m.index + m.raw.length,
            raw: m.raw, type: m.type, ordinal: m.ordinal,
            isRefmod: m.isRefmod,
        }));

        let m;
        // <Subject N>
        const subjectRe = /<Subject\s+\d+>/gi;
        while ((m = subjectRe.exec(source))) {
            const s = m.index, e = s + m[0].length;
            if (!overlapsMedia(s, e)) {
                items.push({ kind: "tag", subtype: "subject", index: s, end: e, raw: m[0] });
            }
            if (!m[0].length) subjectRe.lastIndex++;
        }
        // [Shot N] / [xxx]
        const bracketRe = /\[[A-Za-z\u4e00-\u9fff][^\[\]\r\n]{0,80}\]/g;
        while ((m = bracketRe.exec(source))) {
            const s = m.index, e = s + m[0].length;
            if (!overlapsMedia(s, e)) {
                items.push({ kind: "tag", subtype: "bracket", index: s, end: e, raw: m[0] });
            }
            if (!m[0].length) bracketRe.lastIndex++;
        }
        // (S1) (S2) ...
        const shorthandRe = /(?<![A-Za-z0-9_])\(S(?:[1-9]|1\d|20)\)(?![A-Za-z0-9_])/gi;
        while ((m = shorthandRe.exec(source))) {
            const s = m.index, e = s + m[0].length;
            if (!overlapsMedia(s, e)) {
                items.push({ kind: "tag", subtype: "shorthand", index: s, end: e, raw: m[0] });
            }
            if (!m[0].length) shorthandRe.lastIndex++;
        }
        // 其他尖括号 <xxx>（排除已经被上面处理的）
        const angleRe = /<\/?[A-Za-z\u4e00-\u9fff][^<>\r\n]{0,80}>/g;
        while ((m = angleRe.exec(source))) {
            const s = m.index, e = s + m[0].length;
            if (!overlapsMedia(s, e) && !items.some(it => it.index === s)) {
                items.push({ kind: "tag", subtype: "other", index: s, end: e, raw: m[0] });
            }
            if (!m[0].length) angleRe.lastIndex++;
        }
        // 段落标题
        const sectionRe = /^(?:subject_definitions|integrated_multimodal_description|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music)\s*[:：]/gim;
        while ((m = sectionRe.exec(source))) {
            const s = m.index, e = s + m[0].length;
            if (!overlapsMedia(s, e)) {
                items.push({ kind: "section", index: s, end: e, raw: m[0] });
            }
            if (!m[0].length) sectionRe.lastIndex++;
        }
        // <d>[...]</d> 对白内容
        const dialogueRe = /<d>\s*\[[^\]\r\n]+\]([\s\S]*?)<\/d>/gi;
        while ((m = dialogueRe.exec(source))) {
            const body = m[1] || "";
            if (body) {
                const s = m.index + m[0].indexOf(body);
                items.push({ kind: "dialogue", index: s, end: s + body.length, raw: body });
            }
            if (!m[0].length) dialogueRe.lastIndex++;
        }

        items.sort((a, b) => a.index - b.index || b.end - a.end);
        // 去掉与前一个装饰重叠的（保证不重复渲染）
        const result = [];
        let cursor = 0;
        for (const it of items) {
            if (it.index < cursor) continue;
            result.push(it);
            cursor = it.end;
        }
        return result;
    };


    const renderRich = (preserveSelection = true) => {
        const source = prompt.value || "";
        const hadFocus = document.activeElement === prompt;
        const savedSel = preserveSelection && hadFocus ? readCaret() : null;

        // 【防丢失护盾】在清空DOM前，先把当前文本备份
        const backupText = source;
        try {
            prompt.replaceChildren();
            const appendText = text => {
                const parts = text.split("\n");
                parts.forEach((p, i) => {
                    if (p) prompt.append(document.createTextNode(p));
                    if (i < parts.length - 1) prompt.append(document.createElement("br"));
                });
            };

            let cursor = 0;
            for (const d of promptDecorations(source)) {
                if (d.index < cursor) continue;
                if (d.index > cursor) appendText(source.slice(cursor, d.index));

                if (d.kind === "media") {
                    const entry = resolveMedia(d.type, d.ordinal);
                    const wrap = make("span");
                    wrap.className = "ghupo-token";
                    if (entry && !entry.vacant && entry.name) {
                        const preview = make("span");
                        preview.className = "ghupo-preview" + (d.type === "audio" ? " audio" : "");
                        preview.contentEditable = "false";
                        if (d.isRefmod) {
                            // RefMod 没有缩略图，用 kind 图标代替空框
                            const kindBase = d.type.slice(7); // "video" | "picture" | "audio"
                            preview.textContent = kindBase === "picture" ? "🖼" : kindBase === "video" ? "🎬" : "🎤";
                            preview.style.fontSize = "13px";
                            preview.style.lineHeight = "24px";
                            preview.style.textAlign = "center";
                            preview.title = "RefMod 参考模型（" + kindBase + "）";
                        } else if (d.type === "picture") {
                            const img = make("img"); img.src = fileUrl(entry.name); preview.appendChild(img);
                        } else if (d.type === "video") {
                            const vid = make("video"); vid.src = fileUrl(entry.name); vid.muted = true; vid.preload = "metadata"; preview.appendChild(vid);
                        }
                        wrap.appendChild(preview);
                    }
                    const isGhost = !entry || entry.vacant || !entry.name;
                    // 【RefMod 身份标识】标签后加不可编辑的 [模型名] 小标
                    if (d.isRefmod && entry && entry.name && !isGhost) {
                        const nameEl = make("span", {}, `[${entry.displayName || entry.name.split("/").pop() || entry.name}]`);
                        nameEl.className = "ghupo-preview ghupo-refmod-name";
                        nameEl.contentEditable = "false";
                        nameEl.setAttribute("spellcheck", "false");
                        nameEl.title = `RefMod: ${entry.name}`;
                        wrap.appendChild(nameEl);
                    }
                    const tag = make("span");
                    const baseKind = d.type.startsWith("refmod-") ? d.type.slice(7) : d.type;
                    tag.className = `ghupo-tag ghupo-tag-${baseKind}`
                        + (d.isRefmod ? " ghupo-tag-refmod" : "")
                        + (isGhost ? " ghupo-tag-ghost" : "");
                    tag.textContent = d.raw;
                    tag.contentEditable = "false";
                    tag.setAttribute("spellcheck", "false");
                    // 【金色内联样式】绕过 CSS 优先级，强制 RefMod 标签显示金色
                    if (d.isRefmod && !isGhost) {
                        tag.style.background = "#5a4930";
                        tag.style.color = "#f7e0cd";
                        tag.style.webkitTextFillColor = "#f7e0cd";
                        tag.style.border = "1px solid #8a6d43";
                    }
                    wrap.appendChild(tag);
                    wrap.contentEditable = "false";
                    wrap.setAttribute("spellcheck", "false");
                    prompt.appendChild(wrap);
                } else if (d.kind === "section") {
                    const span = make("span");
                    span.className = "ghupo-section";
                    span.textContent = d.raw;
                    span.contentEditable = "false";
                    prompt.appendChild(span);
                } else if (d.kind === "dialogue") {
                    const mark = make("mark");
                    mark.className = "ghupo-dialogue";
                    mark.textContent = d.raw;
                    mark.contentEditable = "false";
                    prompt.appendChild(mark);
                } else if (d.kind === "tag") {
                    const span = make("span");
                    span.className = `ghupo-tag-${d.subtype || "other"}`;
                    span.textContent = d.raw;
                    span.contentEditable = "false";
                    span.setAttribute("spellcheck", "false");
                    prompt.appendChild(span);
                }
                cursor = d.end;
            }
            if (cursor < source.length) appendText(source.slice(cursor));

            prompt.classList.toggle("ghupo-prompt-empty", !source);
            if (savedSel && hadFocus) {
                const [s0, s1] = savedSel;
                requestAnimationFrame(() => applyCaret(s0, s1));
            }
        } catch (err) {
            // 【崩溃兜底】如果内部解析崩溃，把备份的文本恢复回去，绝不丢失用户内容
            console.error("[GH] renderRich 内部崩溃，恢复原始文本:", err);
            prompt.value = backupText;
            prompt.classList.toggle("ghupo-prompt-empty", !backupText);
        }
    };

    // ---- @ 弹出菜单 ----
    const mentionMenu = make("div");
    mentionMenu.className = "ghupo-mention";
    mentionMenu.style.display = "none";
    let mentionAnchorPos = null; // 光标文本 offset，从哪个 @ 开始的
    let mentionSelectedIndex = 0;
    let mentionItems = [];

    const buildMentionItems = () => {
        const items = [];
        for (const slot of IMAGE_SLOTS) {
            const e = media.get(slot); if (!e) continue;
            items.push({ slot, kind: "image", entry: e, ordinal: IMAGE_SLOTS.indexOf(slot) + 1 });
        }
        for (const slot of VIDEO_SLOTS) {
            const e = media.get(slot); if (!e) continue;
            items.push({ slot, kind: "video", entry: e, ordinal: VIDEO_SLOTS.indexOf(slot) + 1 });
        }
        for (const slot of AUDIO_SLOTS) {
            const e = media.get(slot); if (!e) continue;
            items.push({ slot, kind: "audio", entry: e, ordinal: AUDIO_SLOTS.indexOf(slot) + 1 });
        }
        return items;
    };
    const labelForItem = item => {
        const typeLabel = item.kind === "image" ? "图片" : item.kind === "video" ? "视频" : "音频";
        return isChineseLocale() ? `${typeLabel}${item.ordinal}` : `${item.kind} ${item.ordinal}`;
    };
    const insertForItem = item => {
        const typeLabel = item.kind === "image" ? "图" : item.kind === "video" ? "视频" : "音频";
        return isChineseLocale() ? `@${typeLabel}${item.ordinal} ` : `@${item.kind} ${item.ordinal} `;
    };

    const renderMentionMenu = () => {
        mentionMenu.replaceChildren();
        mentionItems.forEach((item, index) => {
            const row = make("div");
            row.className = "ghupo-mention-item" + (index === mentionSelectedIndex ? " selected" : "");
            const thumb = make("span");
            thumb.className = "ghupo-mention-thumb" + (item.kind === "audio" ? " audio" : "");
            if (item.kind === "image" && item.entry?.name) {
                const img = make("img"); img.src = fileUrl(item.entry.name); thumb.appendChild(img);
            } else if (item.kind === "video" && item.entry?.name) {
                const vid = make("video"); vid.src = fileUrl(item.entry.name); vid.muted = true; vid.preload = "metadata"; thumb.appendChild(vid);
            }
            row.appendChild(thumb);
            const label = make("span", {}, labelForItem(item));
            label.className = "ghupo-mention-label"; row.appendChild(label);
            // 只在 mousedown 里处理：
            // - mousedown 的 preventDefault 才是阻止焦点转移的规范做法
            // - pickMention 在 mousedown 里执行，确保此时选区仍指向 prompt
            // - 不用 pointerdown：对 pointerdown 做 preventDefault 会抑制随后
            //   的鼠标兼容事件，让浏览器错失"已处理"的信号
            row.addEventListener("mousedown", e => {
                e.preventDefault();
                e.stopPropagation();
                pickMention(index);
            }, true);
            mentionMenu.appendChild(row);
        });
    };

    const showMentionMenu = () => {
        mentionItems = buildMentionItems();
        if (!mentionItems.length) { hideMentionMenu(); return; }
        mentionSelectedIndex = 0;
        renderMentionMenu();
        mentionMenu.style.display = "block";
        // 定位在光标下方
        const sel = window.getSelection();
        if (sel?.rangeCount) {
            const range = sel.getRangeAt(0).cloneRange();
            range.collapse(false);
            let rect = range.getBoundingClientRect();
            if (!rect.width && !rect.height) rect = prompt.getBoundingClientRect();
            mentionMenu.style.left = Math.max(4, rect.left) + "px";
            mentionMenu.style.top = (rect.bottom + 4) + "px";
        }
    };
    const hideMentionMenu = () => {
        mentionMenu.style.display = "none";
        mentionAnchorPos = null;
        mentionItems = [];
    };
    const pickMention = index => {
        const item = mentionItems[index];
        if (!item || mentionAnchorPos == null) { hideMentionMenu(); return; }
        // 用 @ 之后的实际字符位置作为替换终点：即使 prompt 已失焦，
        // 也能把用户已经输入的半截 @xx 一并吞掉，不会残留"图"这样的孤字。
        const text = editorText();
        let caret = mentionAnchorPos + 1;
        while (caret < text.length && !/[\s\n]/.test(text[caret])) caret++;
        // 有真实选区时优先用它（用户可能用鼠标拖选了别处再回到菜单）。
        const offsets = selectionOffsets();
        if (offsets && offsets[1] > mentionAnchorPos) caret = offsets[1];
        prompt.setRangeText(insertForItem(item), mentionAnchorPos, caret, "end");
        lastTagSignature = tagSignature(editorText());
        persist();
        // 延迟到本次事件循环结束再隐藏菜单：
        // 立即隐藏会让随后的 mouseup/click 事件落到菜单"空位"下方的画布上，
        // 浏览器会把焦点丢给画布，prompt 光标随之清零。
        setTimeout(hideMentionMenu, 0);
    };

    // 输入时检测 @
    const detectMention = () => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) { hideMentionMenu(); return; }
        const range = sel.getRangeAt(0);
        if (!prompt.contains(range.startContainer)) { hideMentionMenu(); return; }
        const caret = selectionOffsets()?.[0];
        if (caret == null) { hideMentionMenu(); return; }
        const text = editorText();
        // 往前找最近的 @，且其后无换行/空格
        let at = -1;
        for (let i = caret - 1; i >= 0; i--) {
            const ch = text[i];
            if (ch === "@") { at = i; break; }
            if (ch === "\n" || ch === " " || ch === "\t") break;
        }
        if (at < 0) { hideMentionMenu(); return; }
        const query = text.slice(at + 1, caret);
        // 已经是一个完整标签就不再弹
        if (/\d/.test(query)) { hideMentionMenu(); return; }
        mentionAnchorPos = at;
        showMentionMenu();
    };

    // 键盘交互
    prompt.addEventListener("keydown", e => {
        if (mentionMenu.style.display === "none") return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideMentionMenu(); return; }
        if (!mentionItems.length) return;
        if (e.key === "ArrowDown") { e.preventDefault(); mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionItems.length; renderMentionMenu(); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); mentionSelectedIndex = (mentionSelectedIndex - 1 + mentionItems.length) % mentionItems.length; renderMentionMenu(); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); pickMention(mentionSelectedIndex); return; }
    }, true);


    // ---- 滚轮事件拦截：鼠标在编辑器内时，优先滚动编辑器内容 ----
    // ComfyUI 在 window 捕获阶段监听 wheel 来缩放画布。只要编辑器能滚动
    // （未到顶 / 未到底），就在捕获阶段吃掉事件并手动改 scrollTop；
    // 到顶或到底时放行，让画布正常缩放 —— 这是原节点同款体验。
    const promptCanConsumeWheel = event => {
        const path = event.composedPath?.() || [];
        if (!path.includes(prompt) && event.target !== prompt) return false;
        // 编辑器没有溢出时不吃事件（内容不够长 → 交给画布缩放）
        if (prompt.scrollHeight <= prompt.clientHeight + 1) return false;
        const atTop = prompt.scrollTop <= 1;
        const atBottom = prompt.scrollTop + prompt.clientHeight >= prompt.scrollHeight - 2;
        return (event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom);
    };
    const capturePromptWheel = event => {
        if (!promptCanConsumeWheel(event)) return;
        event.preventDefault();
        event.stopPropagation();
        prompt.scrollTop += event.deltaY;
    };
    window.addEventListener("wheel", capturePromptWheel, { capture: true, passive: false });

    let lastTagSignature = "";
    // 签名扩展：除 media 外，任何会被着色的标签出现/消失都触发重绘。
    const tagSignature = text => {
        const media = mediaMatches(text).map(m => `${m.type}:${m.ordinal}`);
        const others = promptDecorations(text)
            .filter(d => d.kind !== "media")
            .map(d => d.raw);
        return [...media, ...others].sort().join("|");
    };

    prompt.addEventListener("input", () => {
        // 用户主动打字 = 恢复流程确实结束了（或这是一个全新节点）。
        // 在这里解除保护，之后 persist 才能安心写 widget。
        if (restoringState) restoringState = false;

        // 尝试快捷展开：v1 → <Video 1>
        if (tryExpandShortRefmodTag()) {
            persist();
            updateOptimizeButton();
            renderStoryboard();
            return;
        }

        const inputText = editorText();
        // 【内容比对兜底】先判断内容是否等于缓存里的优化稿：
        // - 相等 → 立刻恢复 optimized 视图（解决剪切/粘贴、全选删除再粘贴回来的场景）
        // - 不等且当前是 optimized → 静默更新缓存（不用空内容覆盖，防止剪切清空破坏缓存）
        // - 否则 → 维持 original 视图
        if (optimizerCache?.result && inputText === optimizerCache.result) {
            promptState = "optimized";
        } else if (promptState === "optimized") {
            if (optimizerCache && inputText) optimizerCache.result = inputText;
        } else {
            promptState = "original";
        }
        // 【双模式】大白话视图下，实时写回当前槽位
        if (promptState === "original") {
            modeState[currentSlot()].original = inputText;
        }

        const text = editorText();
        const w = widget(node, "prompt");
        if (w) w.value = text;
        prompt.classList.toggle("ghupo-prompt-empty", !text);
        // 只在"媒体标签集合"发生变化时才重绘，普通打字不触发，光标稳定。
        const sig = tagSignature(text);
        if (sig !== lastTagSignature) {
            lastTagSignature = sig;
            renderRich();
        }
        detectMention();
        updateOptimizeButton();
        // 【L2-b】输入时实时刷新故事板（当前段标签跟随编辑器）
        renderStoryboard();
        persist();
    });
    prompt.addEventListener("blur", () => {
        // 延迟关闭，让菜单点击事件先处理
        setTimeout(hideMentionMenu, 150);
    });
    prompt.addEventListener("blur", () => {
        lastTagSignature = tagSignature(editorText());
        renderRich();
        updateOptimizeButton();
    });

    // ---- 素材渲染 ----
    const card = (slot, entry) => {
        const item = make("div"); item.className = "ghupo-card";
        if (entry.kind === "audio") item.classList.add("ghupo-audio");
        item.dataset.ghupoSlot = slot;

        if (entry.kind === "image") {
            const img = make("img"); img.src = fileUrl(entry.name); img.draggable = false; item.appendChild(img);
        } else if (entry.kind === "video") {
            const vid = make("video"); vid.src = fileUrl(entry.name); vid.muted = true; vid.preload = "metadata"; vid.draggable = false; item.appendChild(vid);
        } else {
            const icon = make("div", {}, "♫"); icon.className = "ghupo-audio-icon"; item.appendChild(icon);
        }

        const nameTag = make("div", {}, entry.name); nameTag.className = "ghupo-card-name"; item.appendChild(nameTag);

        // ---- 素材权重（0.1~2.0，默认 1.0；只影响描述详细度与镜头焦点，不影响 Subject 是否存在）----
        const weightBox = make("span"); weightBox.className = "ghupo-weight";
        const weightDec = make("button", {}, "−"); weightDec.className = "ghupo-weight-dec";
        const weightInput = make("input"); weightInput.type = "number";
        weightInput.className = "ghupo-weight-input";
        weightInput.min = "0.1"; weightInput.max = "2.0"; weightInput.step = "0.1";
        const currentWeight = Number.isFinite(Number(entry.weight)) ? Number(entry.weight) : 1.0;
        weightInput.value = currentWeight.toFixed(1);
        const weightInc = make("button", {}, "+"); weightInc.className = "ghupo-weight-inc";
        weightBox.append(weightDec, weightInput, weightInc);
        item.appendChild(weightBox);

        const applyWeightVisual = (w) => {
            weightInput.classList.toggle("high", w > 1.0);
            weightInput.classList.toggle("low", w < 1.0);
        };
        applyWeightVisual(currentWeight);

        const writeWeight = (v, triggerUpdate = true) => {
            const clamped = Math.max(0.1, Math.min(2.0, Math.round(Number(v) * 10) / 10));
            const entryNow = media.get(slot);
            if (!entryNow) return;
            entryNow.weight = clamped;
            weightInput.value = clamped.toFixed(1);
            applyWeightVisual(clamped);
            if (triggerUpdate && typeof persist === "function") persist();
        };

        weightDec.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            writeWeight((Number(media.get(slot)?.weight) || 1.0) - 0.1);
        };
        weightInc.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            writeWeight((Number(media.get(slot)?.weight) || 1.0) + 0.1);
        };
        // 阻止事件冒泡到卡片（避免卡片 pointerup 插入引用标签）
        const stopBubble = (e) => e.stopPropagation();
        weightInput.addEventListener("mousedown", stopBubble);
        weightInput.addEventListener("pointerdown", stopBubble);
        weightInput.addEventListener("pointerup", stopBubble);
        weightInput.addEventListener("click", stopBubble);

        // 手动输入
        weightInput.addEventListener("input", () => {
            const v = parseFloat(weightInput.value);
            if (Number.isFinite(v)) applyWeightVisual(v);
        });
        weightInput.addEventListener("blur", () => writeWeight(weightInput.value));

        // 鼠标左右拖动快速调整：pointerdown 立即 setPointerCapture，避免鼠标移出后丢事件
        let weightDrag = null;
        weightInput.addEventListener("pointerdown", e => {
            if (e.button !== 0) return;
            weightDrag = { startX: e.clientX, startVal: Number(media.get(slot)?.weight) || 1.0, dragging: false, id: e.pointerId };
            try { weightInput.setPointerCapture(e.pointerId); } catch {}
        });
        weightInput.addEventListener("pointermove", e => {
            const s = weightDrag;
            if (!s || s.id !== e.pointerId) return;
            const dx = e.clientX - s.startX;
            if (!s.dragging && Math.abs(dx) > 4) {
                s.dragging = true;
                weightInput.blur();
            }
            if (s.dragging) {
                e.preventDefault();
                const next = s.startVal + Math.round(dx / 8) * 0.1;
                const clamped = Math.max(0.1, Math.min(2.0, Math.round(next * 10) / 10));
                weightInput.value = clamped.toFixed(1);
                applyWeightVisual(clamped);
            }
        });
        const endWeightDrag = e => {
            const s = weightDrag;
            if (!s) return;
            try { weightInput.releasePointerCapture?.(s.id); } catch {}
            if (s.dragging) writeWeight(weightInput.value);
            weightDrag = null;
        };
        weightInput.addEventListener("pointerup", endWeightDrag);
        weightInput.addEventListener("pointercancel", endWeightDrag);

        const rm = make("button", {}, "×"); rm.className = "ghupo-remove";
        rm.onclick = e => {
            e.stopPropagation();
            e.preventDefault();

            const removed = media.get(slot);
            if (!removed) {
                e.currentTarget?.closest('.ghupo-card')?.remove();
                return;
            }

            media.delete(slot);
            const w = widget(node, slot); if (w) w.value = "";

            // 【历史作废】遍历所有模式的历史栈，把引用已删/已换素材的条目清掉
            {
                let dropped = 0;
                for (const m of ["video", "image"]) {
                    const stack = modeState[m].history || [];
                    const keep = [];
                    for (const entry of stack) {
                        const valid = (entry.mediaSnapshot || []).every(([snapSlot, snapKind, snapName]) => {
                            const cur = media.get(snapSlot);
                            return cur && cur.kind === snapKind && cur.name === snapName;
                        });
                        if (valid) keep.push(entry);
                        else dropped++;
                    }
                    modeState[m].history = keep;
                }
                if (dropped > 0) {
                    try { showToast(`${dropped} 个历史版本因素材变更而失效`); }
                    catch (err) { console.error("[GH] showToast 失败:", err); }
                } else {
                    console.warn("[GH] 删素材后没有历史版本被作废，dropped=0");
                }
            }

            if (removed?.kind === "video" && removed.name) {
                try { promptVideoThumbnailCache.delete(removed.name); } catch {}
            }

            // 物理销毁当前卡片
            const currentCard = e.currentTarget?.closest('.ghupo-card');
            if (currentCard) currentCard.remove();

            // 【关键修复】同步重绘右侧编辑器。
            // 注意：renderRich 内部已经会 prompt.replaceChildren()，会自己按最新 media 状态重绘，
            // 缺失素材的引用会自动变成幽灵标签。这里绝不能再手动 replaceChildren()，
            // 否则会先清空编辑器 DOM，导致 renderRich 从空 DOM 读到空文本，把用户的大白话全清掉。
            try {
                renderRich();
            } catch (err) {
                console.error("[GH] renderRich 失败:", err);
            }

            // 再重绘左侧网格
            try { render(); } catch (err) { console.error("[GH] render 失败:", err); }

            persist();
        };
        item.appendChild(rm);

        // pointerdown 阶段阻止焦点从 prompt 转移（浏览器默认行为）。
        // pointerup 阶段才执行插入，这样焦点从未离开过 prompt，光标不丢。
        item.addEventListener("pointerdown", e => {
            if (e.target.closest("button")) return;
            // 【权重框放行】input 需要获得焦点，capture 阶段的 preventDefault 会阻止它
            if (e.target.classList?.contains("ghupo-weight-input")) return;
            if (e.target.closest?.(".ghupo-weight")) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
        item.addEventListener("pointerup", e => {
            if (e.target.closest("button")) return;
            if (e.target.classList?.contains("ghupo-weight-input")) return;
            if (e.target.closest?.(".ghupo-weight")) return;
            e.preventDefault();
            e.stopPropagation();
            const ordinal = (entry.kind === "image" ? IMAGE_SLOTS : entry.kind === "video" ? VIDEO_SLOTS : AUDIO_SLOTS).indexOf(slot) + 1;
            const typeLabel = entry.kind === "image" ? "图片" : entry.kind === "video" ? "视频" : "音频";
            const tagText = isChineseLocale() ? `@${typeLabel}${ordinal} ` : `@${entry.kind} ${ordinal} `;
            const len = editorText().length;
            prompt.setRangeText(tagText, len, len);
            persist(); render();
        }, true);
        return item;
    };

    const addDrop = () => {
        const d = make("div"); d.className = "ghupo-drop";
        const empty = media.size === 0;
        if (empty) d.classList.add("ghupo-empty");
        const icon = make("div", {}, "↑"); icon.className = "ghupo-drop-icon";
        const row = make("div", { display: "flex", alignItems: "center" }); row.appendChild(icon);
        const title = make("span", {}, empty ? t("Reference media") : t("+ Add media")); title.className = "ghupo-drop-title"; row.appendChild(title);
        d.appendChild(row);
        if (empty) {
            const sub = make("div", {}, t("Images x9 · Videos x3 · Audios x3")); sub.className = "ghupo-drop-subtitle";
            d.appendChild(sub);
        }
        d.onclick = () => {
            const input = document.createElement("input");
            input.type = "file"; input.multiple = true;
            input.accept = "image/*,video/*,audio/*";
            input.onchange = () => accept(input.files, null);
            input.click();
        };
        d.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        d.ondrop = e => { e.preventDefault(); e.stopPropagation(); accept(e.dataTransfer.files, null); };
        return d;
    };

    // ---- 故事板：解析优化稿，提取每 shot 的时间段与出场素材 ----
    const parseStoryboard = (text) => {
        if (!text) return null;
        // 1. 解析 subject_definitions 里的 SN → picture N 映射
        const subjMap = {};
        // 扩大匹配窗口到 800 字符，覆盖 LLM 详细描述的场景
        const subjRe = /<Subject\s+(\d+)[^>]*>[\s\S]{0,800}?<picture\s+(\d+)/gi;
        let m;
        while ((m = subjRe.exec(text))) subjMap[Number(m[1])] = Number(m[2]);
        // 2. 解析 [Shot N] X.XXs-YY.YYs: 段落
        const shots = [];
        const shotRe = /\[Shot\s+(\d+)\]\s*([\d.]+)\s*s?\s*[-~到]\s*([\d.]+)\s*s?\s*[:：]?\s*([\s\S]*?)(?=\[Shot\s+\d+\]|$)/gi;
        while ((m = shotRe.exec(text))) {
            const body = m[4] || "";
            const snSet = new Set();
            const snRe = /\(S(\d+)\)/g;
            let n;
            while ((n = snRe.exec(body))) snSet.add(Number(n[1]));
            shots.push({
                num: Number(m[1]),
                start: parseFloat(m[2]),
                end: parseFloat(m[3]),
                sn: [...snSet].sort((a, b) => a - b),
            });
        }
        if (!shots.length) return null;
        return { subjMap, shots };
    };

    // 【L2-b】段块配色方案（8 色循环）
    const SEG_COLORS = [
        { border: "#27d9e5", bg: "rgba(39,217,229,.14)" },
        { border: "#a87be8", bg: "rgba(168,123,232,.14)" },
        { border: "#ff7a45", bg: "rgba(255,122,69,.14)" },
        { border: "#52d17a", bg: "rgba(82,209,122,.14)" },
        { border: "#ff6ba6", bg: "rgba(255,107,166,.14)" },
        { border: "#4a90e2", bg: "rgba(74,144,226,.14)" },
        { border: "#ffd76b", bg: "rgba(255,215,107,.14)" },
        { border: "#ff5b5b", bg: "rgba(255,91,91,.14)" },
    ];

    // 【L2-b·缩放】时间线缩放系数（像素/秒）
    //   null  = 自适应铺满容器；数字 = 用户滚轮锁定
    let timelineZoom = null;
    const MIN_ZOOM = 6;
    const MAX_ZOOM = 600;
    function getTotalDuration() {
        return segments.reduce((s, seg) => s + (Number(seg.duration) || 0), 0) || 1;
    }
    function getEffectiveZoom() {
        if (typeof timelineZoom === "number" && timelineZoom > 0) {
            return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, timelineZoom));
        }
        const total = getTotalDuration();
        const cw = tlTrack.clientWidth || storyboardBody.clientWidth || 800;
        return Math.max(MIN_ZOOM, Math.min(200, cw / total));
    }
    function chooseTickStep(zoom) {
        const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
        for (const c of candidates) {
            if (c * zoom >= 60) return c;
        }
        return 60;
    }
    // 【L2-b·缩放】次刻度：主刻度的 1/5，间距至少 10px，否则不显示
    function chooseSubTickStep(mainStep, zoom) {
        const sub = mainStep / 5;
        if (sub * zoom >= 10) return sub;
        return null;
    }
    function fmtTick(t) {
        if (Math.abs(t - Math.round(t)) < 1e-6) return t + "s";
        return t.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "s";
    }

    const renderStoryboard = () => {
        try {
            // 【L2-b】视频模式总显示时间线（包含 RefMod 模式）
            if (viewMode !== "video") {
                storyboard.style.display = "none";
                return;
            }
            if (!segments.length) {
                storyboard.style.display = "none";
                return;
            }
            // 【L2-b·缩放】像素布局：每秒 = zoom 像素
            const total = getTotalDuration();
            const zoom = getEffectiveZoom();
            tlInner.style.width = (total * zoom) + "px";

            // 1. 计算每段起点/终点（累加式）
            let cursor = 0;
            const segInfo = segments.map((s, i) => {
                const dur = Number(s.duration) || 5;
                const start = cursor;
                cursor += dur;
                return { index: i, start, end: cursor, duration: dur, seg: s };
            });

            // 2. 渲染刻度尺（主刻度带标签 + 次刻度短竖线）
            tlRuler.replaceChildren();
            const tickStep = chooseTickStep(zoom);
            const subStep = chooseSubTickStep(tickStep, zoom);
            // 先画次刻度（底层，会被主刻度覆盖）
            if (subStep) {
                const subCount = Math.ceil(total / subStep) + 1;
                for (let i = 0; i < subCount; i++) {
                    const t = i * subStep;
                    if (t > total + 1e-6) break;
                    // 跳过主刻度位置（避免重复）
                    if (Math.abs(t / tickStep - Math.round(t / tickStep)) < 1e-6) continue;
                    const sub = make("div"); sub.className = "ghupo-tl-tick sub";
                    sub.style.left = (t * zoom) + "px";
                    tlRuler.appendChild(sub);
                }
            }
            // 再画主刻度
            const tickCount = Math.ceil(total / tickStep) + 1;
            for (let i = 0; i < tickCount; i++) {
                const t = i * tickStep;
                if (t > total + 1e-6) break;
                const tick = make("div"); tick.className = "ghupo-tl-tick";
                tick.style.left = (t * zoom) + "px";
                tick.textContent = fmtTick(t);
                tlRuler.appendChild(tick);
            }
            const tail = make("div"); tail.className = "ghupo-tl-tick";
            tail.style.left = (total * zoom) + "px";
            tail.style.transform = "translateX(-100%)";
            tail.style.borderLeft = "none";
            tail.style.textAlign = "right";
            tail.style.paddingLeft = "0";
            tail.style.paddingRight = "3px";
            tail.textContent = total.toFixed(1) + "s";
            tlRuler.appendChild(tail);

            // 3. 渲染段块
            tlTrack.replaceChildren();
            for (const info of segInfo) {
                const color = SEG_COLORS[info.index % SEG_COLORS.length];
                const segEl = make("div"); segEl.className = "ghupo-tl-seg";
                segEl.style.left = (info.start * zoom) + "px";
                segEl.style.width = (info.duration * zoom) + "px";
                segEl.style.borderColor = color.border;
                segEl.style.background = color.bg;
                segEl.style.color = color.border;
                segEl.dataset.segIndex = info.index;
                if (info.index === activeSegmentIndex) segEl.classList.add("active");

                const lbl = make("div"); lbl.className = "ghupo-tl-seg-label";
                // 【L2-b】当前段优先读实时编辑器内容，其他段读存储
                const liveText = (info.index === activeSegmentIndex)
                    ? (promptState === "optimized" ? (optimizerCache?.result || "") : (modeState.video.original || ""))
                    : (info.seg.cache?.result || info.seg.original || "");
                const rawText = liveText.replace(/\s+/g, " ").trim();
                lbl.textContent = `段${info.index + 1}` + (rawText ? " · " + rawText.slice(0, 16) : "");
                segEl.appendChild(lbl);

                const timeEl = make("div"); timeEl.className = "ghupo-tl-seg-time";
                timeEl.textContent = `${info.start.toFixed(1)}-${info.end.toFixed(1)}s`;
                segEl.appendChild(timeEl);

                // 缩略图：优先 imageIndices，否则从文本里提取 @图N
                const thumbs = make("div"); thumbs.className = "ghupo-tl-seg-thumbs";
                const picOrdinals = [];
                if (Array.isArray(info.seg.imageIndices) && info.seg.imageIndices.length) {
                    for (const idx of info.seg.imageIndices) picOrdinals.push(idx + 1);
                } else {
                    const srcText = info.seg.cache?.result || info.seg.original || "";
                    for (const m of mediaMatches(srcText)) {
                        if (m.type === "picture") picOrdinals.push(m.ordinal);
                    }
                }
                const seen = new Set();
                for (const ord of picOrdinals) {
                    if (seen.has(ord)) continue;
                    seen.add(ord);
                    if (thumbs.childNodes.length >= 5) break;
                    const thumb = make("span"); thumb.className = "ghupo-tl-seg-thumb";
                    
                    // 【核心修复】从该段独立的 media 快照中读取，而不是全局 resolveMedia
                    const slotName = `ref_image_${ord}`;
                    let entry = null;
                    if (info.seg.media && info.seg.media[slotName]) {
                        entry = info.seg.media[slotName];
                    } else if (info.index === activeSegmentIndex) {
                        entry = media.get(slotName); // 如果是当前激活段，用正在编辑的 media
                    }
                    
                    if (entry && entry.name) {
                        const img = make("img"); img.src = fileUrl(entry.name); img.draggable = false;
                        thumb.appendChild(img);
                    } else {
                        thumb.textContent = `图${ord}`;
                    }
                    thumbs.appendChild(thumb);
                }
                if (thumbs.childNodes.length) segEl.appendChild(thumbs);

                // 【L2-b】点击/拖动由 tlTrack 事件委托统一处理

                // 【L2-b】删除按钮（hover 显示，仅多段时出现）
                if (segments.length > 1) {
                    const del = make("button", {}, "×");
                    del.className = "ghupo-tl-seg-del";
                    del.title = "删除此段";
                    del.addEventListener("pointerdown", (e) => e.stopPropagation());
                    del.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeSegment(info.index);
                    };
                    segEl.appendChild(del);
                }

                tlTrack.appendChild(segEl);
            }

            // 4. 更新标题栏
            storyboardMeta.textContent = `${total.toFixed(1)}s · ${segments.length} 段 · ${Math.round(zoom)}px/s`;
            storyboard.style.display = "";
            storyboardBody.classList.toggle("hidden", storyboardCollapsed);
            storyboardToggle.textContent = storyboardCollapsed ? "▸" : "▾";
        } catch (err) {
            console.error("[GH] renderStoryboard 失败:", err);
            storyboard.style.display = "none";
        }
    };

    // ============ 【L2-b】段块拖动：拖右边缘改时长 + 拖中间改顺序 ============
    let segDragState = null;
    let segGhostEl = null;
    let segDropLine = null;

    function ensureGhostDrag() {
        if (!segGhostEl) {
            segGhostEl = make("div");
            segGhostEl.style.cssText = "position:fixed;pointer-events:none;z-index:9999;opacity:.78;border:1px solid #0aa4d6;border-radius:5px;background:rgba(10,164,214,.4);color:#cdf0f7;font:11px Arial;padding:4px 8px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 16px rgba(0,0,0,.5)";
            document.body.appendChild(segGhostEl);
        }
        if (!segDropLine) {
            segDropLine = make("div");
            segDropLine.style.cssText = "position:fixed;pointer-events:none;z-index:9998;width:3px;background:#0aa4d6;box-shadow:0 0 8px #0aa4d6;display:none";
            document.body.appendChild(segDropLine);
        }
    }
    function moveGhostDrag(clientX, clientY, segIndex) {
        const seg = segments[segIndex];
        const text = (seg.cache?.result || seg.original || "(空段)").replace(/\s+/g, " ").slice(0, 24);
        segGhostEl.textContent = `段${segIndex + 1} · ${text}`;
        segGhostEl.style.left = (clientX + 14) + "px";
        segGhostEl.style.top = (clientY - 12) + "px";
        const rect = tlTrack.getBoundingClientRect();
        const dropX = computeDropPixel(clientX);
        segDropLine.style.left = dropX + "px";
        segDropLine.style.top = rect.top + "px";
        segDropLine.style.height = rect.height + "px";
        segDropLine.style.display = "block";
    }
    function clearGhostDrag() {
        if (segGhostEl) { segGhostEl.remove(); segGhostEl = null; }
        if (segDropLine) { segDropLine.remove(); segDropLine = null; }
    }
    function computeDropPixel(clientX) {
        const rect = tlTrack.getBoundingClientRect();
        const zoom = getEffectiveZoom();
        let cursor = 0;
        for (let i = 0; i < segments.length; i++) {
            const dur = Number(segments[i].duration) || 0;
            const midPx = rect.left + (cursor + dur / 2) * zoom;
            if (clientX < midPx) return midPx;
            cursor += dur;
        }
        return rect.left + cursor * zoom;
    }
    function computeDropIndex(clientX) {
        const rect = tlTrack.getBoundingClientRect();
        const zoom = getEffectiveZoom();
        const relX = clientX - rect.left;
        let cursor = 0;
        for (let i = 0; i < segments.length; i++) {
            const dur = Number(segments[i].duration) || 0;
            const midPx = (cursor + dur / 2) * zoom;
            if (relX < midPx) return i;
            cursor += dur;
        }
        return segments.length;
    }
    function commitReorder(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        // 回写当前段
        if (promptState === "original") modeState.video.original = editorText();
        modeState.video.cache = optimizerCache;
        syncMirrorToSegment();
        const [moved] = segments.splice(fromIndex, 1);
        const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
        segments.splice(insertAt, 0, moved);
        // 【L2-b】被拖的段成为激活段，编辑器跟着切过去
        activeSegmentIndex = insertAt;
        syncSegmentToMirror(activeSegmentIndex);
        // 刷新编辑器 + 时长控件
        prompt.value = promptState === "optimized"
            ? (optimizerCache?.result || "")
            : (modeState.video.original || "");
        renderRich();
        prompt.blur();
        prompt.scrollTop = 0;
        if (segments[activeSegmentIndex]) setDuration(segments[activeSegmentIndex].duration, false);
        updateOptimizeButton();
        renderStoryboard();
        persist();
    }
    function updateSegLayout() {
        const totalDur = getTotalDuration();
        const zoom = getEffectiveZoom();
        tlInner.style.width = (totalDur * zoom) + "px";
        let cursor = 0;
        const segEls = tlTrack.querySelectorAll(".ghupo-tl-seg");
        for (let i = 0; i < segments.length; i++) {
            const dur = Number(segments[i].duration) || 0;
            const el = segEls[i];
            if (el) {
                el.style.left = (cursor * zoom) + "px";
                el.style.width = (dur * zoom) + "px";
                const timeEl = el.querySelector(".ghupo-tl-seg-time");
                if (timeEl) timeEl.textContent = `${cursor.toFixed(1)}-${(cursor + dur).toFixed(1)}s`;
            }
            cursor += dur;
        }
        // 刷新刻度尺
        tlRuler.replaceChildren();
        const tickStep = chooseTickStep(zoom);
        const subStep = chooseSubTickStep(tickStep, zoom);
        if (subStep) {
            const subCount = Math.ceil(totalDur / subStep) + 1;
            for (let i = 0; i < subCount; i++) {
                const t = i * subStep;
                if (t > totalDur + 1e-6) break;
                if (Math.abs(t / tickStep - Math.round(t / tickStep)) < 1e-6) continue;
                const sub = make("div"); sub.className = "ghupo-tl-tick sub";
                sub.style.left = (t * zoom) + "px";
                tlRuler.appendChild(sub);
            }
        }
        const tickCount = Math.ceil(totalDur / tickStep) + 1;
        for (let i = 0; i < tickCount; i++) {
            const t = i * tickStep;
            if (t > totalDur + 1e-6) break;
            const tick = make("div"); tick.className = "ghupo-tl-tick";
            tick.style.left = (t * zoom) + "px";
            tick.textContent = fmtTick(t);
            tlRuler.appendChild(tick);
        }
        const tail = make("div"); tail.className = "ghupo-tl-tick";
        tail.style.left = (totalDur * zoom) + "px";
        tail.style.transform = "translateX(-100%)";
        tail.style.borderLeft = "none";
        tail.style.textAlign = "right";
        tail.style.paddingLeft = "0";
        tail.style.paddingRight = "3px";
        tail.textContent = totalDur.toFixed(1) + "s";
        tlRuler.appendChild(tail);
        storyboardMeta.textContent = `${totalDur.toFixed(1)}s · ${segments.length} 段 · ${Math.round(zoom)}px/s`;
    }

    // ---- tlTrack 事件委托：pointerdown / move / up ----
    tlTrack.addEventListener("pointerdown", (e) => {
        const segEl = e.target.closest(".ghupo-tl-seg");
        if (!segEl) return;
        if (e.target.closest(".ghupo-tl-seg-del")) return;
        if (e.button !== 0) return;
        const segIndex = Number(segEl.dataset.segIndex);
        if (!Number.isFinite(segIndex)) return;
        e.stopPropagation();
        e.preventDefault();
        // 【L2-b·缩放】用户开始交互时锁定 zoom，避免拖动时自适应跟着变
        if (timelineZoom === null) timelineZoom = getEffectiveZoom();
        const r = segEl.getBoundingClientRect();
        const relX = e.clientX - r.left;
        const isEdge = relX >= r.width - 8;
        segDragState = {
            mode: isEdge ? "resize" : "move",
            segIndex,
            startX: e.clientX,
            startY: e.clientY,
            origDuration: Number(segments[segIndex]?.duration) || 5,
            moved: false,
            pointerId: e.pointerId,
            segEl,
        };
        try { tlTrack.setPointerCapture(e.pointerId); } catch {}
    });

    tlTrack.addEventListener("pointermove", (e) => {
        // 光标跟随（未拖动时）
        if (!segDragState) {
            const segEl = e.target.closest?.(".ghupo-tl-seg");
            if (segEl && !e.target.closest(".ghupo-tl-seg-del")) {
                const r = segEl.getBoundingClientRect();
                const relX = e.clientX - r.left;
                if (relX >= r.width - 8) segEl.classList.add("edge-hover");
                else segEl.classList.remove("edge-hover");
            }
            return;
        }
        const d = segDragState;
        if (d.pointerId !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        if (!d.moved && Math.abs(dx) > 4) {
            d.moved = true;
            d.segEl.classList.add("dragging");
            if (d.mode === "move") ensureGhostDrag();
        }
        if (!d.moved) return;
        if (d.mode === "resize") {
            const zoom = getEffectiveZoom();
            const newDurRaw = d.origDuration + dx / zoom;
            let snapped = Math.round(newDurRaw * 2) / 2;  // 0.5 秒吸附
            snapped = Math.max(1, Math.min(30, snapped));
            if (snapped !== Number(segments[d.segIndex].duration)) {
                segments[d.segIndex].duration = snapped;
                if (d.segIndex === activeSegmentIndex) setDuration(snapped, false);
                updateSegLayout();
            }
        } else if (d.mode === "move") {
            moveGhostDrag(e.clientX, e.clientY, d.segIndex);
        }
    });

    tlTrack.addEventListener("pointerup", (e) => {
        const d = segDragState;
        if (!d || d.pointerId !== e.pointerId) return;
        segDragState = null;
        d.segEl.classList.remove("dragging");
        try { tlTrack.releasePointerCapture(e.pointerId); } catch {}
        if (!d.moved) {
            switchSegment(d.segIndex);
            return;
        }
        if (d.mode === "resize") {
            renderStoryboard();
            persist();
        } else if (d.mode === "move") {
            const target = computeDropIndex(e.clientX);
            clearGhostDrag();
            if (target !== null && target !== d.segIndex) commitReorder(d.segIndex, target);
        }
    });

    tlTrack.addEventListener("pointercancel", (e) => {
        const d = segDragState;
        if (!d || d.pointerId !== e.pointerId) return;
        segDragState = null;
        d.segEl.classList.remove("dragging");
        clearGhostDrag();
        renderStoryboard();
    });

    // ============ 【L2-b·缩放】滚轮缩放时间线 ============
    // 【关键】ComfyUI 在 window 捕获阶段监听 wheel 缩放画布。
    // 我们的监听必须同样挂 window 捕获阶段 + stopImmediatePropagation，
    // 才能抢在画布之前拦截事件。参照现有 capturePromptWheel 的模式。
    const storyboardWheelHandler = (e) => {
        // 只处理鼠标在故事板区域内的滚轮
        const path = e.composedPath?.() || [];
        if (!path.includes(storyboardBody) && !storyboardBody.contains(e.target)) return;
        // 段块拖动中不缩放，避免干扰
        if (segDragState) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        const oldZoom = getEffectiveZoom();
        const oldRect = tlTrack.getBoundingClientRect();
        const total = getTotalDuration();
        const mouseSec = Math.max(0, Math.min(total, (e.clientX - oldRect.left) / oldZoom));
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));
        if (Math.abs(newZoom - oldZoom) < 1e-6) return;
        timelineZoom = newZoom;
        const anchorClientX = e.clientX;
        renderStoryboard();
        // 缩放后恢复滚动位置：让 mouseSec 对应位置回到鼠标下
        requestAnimationFrame(() => {
            const bodyRect = storyboardBody.getBoundingClientRect();
            const mouseRelBody = anchorClientX - bodyRect.left;
            storyboardBody.scrollLeft = Math.max(0, mouseSec * newZoom - mouseRelBody);
        });
    };
    window.addEventListener("wheel", storyboardWheelHandler, { capture: true, passive: false });

    // ---- RefMod 列表拉取 + 渲染 ----
    let refmodCatalog = null;      // 后端返回的列表（缓存）
    let refmodCatalogError = null;

    async function fetchRefmodCatalog(force = false) {
        if (refmodCatalog && !force) return refmodCatalog;
        try {
            const data = await fetchJson(`${OPTIMIZER_ROUTE}/refmods`, { cache: "no-store" });
            refmodCatalog = Array.isArray(data?.refmods) ? data.refmods : [];
            refmodCatalogError = null;
        } catch (e) {
            refmodCatalog = [];
            refmodCatalogError = String(e?.message || e);
        }
        return refmodCatalog;
    }

    let currentSubView = "media";  // "media" | "refmod"

    // 【多段隔离】为 RefMod 保存独立的段数据
    let refmodSegments = [{ id: "seg-0", duration: 5, original: "", cache: null, history: [], imageIndices: null, viewState: null }];
    let activeRefmodSegmentIndex = 0;

    function setSubView(sub) {
        if (sub !== "media" && sub !== "refmod") sub = "media";
        if (viewMode === "video" && sub !== currentSubView) {
            // 1. 保存当前槽的编辑器内容
            const oldSlot = currentSlot();
            if (promptState === "original") modeState[oldSlot].original = editorText();
            modeState[oldSlot].cache = optimizerCache;
            
            // 【多段隔离】切换前，把当前段数据存回对应的数组
            if (currentSubView === "media") {
                segments[activeSegmentIndex] = { ...segments[activeSegmentIndex], original: modeState.media?.original || modeState.video.original, cache: optimizerCache };
            } else if (currentSubView === "refmod") {
                refmodSegments[activeRefmodSegmentIndex] = { ...refmodSegments[activeRefmodSegmentIndex], original: modeState.refmod.original, cache: optimizerCache };
            }

            // 2. 切换子 tab
            currentSubView = sub;
            
            // 3. 切换段数组
            if (currentSubView === "refmod") {
                segments = refmodSegments;
                activeSegmentIndex = activeRefmodSegmentIndex;
            } else {
                segments = modeState.video.segments || segments; // 这里为了兼容旧逻辑，暂时保留原来变量
                activeSegmentIndex = 0; 
            }

            // 4. 加载新槽的编辑器内容
            const newSlot = currentSlot();
            optimizerCache = modeState[newSlot].cache || null;
            promptState = optimizerCache?.result ? "optimized" : "original";
            prompt.value = promptState === "optimized"
                ? optimizerCache.result
                : (modeState[newSlot].original || "");
            if (typeof renderRich === "function") renderRich();
            if (typeof prompt.blur === "function") prompt.blur();
            if (typeof updateOptimizeButton === "function") updateOptimizeButton();
        } else {
            currentSubView = sub;
        }
        const isMedia = sub === "media";
        subTabMedia.classList.toggle("active", isMedia);
        subTabRefmod.classList.toggle("active", !isMedia);
        mediaSubPanel.classList.toggle("hidden", !isMedia);
        refmodSubPanel.classList.toggle("hidden", isMedia);
        // 两个子 tab 都显示 countRow（内容由 render 决定）
        countRow.style.display = "";
        // 参考模型子 tab 下隐藏故事板
        if (typeof renderStoryboard === "function") renderStoryboard();
        if (typeof refreshPromptPlaceholder === "function") refreshPromptPlaceholder();
        if (typeof render === "function") render();
        if (typeof persist === "function") persist();
    }

    subTabMedia.onclick = () => setSubView("media");
    subTabRefmod.onclick = () => setSubView("refmod");

    function refmodSlotsUsed() {
        return REFMOD_SLOTS.filter(s => media.has(s));
    }

    let refmodPickerSlot = null;
    function showRefmodPicker(slot, anchorEl) {
        const catalog = refmodCatalog || [];
        if (!catalog.length) return;
        refmodPickerSlot = slot;
        refmodPicker.replaceChildren();
        const groups = { video: [], picture: [], audio: [], bundle: [] };
        for (const item of catalog) {
            const k = String(item.kind || "video").toLowerCase();
            const bucket = k === "image" ? "picture" : (groups[k] ? k : "video");
            groups[bucket].push(item);
        }
        const groupLabels = { video: "Video", picture: "Picture", audio: "Audio", bundle: "Bundle" };
        const currentName = String(media.get(slot)?.name || "");
        for (const [bucket, list] of Object.entries(groups)) {
            if (!list.length) continue;
            const gl = make("div", {}, groupLabels[bucket]);
            gl.className = "ghupo-refmod-picker-group";
            refmodPicker.appendChild(gl);
            for (const item of list) {
                const row = make("div");
                row.className = "ghupo-refmod-picker-item" + (item.name === currentName ? " selected" : "");
                const kindName = String(item.kind || "video").toLowerCase() === "image" ? "picture" : String(item.kind || "video").toLowerCase();
                const kindEl = make("span", {}, kindName === "picture" ? "P" : kindName.charAt(0).toUpperCase());
                kindEl.className = `ghupo-refmod-picker-kind ${kindName}`;
                const nameEl = make("span", {}, item.display_name || item.name);
                nameEl.className = "ghupo-refmod-picker-name";
                row.append(kindEl, nameEl);
                row.onclick = (e) => {
                    e.stopPropagation();
                    const e2 = media.get(slot); if (!e2) return;
                    e2.name = item.name;
                    e2.displayName = item.display_name || item.name;
                    e2.refmodKind = String(item.kind || "video").toLowerCase();
                    e2.conceptType = item.concept_type || "generic";
                    e2.description = item.description || "";
                    if (!e2.components) e2.components = "All";
                    hideRefmodPicker();
                    persist(); renderRefmodSection();
                };
                refmodPicker.appendChild(row);
            }
        }
        const rect = anchorEl.getBoundingClientRect();
        refmodPicker.style.left = Math.max(4, rect.left) + "px";
        refmodPicker.style.top = (rect.bottom + 4) + "px";
        refmodPicker.style.display = "block";
    }
    function hideRefmodPicker() {
        refmodPicker.style.display = "none";
        refmodPickerSlot = null;
    }
    document.addEventListener("click", (e) => {
        if (refmodPicker.style.display !== "block") return;
        if (refmodPicker.contains(e.target)) return;
        hideRefmodPicker();
    }, true);

    function insertRefmodTag(slot) {
        const entry = media.get(slot);
        if (!entry || entry.kind !== "refmod") return;
        const kindRaw = String(entry.refmodKind || "video").toLowerCase();
        // bundle 暂不处理，等后续扩展
        if (kindRaw === "bundle") {
            alert("Bundle 类型 RefMod 暂不支持自动引用，请先在 Load H3 RefMods 节点里加载，或在 RefMod 里选择单 kind 文件。");
            return;
        }
        // 计算该 RefMod 在同 kind 组里的序号
        const sameKind = REFMOD_SLOTS.filter(s => {
            const e = media.get(s);
            return e && e.kind === "refmod" && String(e.refmodKind || "video").toLowerCase() === kindRaw;
        });
        const ordinal = sameKind.indexOf(slot) + 1;
        if (ordinal < 1) return;
        const word = kindRaw === "image" ? "Picture" : kindRaw === "video" ? "Video" : "Audio";
        const tagText = `<${word} ${ordinal}> `;
        const len = editorText().length;
        prompt.setRangeText(tagText, len, len);
        persist();
        renderRich();
    }

    function refreshPromptPlaceholder() {
        if (viewMode === "video" && currentSubView === "refmod") {
            prompt.dataset.placeholder = "输入 v1 / p1 / a1 / 模型1 快速引用 RefMod；点击卡片插入标签";
        } else {
            prompt.dataset.placeholder = t("Prompt: Type @ to reference uploaded media, e.g. @图片1, @video 1, @audio 1，图1，视频1，音频1，图一，video1，audio1，picture1，image1；你甚至还可以鼠标左键直接点击上面的素材进行快速选择引用！");
        }
    }

    function tryExpandShortRefmodTag() {
        // 只在"生视频 → 参考模型"子 tab 生效
        if (viewMode !== "video" || currentSubView !== "refmod") return false;
        const offsets = selectionOffsets();
        if (!offsets || offsets[0] !== offsets[1]) return false;  // 有选区不处理
        const caret = offsets[0];
        const text = editorText();
        const lookbackStart = Math.max(0, caret - 20);
        const before = text.slice(lookbackStart, caret);
        // 匹配：v/p/a/模型 + 数字，光标正好在数字后
        // 边界：前面不能是字母数字汉字（避免 hello1 触发）
        const m = before.match(/(^|[^a-zA-Z0-9_])(v|p|a|模型)\s*(\d+)$/i);
        if (!m) return false;
        const kindChar = String(m[2]).toLowerCase();
        const num = parseInt(m[3], 10);
        if (!Number.isFinite(num) || num < 1 || num > 8) return false;

        let kindWord = null;
        if (kindChar === "v") kindWord = "Video";
        else if (kindChar === "p") kindWord = "Picture";
        else if (kindChar === "a") kindWord = "Audio";
        else if (kindChar === "模型") {
            const used = refmodSlotsUsed();
            if (num > used.length) return false;
            const slot = used[num - 1];
            const e = media.get(slot);
            if (!e) return false;
            const k = String(e.refmodKind || "video").toLowerCase();
            kindWord = k === "image" ? "Picture" : k === "video" ? "Video" : k === "audio" ? "Audio" : null;
        }
        if (!kindWord) return false;

        // 校验：该 kind 组里必须有第 N 个 RefMod 存在
        const targetKind = kindWord === "Picture" ? "image" : kindWord.toLowerCase();
        const sameKind = refmodSlotsUsed().filter(s => {
            const e = media.get(s);
            return e && String(e.refmodKind || "video").toLowerCase() === targetKind;
        });
        if (num > sameKind.length) return false;

        // 执行替换
        const matchStart = lookbackStart + before.lastIndexOf(m[0]);
        const replacement = `<${kindWord} ${num}> `;
        prompt.setRangeText(replacement, matchStart, caret, "end");
        return true;
    }
    function refmodSlotsFree() {
        return REFMOD_SLOTS.filter(s => !media.has(s));
    }

    function renderRefmodSection() {
        refmodBody.replaceChildren();
        const catalog = refmodCatalog || [];
        const usedSlots = refmodSlotsUsed();

        // 空状态
        if (usedSlots.length === 0 && (!catalog || catalog.length === 0)) {
            const empty = make("div", {}, "models/refmods/ 下没有可用的 RefMod 文件");
            empty.className = "ghupo-refmod-empty";
            refmodBody.appendChild(empty);
            return;
        }

        const KIND_ICONS = { video: "🎬", picture: "🖼", image: "🖼", audio: "🎤", bundle: "📦" };

        for (const slot of usedSlots) {
            const entry = media.get(slot);
            const kindRaw = String(entry?.refmodKind || "video").toLowerCase();
            const kindCls = kindRaw === "image" ? "picture" : (["video","audio","bundle"].includes(kindRaw) ? kindRaw : "video");
            const icon = KIND_ICONS[kindRaw] || "🎬";

            const card = make("div"); card.className = "ghupo-refmod-card";
            card.dataset.slot = slot;

            // 中央图标
            const iconEl = make("div", {}, icon); iconEl.className = "ghupo-refmod-card-icon";
            card.appendChild(iconEl);

            // 名字（显示 + 隐藏 select 覆盖）
            const displayName = entry?.displayName || (entry?.name || "").split("/").pop() || entry?.name || "(未选)";
            const nameText = make("div", {}, displayName);
            nameText.className = "ghupo-refmod-card-name-text";
            nameText.title = entry?.name || "";
            nameText.style.cursor = "pointer";
            nameText.style.pointerEvents = "auto";
            nameText.onclick = (e) => {
                e.stopPropagation();
                showRefmodPicker(slot, nameText);
            };
            card.appendChild(nameText);

            const nameSel = document.createElement("select");
            nameSel.className = "ghupo-refmod-card-name-select";
            const groups = { video: [], picture: [], audio: [], bundle: [] };
            for (const item of catalog) {
                const k = String(item.kind || "video").toLowerCase();
                const bucket = k === "image" ? "picture" : (groups[k] ? k : "video");
                groups[bucket].push(item);
            }
            const groupLabels = { video: "Video", picture: "Picture", audio: "Audio", bundle: "Bundle" };
            for (const [bucket, list] of Object.entries(groups)) {
                if (!list.length) continue;
                const og = document.createElement("optgroup"); og.label = groupLabels[bucket];
                for (const item of list) {
                    og.append(new Option(`${item.display_name || item.name}  ·  ${item.kind}`, item.name));
                }
                nameSel.append(og);
            }
            const currentName = String(entry?.name || "");
            if (currentName && !catalog.some(x => x.name === currentName)) {
                nameSel.append(new Option(`${currentName} (已丢失)`, currentName));
            }
            nameSel.value = currentName;
            nameSel.onchange = () => {
                const next = catalog.find(x => x.name === nameSel.value);
                if (!next) return;
                const e2 = media.get(slot); if (!e2) return;
                e2.name = next.name;
                e2.displayName = next.display_name || next.name;
                e2.refmodKind = String(next.kind || "video").toLowerCase();
                e2.conceptType = next.concept_type || "generic";
                e2.description = next.description || "";
                if (!e2.components) e2.components = "All";
                persist(); renderRefmodSection();
            };
            card.appendChild(nameSel);

            // 左上 copies
            const cpGroup = make("div"); cpGroup.className = "ghupo-refmod-card-copies-group";
            const cpInput = make("input"); cpInput.type = "number";
            cpInput.className = "ghupo-refmod-card-copies";
            cpInput.min = "1"; cpInput.max = "10"; cpInput.step = "1";
            cpInput.value = String(Number.isFinite(Number(entry?.copies)) ? Math.max(1, Math.min(10, Math.round(Number(entry.copies)))) : 1);
            cpInput.title = "副本份数：同一 RefMod 重复注入，2+ 可增强参考权重（消耗更多 token）";
            const cpUnit = make("span", {}, "×"); cpUnit.className = "ghupo-refmod-card-copies-unit";
            cpGroup.append(cpInput, cpUnit);
            cpInput.onchange = () => {
                const e2 = media.get(slot); if (!e2) return;
                let v = parseInt(cpInput.value, 10);
                if (!Number.isFinite(v)) v = 1;
                v = Math.max(1, Math.min(10, v));
                e2.copies = v;
                cpInput.value = String(v);
                persist();
            };
            cpInput.addEventListener("click", e => e.stopPropagation());
            cpInput.addEventListener("pointerdown", e => e.stopPropagation());
            card.appendChild(cpGroup);

            // 右上 强度
            const strGroup = make("div"); strGroup.className = "ghupo-refmod-card-strength";
            const strDec = make("button", {}, "−"); strDec.className = "ghupo-refmod-card-str-dec";
            const strInput = make("input"); strInput.type = "number";
            strInput.className = "ghupo-refmod-card-str-input";
            strInput.min = "0"; strInput.max = "1"; strInput.step = "0.05";
            strInput.value = Number.isFinite(Number(entry?.strength)) ? Number(entry.strength).toFixed(2) : "1.00";
            const strInc = make("button", {}, "+"); strInc.className = "ghupo-refmod-card-str-inc";
            strGroup.append(strDec, strInput, strInc);
            const writeStrength = (v) => {
                const e2 = media.get(slot); if (!e2) return;
                let val = Number(v);
                if (!Number.isFinite(val)) val = 1.0;
                val = Math.max(0, Math.min(1, Math.round(val * 20) / 20));
                e2.strength = val;
                strInput.value = val.toFixed(2);
                persist();
            };
            strDec.onclick = (e) => { e.stopPropagation(); e.preventDefault(); writeStrength((Number(media.get(slot)?.strength) || 1.0) - 0.05); };
            strInc.onclick = (e) => { e.stopPropagation(); e.preventDefault(); writeStrength((Number(media.get(slot)?.strength) || 1.0) + 0.05); };
            strInput.onchange = () => writeStrength(strInput.value);
            strInput.addEventListener("click", e => e.stopPropagation());
            let strDrag = null;
            strInput.addEventListener("pointerdown", (e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                strDrag = { startX: e.clientX, startVal: Number(media.get(slot)?.strength) || 1.0, dragging: false, id: e.pointerId };
                try { strInput.setPointerCapture(e.pointerId); } catch {}
            });
            strInput.addEventListener("pointermove", (e) => {
                const s = strDrag; if (!s || s.id !== e.pointerId) return;
                const dx = e.clientX - s.startX;
                if (!s.dragging && Math.abs(dx) > 4) { s.dragging = true; strInput.blur(); }
                if (s.dragging) {
                    e.preventDefault();
                    const next = Math.round((s.startVal + dx / 8 * 0.1) * 20) / 20;
                    strInput.value = Math.max(0, Math.min(1, next)).toFixed(2);
                }
            });
            const endStrDrag = (e) => {
                const s = strDrag; if (!s) return;
                try { strInput.releasePointerCapture?.(s.id); } catch {}
                if (s.dragging) writeStrength(strInput.value);
                strDrag = null;
            };
            strInput.addEventListener("pointerup", endStrDrag);
            strInput.addEventListener("pointercancel", endStrDrag);
            card.appendChild(strGroup);

            // 左下 kind 徽章
            const badge = make("span", {}, kindRaw === "image" ? "Picture" : kindRaw.charAt(0).toUpperCase() + kindRaw.slice(1));
            badge.className = `ghupo-refmod-card-kind ${kindCls}`;
            card.appendChild(badge);

            // 右下 删除
            const del = make("button", {}, "×"); del.className = "ghupo-refmod-card-del";
            del.title = "删除此 RefMod";
            del.onclick = (e) => {
                e.stopPropagation(); e.preventDefault();
                media.delete(slot);
                persist(); renderRefmodSection();
            };
            del.addEventListener("pointerdown", e => e.stopPropagation());
            card.appendChild(del);

            // 卡片点击 → 插入标签（名字 select / 强度 / copies / 删除 已 stopPropagation）
            card.onclick = (e) => {
                // 如果点击的是 select/input/button 则忽略（保险）
                if (e.target.closest("select, input, button")) return;
                insertRefmodTag(slot);
            };

            refmodBody.appendChild(card);
        }

        // 添加按钮（未满 8 个时显示）
        const free = refmodSlotsFree();
        if (free.length > 0) {
            const addCard = make("div"); addCard.className = "ghupo-refmod-add-card";
            const addIcon = make("div", {}, "＋"); addIcon.className = "icon";
            const addTitle = make("div", {}, "添加 RefMod"); addTitle.className = "title";
            addCard.append(addIcon, addTitle);
            addCard.onclick = async (e) => {
                e.stopPropagation(); e.preventDefault();
                await fetchRefmodCatalog(true);
                const freeNow = refmodSlotsFree();
                if (!freeNow.length) return;
                const slot = freeNow[0];
                const catalogNow = refmodCatalog || [];
                if (!catalogNow.length) {
                    alert(refmodCatalogError
                        ? `无法加载 RefMod 列表：${refmodCatalogError}`
                        : "models/refmods/ 下没有可用的 RefMod 文件");
                    return;
                }
                const first = catalogNow[0];
                media.set(slot, {
                    kind: "refmod",
                    name: first.name,
                    displayName: first.display_name || first.name,
                    refmodKind: String(first.kind || "video").toLowerCase(),
                    conceptType: first.concept_type || "generic",
                    description: first.description || "",
                    strength: 1.0,
                    copies: 1,
                    components: "All",
                });
                persist(); renderRefmodSection();
            };
            refmodBody.appendChild(addCard);
        }
    }

    const render = () => {
        // 更新横幅计数：从 media 里统计各类型数量。
        // 图片上限 9、视频上限 3、音频上限 3，跟素材格容量一致。
        let imgCount = 0, vidCount = 0, audCount = 0;
        for (const [, entry] of media) {
            if (!entry) continue;
            if (entry.kind === "image") imgCount++;
            else if (entry.kind === "video") vidCount++;
            else if (entry.kind === "audio") audCount++;
        }
        // 参考模型子 tab：显示 Mod 计数
        if (viewMode === "video" && currentSubView === "refmod") {
            const modCount = REFMOD_SLOTS.filter(s => media.has(s)).length;
            bannerCount.textContent = isChineseLocale()
                ? `已添加 Mod: ${modCount}/8`
                : `RefMods: ${modCount}/8`;
        } else if (viewMode === "image") {
            bannerCount.textContent = isChineseLocale()
                ? `图片 ${imgCount}/9`
                : `Image ${imgCount}/9`;
        } else {
            bannerCount.textContent = isChineseLocale()
                ? `图片 ${imgCount}/9 · 视频 ${vidCount}/3 · 音频 ${audCount}/3`
                : `Image ${imgCount}/9 · Video ${vidCount}/3 · Audio ${audCount}/3`;
        }

        mediaGrid.replaceChildren();
        const entries = [...media.entries()]
            .filter(([slot, e]) => e && e.kind !== "refmod")
            .sort((a, b) => {
                const order = { image: 0, video: 1, audio: 2 };
                return (order[a[1].kind] || 9) - (order[b[1].kind] || 9) || a[0].localeCompare(b[0]);
            });
        if (!entries.length) mediaGrid.appendChild(addDrop());
        else {
            for (const [slot, entry] of entries) mediaGrid.appendChild(card(slot, entry));
            mediaGrid.appendChild(addDrop());
        }
    };

    // ---- 上传逻辑 ----
    const nextSlot = kind => {
        const slots = kind === "image" ? IMAGE_SLOTS : kind === "video" ? VIDEO_SLOTS : AUDIO_SLOTS;
        return slots.find(s => !media.has(s));
    };
    const accept = async (files, preferredSlot) => {
        // 用户主动上传 = 恢复流程结束，解除保护。
        if (restoringState) restoringState = false;
        let lastKind = null;
        for (const file of files || []) {
            const kind = kindOf(file); if (!kind) continue;
            const slot = preferredSlot || nextSlot(kind);
            if (!slot) {
                alert(kind === "image" ? t("Up to 9 images") : kind === "video" ? t("Up to 3 videos") : t("Up to 3 audios"));
                continue;
            }
            try {
                const name = await uploadFile(file);
                media.set(slot, { name, kind, weight: 1.0 });
                const w = widget(node, slot); if (w) w.value = name;
                lastKind = kind;
            } catch (e) { console.error("[UPO] upload failed", e); }
            preferredSlot = null;
        }
        if (lastKind) {
            persist();
            try { renderRich(); } catch (err) { console.error("[GH] renderRich 失败:", err); }
            try { render(); } catch (err) { console.error("[GH] render 失败:", err); }
        }
    };

    window.addEventListener("paste", event => {
        if (document.activeElement === prompt) return;
        const files = [];
        for (const item of event.clipboardData?.items || []) {
            if (item.kind !== "file") continue;
            const f = item.getAsFile();
            if (f && kindOf(f)) files.push(f);
        }
        if (files.length) { event.preventDefault(); accept(files, null); }
    }, true);

    window.addEventListener("dragover", e => {
        if (!e.dataTransfer?.types?.includes?.("Files")) return;
        const path = e.composedPath?.() || [];
        if (path.includes(root)) e.preventDefault();
    }, true);
    window.addEventListener("drop", e => {
        const path = e.composedPath?.() || [];
        if (!path.includes(root)) return;
        if (!e.dataTransfer?.types?.includes?.("Files")) return;
        e.preventDefault(); e.stopImmediatePropagation();
        accept(e.dataTransfer.files, null);
    }, true);

    // ---- 优化功能 ----
    let optimizing = false;
    let optimizerAbort = null;
    // 【L2-d】自动优化流程状态
    let autoOptimizeRunning = false;
    let autoOptimizeCancelled = false;
    let optimizerRequestId = null;
    let optimizerTimer = null;
    let optimizerSettings = null;
    let optimizerBefore = null;
    // 上一次优化的缓存：只要上下文与原文都没变，再次点 ✦ 就直接复用结果，
    // 不再重复调用后端，从而支持"原文 ↔ 优化稿"快速来回对比。
    let optimizerCache = null; // 当前模式的活动缓存（= modeState[currentSlot()].cache）
    let promptState = "original"; // "original" | "optimized"
    // 【双模式·三槽】video / image / refmod 各自独立保存大白话原文与优化缓存
    const modeState = {
        video: { original: "", cache: null, history: [] },
        image: { original: "", cache: null, history: [] },
        refmod: { original: "", cache: null, history: [] }
    };
    // 【RefMod 独立槽】视频 tab 下的"参考模型"子 tab 走独立状态，避免污染参考素材
    function currentSlot() {
        if (viewMode === "video" && currentSubView === "refmod") return "refmod";
        return viewMode;
    }
    // 【L2-b】分段数据模型：每段 = 一个"迷你万能节点"
    // - original: 该段大白话（用户手写）
    // - cache: 该段优化缓存 {signature, originalPrompt, result}
    // - history: 该段 3 版历史，与 modeState.video.history 同结构
    // - imageIndices: null = 用全部；数组 = 0-based；永不 []
    // 镜像机制：modeState.video 永远是"当前激活段的镜像"。
    // 切换段时"先回写、再加载"，现有优化流程一行不用改。
    let segments = [{ id: "seg-0", duration: 5, original: "", cache: null, history: [], imageIndices: null, viewState: null, media: {} }];
    let activeSegmentIndex = 0;

    // ---- 镜像同步：把 modeState.video / optimizerCache 的状态回写进当前段 ----
    function syncMirrorToSegment() {
        if (viewMode !== "video") return;
        const seg = segments[activeSegmentIndex];
        if (!seg) return;
        seg.original = modeState.video.original || "";
        seg.cache = modeState.video.cache || null;
        seg.history = modeState.video.history || [];
        // 【L2-d】保存离开时的视图状态，切回时恢复
        seg.viewState = promptState;
    }

    // ---- 【L2-c】从文本提取图片索引（0-based，去重排序）----
    function extractImageIndicesFromText(text) {
        if (!text) return null;
        const indices = [];
        const seen = new Set();
        for (const m of mediaMatches(String(text))) {
            if (m.type === "picture") {
                const idx = Number(m.ordinal) - 1;
                if (!seen.has(idx)) { seen.add(idx); indices.push(idx); }
            }
        }
        return indices.length ? indices.sort((a, b) => a - b) : null;
    }

    // ---- 【L2-c】从一段提取 imageIndices：大白话优先，优化稿兜底 ----
    function extractSegmentImageIndices(seg) {
        if (!seg) return null;
        const fromOriginal = extractImageIndicesFromText(seg.original || "");
        if (fromOriginal) return fromOriginal;
        const fromOptimized = extractImageIndicesFromText(seg.cache?.result || "");
        if (fromOptimized) return fromOptimized;
        return null;
    }

    // ---- 镜像同步：把某段的状态加载进 modeState.video / optimizerCache ----
    function syncSegmentToMirror(index) {
        if (viewMode !== "video") return;
        const seg = segments[index];
        if (!seg) return;
        modeState.video.original = seg.original || "";
        modeState.video.cache = seg.cache || null;
        modeState.video.history = Array.isArray(seg.history) ? seg.history : [];
        optimizerCache = seg.cache || null;
        // 【L2-d】优先恢复用户离开时的视图状态；没有则按缓存是否存在决定
        const saved = seg.viewState;
        if (saved === "original" || saved === "optimized") {
            promptState = saved;
            // 如果 saved=optimized 但没缓存，降级到 original
            if (promptState === "optimized" && !optimizerCache?.result) {
                promptState = "original";
            }
        } else {
            promptState = (optimizerCache?.result) ? "optimized" : "original";
        }
    }

    // ---- 切换激活段：先回写、再加载、然后刷新 UI ----
    function switchSegment(index) {
        if (viewMode !== "video") return;
        if (index === activeSegmentIndex) return;
        if (index < 0 || index >= segments.length) return;
        if (optimizerAbort) { try { optimizerAbort.abort(); } catch {} }
        
        // 1. 回写当前段（包括把 media Map 存进当前段）
        if (promptState === "original") modeState.video.original = editorText();
        modeState.video.cache = optimizerCache;
        syncMirrorToSegment();
        
        // 【核心】保存当前段的素材池！
        segments[activeSegmentIndex].media = Object.fromEntries(media.entries());

        // 2. 切换索引
        activeSegmentIndex = index;
        
        // 【核心】加载新段的素材池！
        media.clear();
        const newMediaObj = segments[index].media || {};
        for (const [k, v] of Object.entries(newMediaObj)) {
            media.set(k, v);
        }
        // 同步隐藏的 widget
        for (const slot of ALL_SLOTS) {
            const w = widget(node, slot);
            if (w) w.value = media.get(slot)?.name || "";
        }
        render(); // 重绘素材区
        
        syncSegmentToMirror(index);
        // 2. 切换索引 + 加载新段
        activeSegmentIndex = index;
        syncSegmentToMirror(index);
        // 3. 刷新编辑器与 UI
        prompt.value = promptState === "optimized"
            ? (optimizerCache?.result || "")
            : (modeState.video.original || "");
        renderRich();
        prompt.blur();
        prompt.scrollTop = 0;
        if (segments[activeSegmentIndex]) setDuration(segments[activeSegmentIndex].duration, false);
        updateOptimizeButton();
        renderStoryboard();
        persist();
    }

    // ---- 【L2-d】自动优化所有段 ----
    // 遍历 segments，对每段大白话非空的段依次调 runOptimization。
    // 静音 alert：失败通过返回值收集，不打断流程。
    async function autoOptimizeAllSegments() {
        const result = { total: 0, succeeded: 0, failed: [] };
        if (viewMode !== "video") return result;
        // 先回写当前段
        if (promptState === "original") modeState.video.original = editorText();
        modeState.video.cache = optimizerCache;
        syncMirrorToSegment();
        // 找出需要优化的段（大白话非空）
        const needOptimize = [];
        segments.forEach((seg, i) => {
            if (seg.original && String(seg.original).trim()) needOptimize.push(i);
        });
        result.total = needOptimize.length;
        if (!needOptimize.length) return result;
        autoOptimizeCancelled = false;
        autoOptimizeRunning = true;
        const originalIndex = activeSegmentIndex;
        // 静音 alert：自动流程失败通过 result 收集
        const originalAlert = window.alert;
        window.alert = () => {};
        try {
            for (let k = 0; k < needOptimize.length; k++) {
                if (autoOptimizeCancelled) break;
                const idx = needOptimize[k];
                switchSegment(idx);
                // 进度显示
                elapsed.classList.add("visible");
                elapsed.textContent = `优化中 ${k + 1}/${needOptimize.length}`;
                showProgress(needOptimize.length, k + 1, `提示词优化中 ${k + 1}/${needOptimize.length}`);
                if (node.title && !node.title.startsWith("[")) {
                    node.__ghupoOrigTitle = node.title;
                }
                node.title = `[${k + 1}/${needOptimize.length}] ${node.__ghupoOrigTitle || "万能模型提示词优化"}`;
                node.setDirtyCanvas?.(true, true);
                try {
                    const ok = await runOptimization();
                    if (ok) result.succeeded += 1;
                    else if (autoOptimizeCancelled) break;
                    else result.failed.push({ index: idx, error: "优化失败" });
                } catch (err) {
                    if (autoOptimizeCancelled) break;
                    result.failed.push({ index: idx, error: String(err?.message || err) });
                }
            }
        } finally {
            window.alert = originalAlert;
            autoOptimizeRunning = false;
            // 恢复标题
            if (node.__ghupoOrigTitle) {
                node.title = node.__ghupoOrigTitle;
                node.__ghupoOrigTitle = null;
            }
            elapsed.classList.remove("visible");
            elapsed.textContent = "";
            // 【进度条】全部完成 → 100% 后停留，再隐藏
            progressFill1.style.width = "100%";
            progressVal1.textContent = `${needOptimize.length}/${needOptimize.length}`;
            progressFill2.style.width = "100%";
            progressVal2.textContent = "完成";
            setTimeout(() => hideProgress(), 800);
            node.setDirtyCanvas?.(true, true);
            // 切回原段
            if (activeSegmentIndex !== originalIndex) switchSegment(originalIndex);
        }
        return result;
    }

    // ---- 新增段：在当前段后面插入 ----
    function addSegment() {
        if (viewMode !== "video") return;
        // 先回写当前段
        if (promptState === "original") modeState.video.original = editorText();
        modeState.video.cache = optimizerCache;
        syncMirrorToSegment();
        const newSeg = { id: `seg-${Date.now()}`, duration: 5, original: "", cache: null, history: [], imageIndices: null, viewState: null, media: {} };
        const insertAt = activeSegmentIndex + 1;
        segments.splice(insertAt, 0, newSeg);
        switchSegment(insertAt);
    }

    // ---- 删除段：至少保留 1 段 ----
    function removeSegment(index) {
        if (viewMode !== "video") return;
        if (segments.length <= 1) return;
        if (index < 0 || index >= segments.length) return;
        // 先回写当前段
        if (promptState === "original") modeState.video.original = editorText();
        modeState.video.cache = optimizerCache;
        syncMirrorToSegment();
        segments.splice(index, 1);
        // 修正 activeSegmentIndex
        if (activeSegmentIndex >= segments.length) activeSegmentIndex = segments.length - 1;
        else if (activeSegmentIndex > index) activeSegmentIndex -= 1;
        // 重新加载当前段
        syncSegmentToMirror(activeSegmentIndex);
        prompt.value = promptState === "optimized"
            ? (optimizerCache?.result || "")
            : (modeState.video.original || "");
        renderRich();
        prompt.blur();
        prompt.scrollTop = 0;
        if (segments[activeSegmentIndex]) setDuration(segments[activeSegmentIndex].duration, false);
        updateOptimizeButton();
        renderStoryboard();
        persist();
    }

    // 调试入口（B-1 阶段验证用）
    if (typeof window !== "undefined") {
        window.__ghupo = window.__ghupo || {};
        window.__ghupo.segments = () => segments;
        window.__ghupo.switchSegment = switchSegment;
        window.__ghupo.addSegment = addSegment;
        window.__ghupo.removeSegment = removeSegment;
    }
    const DONE_SOUND = new Audio(DONE_SOUND_URL);
    DONE_SOUND.preload = "auto";
    // 浏览器要求音频首次播放必须由"用户手势"触发。
    // 优化耗时较长时，点击按钮那一下的手势窗口早已过期，异步完成后再
    // 调 play() 会被静默拦截。解法是：用户点击的瞬间先静音播一次，
    // 把这个 Audio 对象"解锁"，之后异步播放才能真的出声。
    let doneSoundUnlocked = false;
    const unlockDoneSound = () => {
        if (doneSoundUnlocked) return;
        doneSoundUnlocked = true;
        try {
            DONE_SOUND.volume = 0;
            const p = DONE_SOUND.play();
            if (p && typeof p.then === "function") {
                p.then(() => { DONE_SOUND.pause(); DONE_SOUND.currentTime = 0; DONE_SOUND.volume = 0.6; })
                 .catch(() => { DONE_SOUND.volume = 0.6; });
            } else {
                DONE_SOUND.pause(); DONE_SOUND.currentTime = 0; DONE_SOUND.volume = 0.6;
            }
        } catch { DONE_SOUND.volume = 0.6; }
    };
    const playDoneSound = () => {
        try {
            DONE_SOUND.currentTime = 0;
            DONE_SOUND.volume = 0.6;
            DONE_SOUND.play().catch(() => {});
        } catch {}
    };

    async function fetchJson(path, options = {}, retryEmpty = true) {
        const r = await api.fetchApi(path, options);
        const text = await r.text();
        if (!text.trim() && retryEmpty) {
            await new Promise(res => setTimeout(res, 120));
            return fetchJson(`${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`, options, false);
        }
        let data; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`HTTP ${r.status}`); }
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
    }

    async function loadSettings() {
        if (optimizerSettings) return optimizerSettings;
        // 顺序：localStorage → properties → widget.state.optimizer → 后端默认值。
        // localStorage 是主存储，不受 ComfyUI 序列化/恢复时机的影响。
        const fromLS = loadConfigFromLocalStorage();
        if (fromLS) { optimizerSettings = fromLS; return optimizerSettings; }
        const local = loadOptimizerConfigFromNode();
        if (local) { optimizerSettings = local; return optimizerSettings; }
        const stateWidget = widget(node, "gh_state_json");
        if (stateWidget?.value) {
            try {
                const s = JSON.parse(stateWidget.value);
                if (s?.optimizer && typeof s.optimizer === "object" && typeof s.optimizer.mode === "string" && s.optimizer.mode) {
                    optimizerSettings = s.optimizer;
                    return optimizerSettings;
                }
            } catch {}
        }
        try { optimizerSettings = await fetchJson(`${OPTIMIZER_ROUTE}/config`, { cache: "no-store" }); }
        catch (e) { throw new Error(t("Unable to load prompt optimizer settings") + ": " + e.message); }
        return optimizerSettings;
    }

    // 【双模式】图片模式固定用 image 模板，视频模式用下拉选择的值
    const effectiveTemplate = () => (viewMode === "image" ? "image" : templateSelect.value);
    const effectiveDuration = () => (viewMode === "image" ? null : readDuration());
    // 【修复】归一化 signature：去尾部斜杠、强制类型，避免不同恢复路径导致字段类型漂移
    const computeContextSignature = specs => {
        const s = optimizerSettings || {};
        const norm = (v, d = "") => String(v ?? d);
        const normUrl = u => String(u || "").trim().replace(/\/+$/, "");
        return JSON.stringify({
            template: norm(effectiveTemplate()),
            duration: Number(effectiveDuration()) || 0,
            media: specs.map(x => [
                x.slot, x.kind,
                norm(media.get(x.slot)?.name),
                Number(media.get(x.slot)?.weight) || 1.0,
            ]),
            settings: [
                norm(s.mode),
                norm(s.provider),
                normUrl(s.api_url),
                norm(s.model),
                norm(s.protocol),
                norm(s.local_model),
                norm(s.local_mmproj),
                norm(s.local_device),
                !!s.read_media,
                norm(s.output_language, "中文"),
            ],
        });
    };

    const updateOptimizeButton = () => {
        // console.error("[BUTTON]", "promptState=", promptState, "hasCache=", !!optimizerCache?.result);
        const cache = optimizerCache;
        if (!cache?.result) {
            resetBtn.style.display = "none";
            optBtn.style.display = "inline-block";
            return;
        }
        if (promptState === "optimized") {
            resetBtn.style.display = "inline-block";
            optBtn.style.display = "none";
        } else {
            resetBtn.style.display = "none";
            optBtn.style.display = "inline-block";
        }
    };


    // ---- 双模式切换 ----
    const setViewMode = (mode) => {
        if (viewMode === mode) return;

        // 1. 保存当前槽的大白话与缓存
        const oldSlot = currentSlot();
        if (promptState === "original") {
            modeState[oldSlot].original = editorText();
        }
        modeState[oldSlot].cache = optimizerCache;

        // 2. 切换模式（切到生图时子 tab 回到 media；切回视频时恢复上次子 tab）
        viewMode = mode;
        if (mode === "image") currentSubView = "media";
        const newSlot = currentSlot();
        promptState = "original";
        optimizerCache = modeState[newSlot].cache || null;

        // 3. 加载新槽大白话（失焦 + 滚动置顶，符合认知习惯）
        prompt.value = modeState[newSlot].original || "";
        renderRich();
        prompt.blur();
        prompt.scrollTop = 0;

        // 4. UI 骨架
        videoTab.classList.toggle("active", mode === "video");
        if (imageTab) imageTab.classList.toggle("active", mode === "image");
        if (mode === "image") {
            subTabsRow.style.display = "none";
            countRow.style.display = "";
            mediaSubPanel.classList.remove("hidden");
            refmodSubPanel.classList.add("hidden");
        } else {
            subTabsRow.style.display = "";
            setSubView(currentSubView);
        }
        setSizeWidgetsVisible(mode === "image");
        durationGroup.style.display = (mode === "image") ? "none" : "";
        templateSelect.style.display = (mode === "image") ? "none" : "";
        rebuildTemplateSelect();
        updateModelName();
        updateOptimizeButton();
        render();
        renderStoryboard();
        if (typeof refreshPromptPlaceholder === "function") refreshPromptPlaceholder();
        persist();
    };
    // 初始化：按当前模式应用时长控件可见性
    durationGroup.style.display = (viewMode === "image") ? "none" : "";
    // 初始化：按当前模式应用一次
    setSizeWidgetsVisible(viewMode === "image");
    templateSelect.style.display = (viewMode === "image") ? "none" : "";
    rebuildTemplateSelect();
    videoTab.onclick = () => setViewMode("video");
    // 【Max专属】 imageTab.onclick = () => setViewMode("image");

    // ---- 参考素材读取：把上传的图片/视频转成后端能看懂的 base64 ----
    // 与后端 prompt_optimizer._user_parts 的 image_url 结构对应。
    // 不传图片的话，模型只能"读到标签名"，看不到画面内容，就会瞎编动作。
    function lowImageData(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
                const canvasEl = document.createElement("canvas");
                canvasEl.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvasEl.height = Math.max(1, Math.round(image.naturalHeight * scale));
                canvasEl.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvasEl.width, canvasEl.height);
                resolve(canvasEl.toDataURL("image/jpeg", .42));
            };
            image.onerror = () => reject(new Error("Unable to read reference image"));
            image.src = url;
        });
    }

    function lowVideoFrames(url) {
        return new Promise((resolve, reject) => {
            const video = document.createElement("video");
            video.crossOrigin = "anonymous"; video.muted = true; video.preload = "metadata";
            video.onloadedmetadata = async () => {
                try {
                    const duration = Number.isFinite(video.duration) ? video.duration : 0;
                    const times = duration > 0 ? [0, duration / 2, Math.max(0, duration - .04)] : [0];
                    const frames = [];
                    for (const time of times) {
                        const target = Math.min(time, Math.max(0, duration - .001));
                        if (video.readyState < 2 || Math.abs(video.currentTime - target) > .002) {
                            await new Promise((done, fail) => {
                                const timeout = setTimeout(() => fail(new Error("Video frame seek timed out")), 10000);
                                video.onseeked = () => { clearTimeout(timeout); done(); };
                                video.currentTime = target;
                            });
                        }
                        const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
                        const canvasEl = document.createElement("canvas");
                        canvasEl.width = Math.max(1, Math.round(video.videoWidth * scale));
                        canvasEl.height = Math.max(1, Math.round(video.videoHeight * scale));
                        canvasEl.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
                        frames.push(canvasEl.toDataURL("image/jpeg", .42));
                    }
                    resolve(frames);
                } catch (e) { reject(e); }
            };
            video.onerror = () => reject(new Error("Unable to read reference video"));
            video.src = url;
        });
    }

    // 把 specs（label/kind/slot）组装成后端要的 media 数组：
    // 图片 → 单张低清 jpg；视频 → 首中尾三帧；音频 → 仅标签。
    async function buildOptimizerMedia(specs, readMedia) {
        const payload = [];
        for (const spec of specs) {
            const entry = media.get(spec.slot);
            if (!entry) continue;
            const item = { label: spec.label, kind: spec.kind };
            if (readMedia && spec.kind === "image" && entry.name) {
                try { item.images = [await lowImageData(fileUrl(entry.name))]; }
                catch (e) { console.warn("[UPO] image read failed", e); }
            } else if (readMedia && spec.kind === "video" && entry.name) {
                // 【方案A】视频不抽帧给 LLM，只传"这是视频参考"的标记
                // 避免 LLM 把视频帧当成额外 Picture，污染 Picture 编号
                item.is_video_reference = true;
            }
            payload.push(item);
        }
        return payload;
    }

    // ---- 参考素材读取：把上传的图片/视频转成后端能看懂的 base64 ----
    function lowImageData(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
                const canvasEl = document.createElement("canvas");
                canvasEl.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvasEl.height = Math.max(1, Math.round(image.naturalHeight * scale));
                canvasEl.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvasEl.width, canvasEl.height);
                resolve(canvasEl.toDataURL("image/jpeg", .42));
            };
            image.onerror = () => reject(new Error("Unable to read reference image"));
            image.src = url;
        });
    }

    function lowVideoFrames(url) {
        return new Promise((resolve, reject) => {
            const video = document.createElement("video");
            video.crossOrigin = "anonymous"; video.muted = true; video.preload = "metadata";
            video.onloadedmetadata = async () => {
                try {
                    const duration = Number.isFinite(video.duration) ? video.duration : 0;
                    const times = duration > 0 ? [0, duration / 2, Math.max(0, duration - .04)] : [0];
                    const frames = [];
                    for (const time of times) {
                        const target = Math.min(time, Math.max(0, duration - .001));
                        if (video.readyState < 2 || Math.abs(video.currentTime - target) > .002) {
                            await new Promise((done, fail) => {
                                const timeout = setTimeout(() => fail(new Error("Video frame seek timed out")), 10000);
                                video.onseeked = () => { clearTimeout(timeout); done(); };
                                video.currentTime = target;
                            });
                        }
                        const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
                        const canvasEl = document.createElement("canvas");
                        canvasEl.width = Math.max(1, Math.round(video.videoWidth * scale));
                        canvasEl.height = Math.max(1, Math.round(video.videoHeight * scale));
                        canvasEl.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
                        frames.push(canvasEl.toDataURL("image/jpeg", .42));
                    }
                    resolve(frames);
                } catch (e) { reject(e); }
            };
            video.onerror = () => reject(new Error("Unable to read reference video"));
            video.src = url;
        });
    }

    async function buildOptimizerMedia(specs, readMedia) {
        const payload = [];
        for (const spec of specs) {
            const entry = media.get(spec.slot);
            if (!entry) continue;
            const item = { label: spec.label, kind: spec.kind };
            if (readMedia && spec.kind === "image" && entry.name) {
                try { item.images = [await lowImageData(fileUrl(entry.name))]; }
                catch (e) { console.warn("[UPO] image read failed", e); }
            } else if (readMedia && spec.kind === "video" && entry.name) {
                // 【方案A】视频不抽帧给 LLM，只传"这是视频参考"的标记
                // 避免 LLM 把视频帧当成额外 Picture，污染 Picture 编号
                item.is_video_reference = true;
            }
            payload.push(item);
        }
        return payload;
    }


    async function runOptimization() {
        if (optimizing) return false;
        // 【修复】提前加载 optimizerSettings，避免首次运行时 signature 用了 null settings
        if (!optimizerSettings) {
            try { await loadSettings(); } catch {}
        }
        const before = editorText();
        if (!before.trim()) {
            alert(t("提示词不能为空，请先输入内容再点击优化"));
            return false;
        }
        if (!before.trim()) {
            alert(t("输入为空！"));
            return false;
        }
        // 【只传被引用的素材】从大白话里解析用户实际引用了哪些图N/视频N/音频N，
        // 只把这些槽位传给后端，避免 subject_definitions 被未引用的素材污染。
        // 如果用户什么都没引用（纯文本提示词），回退到"全部素材"的旧行为。
        const isRefmodView = (currentSubView === "refmod");
        const referencedSlots = new Set();
        const refmodRefs = [];
        for (const m of mediaMatches(before)) {
            if (m.type.startsWith("refmod-")) {
                const kindSuffix = m.type.slice(7); // "picture" | "video" | "audio"
                const refmodKind = kindSuffix === "picture" ? "image" : kindSuffix;
                const sameKind = REFMOD_SLOTS.filter(s => {
                    const e = media.get(s);
                    return e && e.kind === "refmod" && String(e.refmodKind || "video").toLowerCase() === refmodKind;
                });
                const slot = sameKind[m.ordinal - 1];
                if (slot && media.has(slot)) {
                    const word = kindSuffix === "picture" ? "Picture" : kindSuffix === "video" ? "Video" : "Audio";
                    refmodRefs.push({ slot, kind: "refmod", label: `<${word} ${m.ordinal}>`, refmodKind });
                }
                continue;
            }
            const list = m.type === "picture" ? IMAGE_SLOTS : m.type === "video" ? VIDEO_SLOTS : AUDIO_SLOTS;
            const slot = list[m.ordinal - 1];
            if (slot && media.has(slot)) referencedSlots.add(slot);
        }
        const useAllSlots = (referencedSlots.size === 0) && !isRefmodView;
        // 【权重】把每张素材的 weight 塞进 label，供后端 LLM 做注意力分配
        const weightSuffix = (slot) => {
            const w = Number(media.get(slot)?.weight);
            return Number.isFinite(w) ? ` weight=${w.toFixed(1)}` : "";
        };
        const specs = [];
        if (isRefmodView) {
            for (const r of refmodRefs) specs.push({ slot: r.slot, kind: "refmod", label: r.label });
        } else {
            for (let i = 0; i < IMAGE_SLOTS.length; i++) {
                const slot = IMAGE_SLOTS[i];
                if (media.has(slot) && (useAllSlots || referencedSlots.has(slot))) {
                    specs.push({ slot, kind: "image", label: `<picture ${i + 1}${weightSuffix(slot)}>` });
                }
            }
            for (let i = 0; i < VIDEO_SLOTS.length; i++) {
                const slot = VIDEO_SLOTS[i];
                if (media.has(slot) && (useAllSlots || referencedSlots.has(slot))) {
                    specs.push({ slot, kind: "video", label: `<video ${i + 1}${weightSuffix(slot)}>` });
                }
            }
            for (let i = 0; i < AUDIO_SLOTS.length; i++) {
                const slot = AUDIO_SLOTS[i];
                if (media.has(slot) && (useAllSlots || referencedSlots.has(slot))) {
                    specs.push({ slot, kind: "audio", label: `<audio ${i + 1}${weightSuffix(slot)}>` });
                }
            }
        }
        const signature = computeContextSignature(specs);

        // 缓存命中：素材/模板/配置都没动
        if (optimizerCache && optimizerCache.signature === signature) {
            if (before === optimizerCache.originalPrompt) {
                // 当前是原文 → 直接展示上次的优化结果，不调用 API。
                prompt.value = optimizerCache.result; renderRich();
                optimizerBefore = optimizerCache.originalPrompt;
                promptState = "optimized";
                updateOptimizeButton();
                renderStoryboard();
                persist();
                return true;
            }
            if (before === optimizerCache.result) {
                // 已经在展示优化稿，什么都不用做。
                return true;
            }
        }
        // 【历史栈复用】当前缓存对不上，但历史栈里有匹配当前大白话+signature的版本 → 直接复用
        {
            const stack = modeState[currentSlot()].history || [];
            const hit = stack.find(e => e.originalPrompt === before && e.signature === signature);
            if (hit) {
                optimizerCache = {
                    signature: hit.signature,
                    originalPrompt: hit.originalPrompt,
                    result: hit.result
                };
                modeState[currentSlot()].cache = optimizerCache;
                prompt.value = hit.result; renderRich();
                promptState = "optimized";
                updateOptimizeButton();
                renderStoryboard();
                persist();
                return true;
            }
        }

        try {
            const settings = await loadSettings();
            const local = settings?.mode === "local";
            if ((!local && !settings?.has_api_key) || (local && !settings?.local_model)) {
                alert(t("Prompt optimizer API is not configured. Open settings now?"));
                return false;
            }
            optimizing = true;
            optimizerRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            optimizerAbort = new AbortController();
            optBtn.classList.add("ghupo-loading");
            // 【L2-d】优化中复用 ✦ 旋转效果（自动/手动一致）
            elapsed.classList.add("visible");
            const started = performance.now();
            const tick = () => {
                const sec = Math.floor((performance.now() - started) / 1000);
                elapsed.textContent = `${t("Optimizing")}：${sec} s`;
                // 【进度条】手动单段优化：首次 tick 时显示面板（多段由 autoOptimizeAllSegments 控制）
                if (!autoOptimizeRunning && !progressPanel.classList.contains("visible")) {
                    showProgress(1, 1, "提示词优化中");
                }
                updateProgress();
            };
            tick(); optimizerTimer = setInterval(tick, 1000);

            // 关键 1：有素材 → Ref2VA（后端走六段 reference 结构）；
            //         没有素材 → T2VA（走三段结构）。
            const hasReferences = specs.length > 0;
            const task = isRefmodView
                ? (hasReferences ? "REFMOD" : "T2VA")
                : (hasReferences ? "Ref2VA" : "T2VA");

            // 关键 2：把参考图/视频帧真实图像传给后端。
            // 不传的话模型只能看到标签名，看不到画面，就会瞎编动作。
            const readMedia = settings.read_media !== false;
            const mediaPayload = await buildOptimizerMedia(specs, readMedia);

            // 【层1防御】引号规范化：中文引号 → 英文直引号
            // 中文引号 “ ” 有方向，方向反了会让 LLM 无法识别对话边界，
            // 导致嵌套 <d> 标签、对白吞并等错乱。英文直引号无方向，彻底消除歧义。
            const normalizedBefore = String(before)
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[\u2018\u2019]/g, "'");
            const body = {
                request_id: optimizerRequestId,
                prompt: normalizedBefore,
                task,
                duration: effectiveDuration(),
                media: mediaPayload,
                context: { main_mode: hasReferences ? "all_reference" : "text_keyframes" },
                config: { ...settings, template: effectiveTemplate() },
            };
            const r = await api.fetchApi(`${OPTIMIZER_ROUTE}/optimize`, {
                method: "POST", signal: optimizerAbort.signal,
                body: new Blob([JSON.stringify(body)], { type: "application/json" }),
            });
            const text = await r.text();
            let data; try { data = JSON.parse(text); } catch { throw new Error("优化接口返回了无效数据"); }
            if (!r.ok) throw new Error(data.error || "Prompt optimization failed");
            optimizerBefore = before;
            optimizerCache = { signature, originalPrompt: before, result: data.prompt };
            modeState[currentSlot()].cache = optimizerCache;
            // 【历史版本】每次真正优化成功（非缓存命中）后追加，上限 3 条，与栈顶去重
            {
                const stack = modeState[currentSlot()].history;
                const top = stack[0];
                const newEntry = {
                    timestamp: Date.now(),
                    duration: viewMode === "video" ? readDuration() : null,
                    // 【双模式】记录实际生效的模板：视频用下拉值，图片固定 image
                    template: effectiveTemplate(),
                    signature,
                    originalPrompt: before,
                    result: data.prompt,
                    mediaSnapshot: [...media.entries()].map(([s, e]) => [s, e.kind, e.name]),
                };
                if (!top || top.result !== newEntry.result || top.signature !== newEntry.signature) {
                    stack.unshift(newEntry);
                    if (stack.length > 3) stack.length = 3;
                }
            }

            // ---- 完成提示（内联，不依赖任何外部文件）----
            // 1) 音频：用 Web Audio API 实时合成两声"叮——咚"。
            //    为什么不用 done.mp3？因为 web/ 目录下的 JS 通过相对路径
            //    ../audio/done.mp3 会解析到 extensions/audio/done.mp3，
            //    那是空目录，404 加载不到任何声音。
            //    Web Audio 合成不需要文件、不受跨域/自动播放限制、100% 有效。
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    const ctx = new AC();
                    const now = ctx.currentTime;
                    const playBeep = (freq, start, dur, vol) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = "sine";
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.0001, now + start);
                        gain.gain.exponentialRampToValueAtTime(vol, now + start + 0.015);
                        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                        osc.connect(gain).connect(ctx.destination);
                        osc.start(now + start);
                        osc.stop(now + start + dur + 0.02);
                    };
                    // 两声上行"叮咚"：先 880Hz，再 1318Hz
                    playBeep(880, 0.00, 0.18, 0.30);
                    playBeep(1318, 0.16, 0.32, 0.28);
                    setTimeout(() => ctx.close().catch(() => {}), 900);
                }
            } catch {}
            // 2) 视觉：把提示词编辑框闪一下青色边框 1.5 秒。
            //    用 DOM 直接改样式，比 node.color 更可靠。
            try {
                const prevOutline = prompt.style.outline;
                const prevShadow = prompt.style.boxShadow;
                prompt.style.transition = "box-shadow .15s ease, outline-color .15s ease";
                prompt.style.outline = "2px solid #0aa4d6";
                prompt.style.boxShadow = "0 0 12px rgba(10,164,214,.75)";
                setTimeout(() => {
                    prompt.style.outline = prevOutline;
                    prompt.style.boxShadow = prevShadow;
                }, 1500);
            } catch {}
            // 视觉反馈：让节点标题背景闪一下青色，用户余光能察觉优化已完成。
            try {
                const originalColor = node.color;
                node.color = "#17535a";
                setTimeout(() => { node.color = originalColor; node.setDirtyCanvas?.(true, true); }, 900);
            } catch {}
            prompt.value = data.prompt; renderRich();
            promptState = "optimized";
            updateOptimizeButton();
            renderStoryboard();
            playDoneSound();
            persist();
            return true;
        } catch (e) {
            if (e.name !== "AbortError") alert(e.message);
            return false;
        } finally {
            clearInterval(optimizerTimer); optimizerTimer = null;
            optimizerAbort = null; optimizerRequestId = null; optimizing = false;
            elapsed.classList.remove("visible"); elapsed.textContent = "";
            optBtn.classList.remove("ghupo-loading");
            // 【L2-d】旋转效果已由 ghupo-loading class 清除恢复
            // 【进度条】手动单段优化结束 → 隐藏；多段由 autoOptimizeAllSegments 控制
            if (!autoOptimizeRunning) hideProgress();
        }
    }

    optBtn.onclick = () => {
        // 用户手势窗口开启，先把音频解锁。
        unlockDoneSound();
        if (autoOptimizeRunning) {
            // 【L2-d】自动优化流程中点击 → 取消整个流程
            autoOptimizeCancelled = true;
            optimizerAbort?.abort();
            return;
        }
        if (optimizing) { optimizerAbort?.abort(); return; }
        // 【源头拦截】空输入绝不允许跑到任何缓存或优化逻辑里
        if (!editorText().trim()) {
            alert(t("提示词不能为空，请先输入内容再点击优化"));
            return;
        }
        runOptimization();
    };
    resetBtn.onclick = () => {
        // 回到大白话。缓存保留在 modeState[currentSlot()].cache，再点 ✦ 时恢复优化稿。
        promptState = "original";
        prompt.value = modeState[currentSlot()].original || "";
        renderRich();
        prompt.blur();
        prompt.scrollTop = 0;
        updateOptimizeButton();
        renderStoryboard();
        persist();
    };
    updateOptimizeButton();

    // 齿轮：直接复用原插件设置面板的入口。为避免重复实现，简单 alert 提示
    // 用户在原节点或本节点的设置面板里配置即可。
        const OPTIMIZER_PROVIDERS = {
        runninghub:          { label: "RunningHub 国内版", url: "https://www.runninghub.cn/openapi/v2", model: "openai/gpt-5.6-sol", protocol: "runninghub" },
        runninghub_overseas: { label: "RunningHub 海外版", url: "https://www.runninghub.ai/openapi/v2", model: "openai/gpt-5.6-sol", protocol: "runninghub" },
        openai:              { label: "OpenAI",            url: "https://api.openai.com/v1",           model: "gpt-4.1-mini",           protocol: "openai" },
        gemini:              { label: "Google Gemini",     url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", protocol: "gemini" },
        openrouter:          { label: "OpenRouter",        url: "https://openrouter.ai/api/v1",        model: "google/gemini-2.5-flash", protocol: "openai" },
        dashscope:           { label: "阿里云百炼",        url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max", protocol: "openai" },
        siliconflow:         { label: "SiliconFlow",       url: "https://api.siliconflow.cn/v1",       model: "Qwen/Qwen2.5-VL-72B-Instruct", protocol: "openai" },
        custom:              { label: "自定义",            url: "", model: "", protocol: "openai" },
    };

    async function openSettings() {
        // 优先读节点自己保存的配置；没有才从后端拉默认值。
        // 之前那句 fetchJson(.../config) 每次都会把用户存好的配置覆盖成默认值。
        // 优先级：localStorage → properties → 内存 → 后端默认值。
        let current = loadConfigFromLocalStorage()
            || loadOptimizerConfigFromNode()
            || optimizerSettings;
        if (!current) {
            try { current = await fetchJson(`${OPTIMIZER_ROUTE}/config`, { cache: "no-store" }); }
            catch (e) { alert(e.message); return; }
        }
        // 合并最新的本地模型列表（这一项是环境相关的，后端才有）
        try {
            const fresh = await fetchJson(`${OPTIMIZER_ROUTE}/config`, { cache: "no-store" });
            current = {
                ...fresh, ...current,
                models: fresh.models || current.models || [],
                mmproj_models: fresh.mmproj_models || current.mmproj_models || [],
                runninghub_models: fresh.runninghub_models || current.runninghub_models || [],
                runninghub_overseas_models: fresh.runninghub_overseas_models || current.runninghub_overseas_models || [],
                missing_dependencies: fresh.missing_dependencies || current.missing_dependencies || [],
            };
        } catch {}
        optimizerSettings = current;

        const overlay = make("div"); overlay.className = "ghupo-overlay";
        const dialog = make("div"); dialog.className = "ghupo-dialog";
        overlay.append(dialog);

        const title = make("div", {}, t("LLM Prompt Optimization Configuration"));
        title.className = "ghupo-dialog-title"; dialog.append(title);

        const row = (label, control) => {
            const wrap = make("label"); wrap.className = "ghupo-row";
            wrap.append(make("span", {}, t(label)), control);
            dialog.append(wrap);
            return control;
        };

        const modeSel = row("Optimization mode", make("select"));
        modeSel.append(new Option(t("Online API"), "api"), new Option(t("Local vision model"), "local"));
        modeSel.value = current.mode || "api";

        const providerSel = row("Provider", make("select"));
        for (const [v, p] of Object.entries(OPTIMIZER_PROVIDERS)) providerSel.append(new Option(p.label, v));
        providerSel.value = current.provider || "runninghub";

        const apiKeys = { ...(current.api_keys || {}) };
        if (current.api_key && !apiKeys[providerSel.value]) apiKeys[providerSel.value] = current.api_key;
        const keyInput = row("API key", make("input")); keyInput.type = "password";
        keyInput.value = apiKeys[providerSel.value] || "";

        const urlInput = row("API URL", make("input"));
        urlInput.value = current.api_url || "";

        const modelInput = row("Model", make("input"));
        modelInput.value = current.model || "";

        const protocolSel = row("Protocol", make("select"));
        protocolSel.append(
            new Option("OpenAI Chat Completions", "openai"),
            new Option("OpenAI Responses", "responses"),
            new Option("Gemini GenerateContent", "gemini"),
        );
        protocolSel.value = current.protocol || "openai";

        // ---- 本地模型：下拉 + 刷新按钮 ----
        const localModels = [...(current.models || [])];
        let mmprojModels = [...(current.mmproj_models || [])];

        const localModelGroup = make("div");
        localModelGroup.style.cssText = "display:flex;gap:6px;align-items:center;";
        const localModelSel = make("select");
        localModelSel.style.flex = "1";
        for (const m of localModels) localModelSel.append(new Option(m.name, m.relative_path));
        if (!localModels.length) localModelSel.append(new Option(t("No compatible local vision models found"), ""));
        localModelSel.value = current.local_model || "";
        const localRefreshBtn = make("button", {}, "↻");
        localRefreshBtn.title = t("Refresh local models");
        localRefreshBtn.style.cssText = "padding:5px 10px;cursor:pointer;background:#1d2b36;color:#cbd8e0;border:1px solid #3a4d5b;border-radius:4px;";
        localModelGroup.append(localModelSel, localRefreshBtn);
        row("Local model", localModelGroup);

        // ---- mmproj 下拉 ----
        const mmprojSel = row("Vision model (mmproj)", make("select"));
        mmprojSel.append(new Option(t("Choose vision projector"), ""));
        for (const m of mmprojModels) mmprojSel.append(new Option(m.name, m.relative_path));
        mmprojSel.value = current.local_mmproj || "";

        // ---- 自动匹配：根据主模型的 mmproj_candidates 自动选 mmproj ----
        const findSelectedModel = () => localModels.find(m => m.relative_path === localModelSel.value);
        const autoMatchMmproj = () => {
            const m = findSelectedModel();
            if (!m || m.format !== "gguf") { mmprojSel.value = ""; return; }
            const candidates = m.mmproj_candidates || [];
            if (!candidates.length) { mmprojSel.value = ""; return; }
            // 优先选第一个候选（后端已按相似度排序）
            mmprojSel.value = candidates[0];
        };

        // 切换主模型 → 自动联动 mmproj
        localModelSel.addEventListener("change", autoMatchMmproj);

        // 打开面板时：如果当前 mmproj 为空，或不在候选里，就自动填
        if (!mmprojSel.value) autoMatchMmproj();
        else {
            const m = findSelectedModel();
            const cand = m?.mmproj_candidates || [];
            if (cand.length && !cand.includes(mmprojSel.value)) autoMatchMmproj();
        }

        // ---- 刷新按钮：重新扫描目录（用户新下载了模型时用）----
        localRefreshBtn.onclick = async () => {
            localRefreshBtn.disabled = true;
            const prev = localRefreshBtn.textContent;
            localRefreshBtn.textContent = "…";
            try {
                const data = await fetchJson(`${OPTIMIZER_ROUTE}/models`, { cache: "no-store" });
                const newModels = data.models || [];
                const newMmprojs = data.mmproj_models || [];
                localModels.length = 0;
                localModels.push(...newModels);
                mmprojModels.length = 0;
                mmprojModels.push(...newMmprojs);

                // 保留之前的选择（如果还在）
                const prevLocal = localModelSel.value;
                const prevMmproj = mmprojSel.value;
                localModelSel.replaceChildren();
                for (const m of localModels) localModelSel.append(new Option(m.name, m.relative_path));
                if (!localModels.length) localModelSel.append(new Option(t("No compatible local vision models found"), ""));
                if ([...localModelSel.options].some(o => o.value === prevLocal)) localModelSel.value = prevLocal;

                mmprojSel.replaceChildren();
                mmprojSel.append(new Option(t("Choose vision projector"), ""));
                for (const m of mmprojModels) mmprojSel.append(new Option(m.name, m.relative_path));
                if ([...mmprojSel.options].some(o => o.value === prevMmproj)) mmprojSel.value = prevMmproj;

                // 刷新后重新自动匹配
                autoMatchMmproj();
            } catch (e) {
                alert("刷新失败：" + e.message);
            } finally {
                localRefreshBtn.textContent = prev;
                localRefreshBtn.disabled = false;
            }
        };

        const deviceSel = row("Local device", make("select"));
        deviceSel.append(new Option("Auto", "auto"), new Option("GPU", "cuda"), new Option("CPU", "cpu"));
        deviceSel.value = current.local_device || "cuda";

        const maxTokensInput = row("Maximum output tokens", make("input"));
        maxTokensInput.type = "number"; maxTokensInput.min = "512"; maxTokensInput.max = "8192"; maxTokensInput.step = "512";
        maxTokensInput.value = String(current.max_tokens || 4096);

        const langWrap = make("div"); langWrap.className = "ghupo-lang";
        for (const lang of ["English", "中文"]) {
            const lab = make("label");
            const radio = make("input"); radio.type = "radio"; radio.name = `upo-lang-${node.id}`;
            radio.value = lang; radio.checked = (current.output_language || "中文") === lang;
            lab.append(radio, make("span", {}, lang));
            langWrap.append(lab);
        }
        row("Output language", langWrap);

        const templateSel = row("Prompt format template", make("select"));
        // 设置面板只列视频模板 + image，移除已废弃的 flux_2 / z_image / qwen_image
        const SETTINGS_TEMPLATE_IDS = ["minimax_h3", "ltx_2_5", "seedance_2_5", "wan_2_2", "kling", "hunyuan_video", "veo_3", "sora_2", "image", "custom"];
        for (const id of SETTINGS_TEMPLATE_IDS) {
            if (PROMPT_TEMPLATES[id]) templateSel.append(new Option(PROMPT_TEMPLATES[id], id));
        }
        if (viewMode === "image") {
            // 图片模式：显示但禁用，锁定为 image，避免误改污染视频模板
            templateSel.value = "image";
            templateSel.disabled = true;
            templateSel.title = t("图片模式固定使用 Image Prompt 模板，切换到视频模式可修改");
        } else {
            // 视频模式：用当前生效的视频模板（viewTemplateRemember.video 是单一事实来源）
            templateSel.value = viewTemplateRemember.video || "minimax_h3";
        }

        const readMediaChk = make("input"); readMediaChk.type = "checkbox"; readMediaChk.checked = current.read_media !== false;
        readMediaChk.className = "ghupo-check";
        row("Read visual references", readMediaChk);

        const autoChk = make("input"); autoChk.type = "checkbox"; autoChk.checked = !!current.auto_optimize;
        autoChk.className = "ghupo-check";
        row("Automatic optimization before run", autoChk);

        // 自定义系统提示词
        const customWrap = make("label"); customWrap.className = "ghupo-row ghupo-custom-row";
        const customLabel = make("span", {}, t("自定义系统提示词"));
        const customArea = make("textarea");
        customArea.rows = 8;
        customArea.value = String(current.custom_system_prompt || "");
        customArea.placeholder = "可用占位符：{task} {duration} {labels} {output_language} {user_prompt} {preamble} {language_rule}";
        customWrap.append(customLabel, customArea); dialog.append(customWrap);

        const syncCustomVisibility = () => {
            customWrap.style.display = templateSel.value === "custom" ? "grid" : "none";
        };
        const syncModeVisibility = () => {
            const local = modeSel.value === "local";
            for (const c of [providerSel, keyInput, urlInput, modelInput, protocolSel]) c.closest("label").classList.toggle("ghupo-hidden", local);
            for (const c of [localModelSel, mmprojSel, deviceSel]) c.closest("label").classList.toggle("ghupo-hidden", !local);
        };
        const syncProviderPreset = () => {
            if (providerSel.value === "custom") return;
            const p = OPTIMIZER_PROVIDERS[providerSel.value];
            urlInput.value = p.url;
            modelInput.value = p.model;
            protocolSel.value = p.protocol;
        };

        providerSel.addEventListener("change", () => {
            apiKeys[providerSel.value] = keyInput.value;
            keyInput.value = apiKeys[providerSel.value] || "";
            syncProviderPreset();
        });
        modeSel.addEventListener("change", syncModeVisibility);
        templateSel.addEventListener("change", syncCustomVisibility);
        syncModeVisibility(); syncCustomVisibility();

        const actions = make("div"); actions.className = "ghupo-actions";
        const cancelBtn = make("button", {}, t("Cancel"));
        const saveBtn = make("button", {}, t("Save"));
        actions.append(cancelBtn, saveBtn); dialog.append(actions);

        const close = () => overlay.remove();
        cancelBtn.onclick = close;
        overlay.addEventListener("pointerdown", e => { if (e.target === overlay) close(); });

        saveBtn.onclick = async () => {
            apiKeys[providerSel.value] = keyInput.value;
            const providerModels = { ...(current.provider_models || {}) };
            providerModels[providerSel.value] = modelInput.value;
            const body = {
                mode: modeSel.value,
                provider: providerSel.value,
                api_url: providerSel.value === "custom" ? urlInput.value : OPTIMIZER_PROVIDERS[providerSel.value].url,
                model: modelInput.value,
                protocol: providerSel.value === "custom" ? protocolSel.value : OPTIMIZER_PROVIDERS[providerSel.value].protocol,
                read_media: readMediaChk.checked,
                output_language: langWrap.querySelector("input:checked")?.value || "中文",
                // 图片模式：模板下拉被禁用，保留当前视频模板避免污染；视频模式：用用户选择
                template: viewMode === "image"
                    ? (viewTemplateRemember.video || "minimax_h3")
                    : templateSel.value,
                custom_system_prompt: customArea.value,
                local_model: localModelSel.value,
                local_mmproj: mmprojSel.value,
                local_device: deviceSel.value,
                max_tokens: Number(maxTokensInput.value) || 4096,
                auto_optimize: autoChk.checked,
                api_keys: { ...apiKeys },
                provider_models: providerModels,
                api_key: keyInput.value,
                has_api_key: !!keyInput.value,
            };
            // 保险：选了本地模型就强制切本地模式，防止"优化方式"没切导致保存成 api。
            if (body.local_model && body.mode !== "local") {
                body.mode = "local";
            }
            try {
                await api.fetchApi(`${OPTIMIZER_ROUTE}/config`, {
                    method: "POST",
                    body: new Blob([JSON.stringify(body)], { type: "application/json" }),
                });
                optimizerSettings = { ...current, ...body };
                saveOptimizerConfigToNode();
                saveConfigToLocalStorage(optimizerSettings);
                // 只在视频模式下同步 templateSelect 和 viewTemplateRemember
                if (viewMode === "video") {
                    templateSelect.value = body.template;
                    viewTemplateRemember.video = body.template;
                }
                updateModelName();
                close();
            } catch (e) { alert(e.message); }
        };

        document.body.append(overlay);
    }

    gearBtn.onclick = () => openSettings();

    templateSelect.onchange = async () => {
        if (restoringState) restoringState = false;
        try { await loadSettings(); } catch {}
        switchVideoTemplate(templateSelect.value);
        persist();
    };

    // 【统一模板切换函数】任何地方想切换视频模板，都调它，避免"某处切了某处没切"
    const switchVideoTemplate = (newTemplate) => {
        if (!newTemplate || !PROMPT_TEMPLATES[newTemplate]) return;
        viewTemplateRemember.video = newTemplate;
        templateSelect.value = newTemplate;
        if (optimizerSettings && typeof optimizerSettings === "object") {
            optimizerSettings = { ...optimizerSettings, template: newTemplate };
            saveConfigToLocalStorage(optimizerSettings);
        }
        updateModelName();
    };

    const updateModelName = () => {
        if (!optimizerSettings) { modelName.textContent = ""; return; }
        // 图片模式下显示固定模板名（实际后端用的是 image builder）
        if (viewMode === "image") {
            const imgName = optimizerSettings.mode === "local"
                ? String(optimizerSettings.local_model || "").split(/[\\/]/).pop()
                : String(optimizerSettings.model || "").split("/").pop();
            modelName.textContent = `[Image Prompt]${imgName ? " " + imgName : ""}`;
            return;
        }
        const templateLabel = PROMPT_TEMPLATES[optimizerSettings.template] || PROMPT_TEMPLATES.minimax_h3;
        let name = "";
        if (optimizerSettings.template === "custom") name = "自定义";
        else if (optimizerSettings.mode === "local") name = String(optimizerSettings.local_model || "").split(/[\\/]/).pop();
        else name = String(optimizerSettings.model || "").split("/").pop();
        modelName.textContent = `[${templateLabel}]${name ? " " + name : ""}`;
    };

    // ---- 生命周期挂钩 ----
    const oldDraw = node.onDrawForeground;
    node.onDrawForeground = function(...a) {
        const r = oldDraw?.apply(this, a);
        return r;
    };

    const oldResize = node.onResize;
    node.onResize = function(...a) {
        const r = oldResize?.apply(this, a);
        // 只记录高度用于持久化；宽度由用户自由拖动。
        if (Number.isFinite(this.size?.[1])) userHeight = this.size[1];
        persist();
        return r;
    };

     const oldConfigure = node.onConfigure;
    node.onConfigure = function(...a) {
        const r = oldConfigure?.apply(this, a);
        restoringState = true;

        // ---- 恢复优化器配置：优先 widget.value，其次 properties ----
        // 优先级：
        //   1) gh_state_json widget 里的 .optimizer（ComfyUI 主序列化路径）
        //   2) node.properties[CONFIG_KEY]（我们自己额外存的一份）
        // 校验：必须是对象且带 mode 字段，否则视为无效，不污染当前配置。
        let restoredCfg = null;
        const stateWidget = widget(this, "gh_state_json");
        if (stateWidget?.value) {
            try {
                const s = JSON.parse(stateWidget.value);
                if (s?.optimizer && typeof s.optimizer === "object" && typeof s.optimizer.mode === "string" && s.optimizer.mode) {
                    restoredCfg = s.optimizer;
                }
                if (s?.optimizerCache && typeof s.optimizerCache === "object") {
                    optimizerCache = s.optimizerCache;
                }
            } catch {}
        }
        if (!restoredCfg) {
            const persistedCfg = this.properties?.[CONFIG_KEY];
            if (persistedCfg) {
                try {
                    const parsed = JSON.parse(persistedCfg);
                    if (parsed && typeof parsed === "object" && typeof parsed.mode === "string" && parsed.mode) {
                        restoredCfg = parsed;
                    }
                } catch {}
            }
        }
        if (restoredCfg) optimizerSettings = restoredCfg;
        // 缓存优先从 localStorage 恢复（hidden widget 恢复时机不稳定）。
        if (!optimizerCache) {
            const cacheLS = loadCacheFromLocalStorage();
            if (cacheLS) optimizerCache = cacheLS;
        }
        // 兜底：properties 里的旧缓存。
        if (!optimizerCache) {
            const persistedCache = this.properties?.["gh_upo_cache"];
            if (persistedCache) {
                try { optimizerCache = JSON.parse(persistedCache); } catch { optimizerCache = null; }
            }
        }

        requestAnimationFrame(() => {
            try {
                // 恢复 UI 状态也用同样策略：优先 widget.value，其次 properties。
                const stateRaw = stateWidget?.value || this.properties?.[stateKey] || "{}";
                const restored = JSON.parse(stateRaw);
                media.clear();
                for (const [slot, entry] of restored.media || []) {
                    if (entry && !Number.isFinite(Number(entry.weight))) entry.weight = 1.0;
                    media.set(slot, entry);
                }
                for (const slot of ALL_SLOTS) {
                    const v = widget(this, slot)?.value;
                    if (!media.has(slot) && v && v !== "(none)") media.set(slot, { name: v, kind: kindOf({ name: v, type: "" }) });
                }
                // 刷新恢复策略：完全保持刷新前的状态，不做任何"智能"调整。
                // - 刷新前是优化稿 → 恢复优化稿 → updateOptimizeButton 自动显示 ↻
                // - 刷新前是大白话 → 恢复大白话 → updateOptimizeButton 自动显示 ✦
                // - 用户从没点过 ✦ → cache 是 null → 显示 ✦，点 ✦ 正常调用 LLM
                // ↻ / ✦ 的显示逻辑完全由 updateOptimizeButton 根据
                // "编辑器内容 === cache.result" 自动判断，不需要在这里特殊处理。
                // 【双模式】先恢复 viewMode 与 modeState，再恢复编辑器内容
                if (restored.viewMode === "video" || restored.viewMode === "image") {
                    viewMode = restored.viewMode;
                    videoTab.classList.toggle("active", viewMode === "video");
                    if (imageTab) imageTab.classList.toggle("active", viewMode === "image");
                    subTabsRow.style.display = (viewMode === "image") ? "none" : "";
                    if (viewMode === "image") {
                        mediaSubPanel.classList.remove("hidden");
                        refmodSubPanel.classList.add("hidden");
                        countRow.style.display = "";
                    }
                }
                if (restored.modeState && typeof restored.modeState === "object") {
                    modeState.video = {
                        original: restored.modeState.video?.original || "",
                        cache: restored.modeState.video?.cache || null,
                        history: Array.isArray(restored.modeState.video?.history) ? restored.modeState.video.history : []
                    };
                    modeState.image = {
                        original: restored.modeState.image?.original || "",
                        cache: restored.modeState.image?.cache || null,
                        history: Array.isArray(restored.modeState.image?.history) ? restored.modeState.image.history : []
                    };
                    modeState.refmod = {
                        original: restored.modeState.refmod?.original || "",
                        cache: restored.modeState.refmod?.cache || null,
                        history: Array.isArray(restored.modeState.refmod?.history) ? restored.modeState.refmod.history : []
                    };
                } else if (restored.prompt) {
                    // 兼容早期版本：把老 prompt 视作视频模式的大白话
                    modeState.video.original = restored.prompt;
                }
                // 【L2-b】恢复分段数据模型（每段=迷你万能节点）
                if (Array.isArray(restored.segments) && restored.segments.length) {
                    segments = restored.segments.map((s, i) => ({
                        id: s.id || `seg-${i}`,
                        duration: Number.isFinite(Number(s.duration)) ? Number(s.duration) : 5,
                        original: String(s.original || ""),
                        cache: (s.cache && typeof s.cache === "object") ? s.cache : null,
                        history: Array.isArray(s.history) ? s.history : [],
                        imageIndices: Array.isArray(s.imageIndices) ? s.imageIndices : null,
                        viewState: (s.viewState === "original" || s.viewState === "optimized") ? s.viewState : null,
                    }));
                    activeSegmentIndex = Math.min(
                        Math.max(0, Number(restored.activeSegmentIndex) || 0),
                        segments.length - 1
                    );
                    // 把激活段的状态加载进镜像，覆盖从 modeState 恢复的老状态
                    syncSegmentToMirror(activeSegmentIndex);
                }
                // 【刷新恢复】onConfigure 时 currentSubView 可能还没就位，直接用 restored 判断槽
                const restoredSlot = (restored.viewMode === "video" && restored.currentSubView === "refmod")
                    ? "refmod"
                    : (restored.viewMode === "image" ? "image" : "video");
                optimizerCache = modeState[restoredSlot].cache || null;
                // 【刷新恢复视图状态】优先按持久化的 promptState 恢复。
                // - 若之前是 optimized 且缓存有效 → 编辑器显示优化稿，按钮是 ↻
                // - 否则回退到 original（大白话）
                if (restored.promptState === "optimized" && optimizerCache?.result) {
                    promptState = "optimized";
                    prompt.value = optimizerCache.result;
                } else {
                    promptState = "original";
                    prompt.value = modeState[restoredSlot].original || widget(this, "prompt")?.value || "";
                }
                renderRich();
                if (restored.template) templateSelect.value = restored.template;
                if (restored.template) viewTemplateRemember[viewMode] = restored.template;
                setSizeWidgetsVisible(viewMode === "image");
                durationGroup.style.display = (viewMode === "image") ? "none" : "";
                templateSelect.style.display = (viewMode === "image") ? "none" : "";
                rebuildTemplateSelect();
                renderStoryboard();
                if (Number.isFinite(restored.duration)) setDuration(restored.duration, false);
                if (typeof restored.currentSubView === "string") {
                    currentSubView = (restored.currentSubView === "refmod") ? "refmod" : "media";
                    const isMedia = currentSubView === "media";
                    subTabMedia.classList.toggle("active", isMedia);
                    subTabRefmod.classList.toggle("active", !isMedia);
                    mediaSubPanel.classList.toggle("hidden", !isMedia);
                    refmodSubPanel.classList.toggle("hidden", isMedia);
                    countRow.style.display = isMedia ? "" : "none";
                }
                // 【恢复分辨率】
                if (restored.dirAR) arSelect.value = restored.dirAR;
                if (restored.dirMP) mpInput.value = restored.dirMP;
                if (restored.dirSteps) stepsInput.value = restored.dirSteps;
                if (restored.dirSecondPass !== undefined) spCheck.checked = restored.dirSecondPass;
                if (restored.dirSecondPassModel) spModelSelect.value = restored.dirSecondPassModel;
                if (restored.dirExecMode) execModeSelect.value = restored.dirExecMode;
                if (restored.dirSecondPassSteps) spStepsInput.value = restored.dirSecondPassSteps;
                if (restored.dirSecondPassMode) spModeSelect.value = restored.dirSecondPassMode;
                if (restored.dirAudioMode) audioSelect.value = restored.dirAudioMode;
                if (restored.dirBridgeOverlaps !== undefined) overlapInput.value = restored.dirBridgeOverlaps;
                if (Number.isFinite(restored.height)) {
                    userHeight = restored.height;
                    const currentWidth = this.size?.[0] || WIDTH;
                    this.setSize?.([currentWidth, userHeight]);
                }
                render();
                renderRefmodSection();
                if (typeof renderStoryboard === "function") renderStoryboard();
                if (typeof refreshPromptPlaceholder === "function") refreshPromptPlaceholder();
                updateModelName();
                updateOptimizeButton();
            } catch (e) { console.warn("[UPO] restore failed", e); }
            restoringState = false;
            persist();
        });
        return r;
    };

    const oldSerialize = node.onSerialize;
    node.onSerialize = function(...a) {
        persist();
        return oldSerialize?.apply(this, a);
    };

    // 【L2-d】暴露给 hook 用
    node.__ghupoAutoOptimize = () => !!(optimizerSettings?.auto_optimize);
    node.__ghupoAutoOptimizeAll = autoOptimizeAllSegments;

    // 【L2-d·桥接器】暴露段数据 + 素材池计数给桥接器 UI 读取
    node.__ghupoBridgeData = () => {
        // 先回写当前段（防止用户正在编辑中切走数据）
        // 仅参考素材子 tab（video 槽）参与段镜像，参考模型子 tab 走独立槽
        if (viewMode === "video" && currentSlot() === "video" && segments[activeSegmentIndex]) {
            if (promptState === "original") modeState.video.original = editorText();
            modeState.video.cache = optimizerCache;
            segments[activeSegmentIndex].duration = readDuration();
            syncMirrorToSegment();
        }
        // 统计素材池
        let imgCount = 0, vidCount = 0, audCount = 0;
        for (const [, entry] of media) {
            if (!entry) continue;
            if (entry.kind === "image") imgCount++;
            else if (entry.kind === "video") vidCount++;
            else if (entry.kind === "audio") audCount++;
        }
        return {
            viewMode: viewMode,
            segments: segments.map((s, i) => ({
                id: s.id,
                duration: Number(s.duration) || 5,
                color: SEG_COLORS[i % SEG_COLORS.length].border,
            })),
            mediaCounts: { images: imgCount, videos: vidCount, audios: audCount },
        };
    };

    const oldRemoved = node.onRemoved;
    node.onRemoved = function(...a) {
        optimizerAbort?.abort();
        clearInterval(optimizerTimer);
        window.removeEventListener("paste", accept, true);
        window.removeEventListener("wheel", capturePromptWheel, true);
        try { historyMenu.remove(); } catch {}
        try { toastContainer.remove(); } catch {}
        return oldRemoved?.apply(this, a);
    };

    // ---- 初始化 ----
    // 有些加载路径（例如从内部剪贴板粘贴节点）不会走 onConfigure，
    // 但 widget 的 value 依旧会被填充。这里再兜一次底。
    (() => {
        // 优先 localStorage —— 不受 ComfyUI 恢复时机影响。
        const fromLS = loadConfigFromLocalStorage();
        if (fromLS && !optimizerSettings) {
            optimizerSettings = fromLS;
        }
        // 缓存也从 localStorage 优先恢复。
        const cacheLS = loadCacheFromLocalStorage();
        if (cacheLS && typeof cacheLS === "object" && (cacheLS.video !== undefined || cacheLS.image !== undefined)) {
            modeState.video = {
                original: cacheLS.video?.original || "",
                cache: cacheLS.video?.cache || null,
                history: Array.isArray(cacheLS.video?.history) ? cacheLS.video.history : []
            };
            modeState.image = {
                original: cacheLS.image?.original || "",
                cache: cacheLS.image?.cache || null,
                history: Array.isArray(cacheLS.image?.history) ? cacheLS.image.history : []
            };
            optimizerCache = modeState[currentSlot()].cache || null;
        }
        // 其次 widget.value 里的 optimizer 字段。
        const stateWidget = widget(node, "gh_state_json");
        if (stateWidget?.value && !optimizerSettings) {
            try {
                const s = JSON.parse(stateWidget.value);
                if (s?.optimizer && typeof s.optimizer === "object" && typeof s.optimizer.mode === "string" && s.optimizer.mode) {
                    optimizerSettings = s.optimizer;
                }
                if (s?.optimizerCache && typeof s.optimizerCache === "object") {
                    optimizerCache = s.optimizerCache;
                }
            } catch {}
        }
    })();
    loadSettings()
        .then(() => {
            templateSelect.value = optimizerSettings?.template || "minimax_h3";
            updateModelName();
            updateOptimizeButton();
        })
        .catch(() => {});
    render();
    renderStoryboard();
    fetchRefmodCatalog().then(() => renderRefmodSection()).catch(() => {});
    refreshPromptPlaceholder();
    requestAnimationFrame(() => {
        const w = widget(node, "prompt"); if (w) prompt.value = w.value || "";
        renderRich();
        // 只保证高度符合恢复值；宽度保留用户在界面上拖出来的值。
        // 之前恒定写 WIDTH，导致用户拖宽后立刻被打回 500。
        const currentWidth = node.size?.[0] || WIDTH;
        node.setSize([currentWidth, userHeight]);
        // 关键：这里绝对不要 restoringState = false，也不要 persist。
        // ComfyUI 会在 createPanel 之后再把保存的 widget 值填进来，
        // 然后才调用 onConfigure。rAF 若此时抢跑 persist()，就会把
        // widget 里保存的 optimizer 字段覆盖成空，导致刷新后配置丢失。
        //
        // 解除保护的责任交给两个更靠后的时机：
        //   (a) onConfigure 完成恢复后（已有逻辑）
        //   (b) 用户第一次主动输入/上传/切模板时（下面几处补丁）
    });

    return true;
}

app.registerExtension({
    name: "universal.director_ui_max",
    async setup() {
        // 保留你原有的 setup 逻辑...
        return;
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;

        // =========================================================
        // 补丁 1：在 onNodeCreated 拦截原生 VIDEO 预览控件
        // =========================================================
        const prevOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = prevOnNodeCreated?.apply(this, arguments);
            
            if (!this._ghUpoReady && createPanel(this)) this._ghUpoReady = true;

            // 劫持 addWidget，如果 ComfyUI 试图添加视频/图片预览控件，直接拦截
            if (!this._origAddWidget) {
                this._origAddWidget = this.addWidget;
                this.addWidget = function (type, name, value, callback, options) {
                    if (name === "video" || name === "image" || name === "images" || name === "preview" || type === "video" || type === "image") {
                        return null; // 拒绝添加预览 widget
                    }
                    return this._origAddWidget.apply(this, arguments);
                };
            }

            // 延迟清理可能已经被加进去的预览控件
            setTimeout(() => {
                if (!this.widgets) return;
                for (let i = this.widgets.length - 1; i >= 0; i--) {
                    const w = this.widgets[i];
                    if (w && (w.name === "video" || w.name === "image" || w.name === "preview")) {
                        w.hidden = true;
                        w.computeSize = () => [0, -4];
                        if (w.element && w.element.parentNode) {
                            w.element.parentNode.removeChild(w.element);
                        }
                        this.widgets.splice(i, 1);
                    }
                }
                this.setSizeForImage = () => {};
                this.setDirtyCanvas?.(true, true);
            }, 100);

            return r;
        };

        // =========================================================
        // 补丁 2：在 onExecuted 中彻底清空预览数据，阻止尺寸自适应
        // =========================================================
        const prevOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            prevOnExecuted?.apply(this, arguments);
            
            // 阻断 ComfyUI 渲染预览
            this.images = null;
            this.imgs = null;
            this.video = null;
            this.videos = null;
            this.animatedImages = null;
            this.setSizeForImage = () => {};

            // 如果此时依然有被加进来的预览 widget，再清理一次
            if (this.widgets) {
                for (let i = this.widgets.length - 1; i >= 0; i--) {
                    const w = this.widgets[i];
                    if (w && (w.name === "video" || w.name === "image" || w.name === "preview")) {
                        w.hidden = true;
                        w.computeSize = () => [0, -4];
                        if (w.element && w.element.parentNode) {
                            w.element.parentNode.removeChild(w.element);
                        }
                        this.widgets.splice(i, 1);
                    }
                }
            }

            // 重新适应高度
            if (this.computeSize) {
                const newSize = this.computeSize();
                if (newSize) this.setSize([this.size[0], newSize[1]]);
            }
            this.setDirtyCanvas?.(true, true);
        };
    },
});