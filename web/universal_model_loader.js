import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE = "UniversalH3ModelLoader";

app.registerExtension({
    name: "universal.model_loader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            const configWidget = this.widgets?.find(w => w.name === "loader_config");
            if (configWidget) {
                configWidget.type = "hidden";
                configWidget.computeSize = () => [0, -4];
            }

            const root = document.createElement("div");
            root.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:10px;background:#1d2731;border-radius:6px;color:#d7e3ef;font-family:Arial;font-size:12px;width:100%;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;height:100%;";

            let AVAILABLE = null;
            let state = { models: [], loras: [], clips: [], vaes: [], audio_vaes: [] };

            const saveState = () => {
                if (configWidget) configWidget.value = JSON.stringify(state);
            };

            const fetchModels = async () => {
                let diffusion = [], weight_dtype = ["default"], clips = [], clip_types = ["minimax"], clip_devices = ["default", "cpu"], vaes = [], loras = [];
                
                try {
                    const unet = await api.fetchApi("/object_info/UNETLoader").then(r => r.ok ? r.json() : null);
                    if (unet && unet.UNETLoader) {
                        diffusion = unet.UNETLoader.input?.required?.unet_name?.[0] || [];
                        weight_dtype = unet.UNETLoader.input?.required?.weight_dtype?.[0] || ["default"];
                    }
                } catch(e) {}

                try {
                    // 【关键修复】拉取原生 LoRA 列表
                    const lora = await api.fetchApi("/object_info/LoraLoader").then(r => r.ok ? r.json() : null);
                    if (lora && lora.LoraLoader) {
                        loras = lora.LoraLoader.input?.required?.lora_name?.[0] || [];
                    }
                } catch(e) {}

                try {
                    const clip = await api.fetchApi("/object_info/CLIPLoader").then(r => r.ok ? r.json() : null);
                    if (clip && clip.CLIPLoader) {
                        clips = clip.CLIPLoader.input?.required?.clip_name?.[0] || [];
                        clip_types = clip.CLIPLoader.input?.required?.type?.[0] || ["minimax"];
                        clip_devices = clip.CLIPLoader.input?.required?.device?.[0] || ["default", "cpu"];
                    }
                } catch(e) {}

                try {
                    const vae = await api.fetchApi("/object_info/VAELoader").then(r => r.ok ? r.json() : null);
                    if (vae && vae.VAELoader) {
                        vaes = vae.VAELoader.input?.required?.vae_name?.[0] || [];
                    }
                } catch(e) {}

                return { diffusion, weight_dtype, clips, clip_types, clip_devices, vaes, loras };
            };

            const createRow = (type, key, i, item) => {
                const row = document.createElement("div");
                row.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;align-items:center;width:100%;padding-bottom:6px;border-bottom:1px dashed #2c4255;flex-shrink:0;";

                const makeField = (labelText, selectEl, width = "auto") => {
                    const wrap = document.createElement("div");
                    wrap.style.cssText = `display:flex;align-items:center;gap:4px;width:${width};`;
                    const lbl = document.createElement("span");
                    lbl.innerText = labelText;
                    lbl.style.cssText = "font-size:11px;color:#8697a7;white-space:nowrap;";
                    wrap.append(lbl, selectEl);
                    return wrap;
                };

                const makeSelect = (options, currentVal, onChange) => {
                    const sel = document.createElement("select");
                    sel.style.cssText = "flex:1;min-width:0;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;";
                    const safeOpts = Array.isArray(options) ? options : [];
                    if (safeOpts.length === 0) safeOpts.push("(无可用文件)");
                    
                    safeOpts.forEach(opt => sel.appendChild(new Option(opt, opt)));
                    
                    if (currentVal && safeOpts.includes(currentVal)) {
                        sel.value = currentVal;
                    } else {
                        sel.value = safeOpts[0];
                        if (item && item.name !== safeOpts[0] && safeOpts[0] !== "(无可用文件)") {
                            item.name = safeOpts[0]; 
                        }
                    }
                    sel.onchange = () => onChange(sel.value);
                    return sel;
                };

                if (type === "model") {
                    row.appendChild(makeField("文件", makeSelect(AVAILABLE.diffusion, item.name, (v) => { item.name = v; saveState(); }), "100%"));
                    row.appendChild(makeField("精度", makeSelect(AVAILABLE.weight_dtype, item.weight_dtype || "default", (v) => { item.weight_dtype = v; saveState(); }), "50%"));
                }

                if (type === "lora") {
                    // 【关键修复】替换为真正的下拉框
                    row.appendChild(makeField("文件", makeSelect(AVAILABLE.loras, item.name, (v) => { item.name = v; saveState(); }), "100%"));
                    const str = document.createElement("input");
                    str.type = "number"; str.step = "0.05"; str.value = item.strength || 1.0;
                    str.style.cssText = "width:50px;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:20px;font-size:11px;";
                    str.onchange = () => { item.strength = parseFloat(str.value); saveState(); };
                    row.appendChild(makeField("强度", str, "50%"));
                }

                if (type === "clip") {
                    row.appendChild(makeField("文件", makeSelect(AVAILABLE.clips, item.name, (v) => { item.name = v; saveState(); }), "100%"));
                    row.appendChild(makeField("类型", makeSelect(AVAILABLE.clip_types, item.clip_type || "minimax", (v) => { item.clip_type = v; saveState(); }), "45%"));
                    row.appendChild(makeField("设备", makeSelect(AVAILABLE.clip_devices, item.device || "default", (v) => { item.device = v; saveState(); }), "45%"));
                }

                if (type === "vae") {
                    row.appendChild(makeField("文件", makeSelect(AVAILABLE.vaes, item.name, (v) => { item.name = v; saveState(); }), "100%"));
                }

                const del = document.createElement("button");
                del.innerText = "×";
                del.style.cssText = "background:#ff5b5b;border:0;color:#fff;border-radius:3px;width:22px;height:22px;cursor:pointer;flex-shrink:0;margin-left:auto;";
                del.onclick = () => { state[key].splice(i, 1); saveState(); render(); };
                row.appendChild(del);

                return row;
            };

            const createSection = (title, type, key) => {
                const box = document.createElement("div");
                box.style.cssText = "border:1px solid #334a5d;border-radius:4px;padding:8px;width:100%;box-sizing:border-box;background:#14222d;flex-shrink:0;";
                const header = document.createElement("div");
                header.style.cssText = "display:flex;justify-content:space-between;font-weight:bold;color:#0aa4d6;margin-bottom:8px;";
                header.innerHTML = `<span>${title}</span>`;
                
                const addBtn = document.createElement("button");
                addBtn.innerText = "+ Add";
                addBtn.style.cssText = "background:#0aa4d6;border:0;color:#000;border-radius:3px;padding:2px 8px;cursor:pointer;font-weight:bold;";
                addBtn.onclick = () => {
                    state[key].push({ name: "", weight_dtype: "default", clip_type: "minimax", device: "default", strength: 1.0 });
                    saveState(); render();
                };
                header.appendChild(addBtn);
                box.appendChild(header);

                state[key].forEach((item, i) => {
                    box.appendChild(createRow(type, key, i, item));
                });

                root.appendChild(box);
            };

            const render = async () => {
                try {
                    if (!AVAILABLE) AVAILABLE = await fetchModels();
                    root.innerHTML = "";

                    if (configWidget && configWidget.value && configWidget.value !== "{}") {
                        try {
                            const parsed = JSON.parse(configWidget.value);
                            for (let k in state) if (parsed[k]) state[k] = parsed[k];
                        } catch (e) {}
                    }

                    createSection("主模型 (Model)", "model", "models");
                    createSection("LoRA 插件", "lora", "loras");
                    createSection("CLIP 文本编码器", "clip", "clips");
                    createSection("视频 VAE", "vae", "vaes");
                    createSection("音频 VAE (Audio)", "vae", "audio_vaes");

                    // 【高度持久化修复】只在最初创建时给个最小宽高，后续完全交给用户拉伸，并触发重绘
                    if (!this._isInitializedSize) {
                        this._isInitializedSize = true;
                        if (this.size[0] < 450) this.size[0] = 450;
                        if (this.size[1] < 300) this.size[1] = 300;
                    }
                    this.setDirtyCanvas(true, true);
                } catch (err) {
                    console.error("[UPO] 渲染加载器 UI 崩溃:", err);
                    root.innerHTML = `<div style="color:red;padding:10px;">UI 渲染失败，请按 F12 查看控制台报错。</div>`;
                }
            };

            const domWidget = this.addDOMWidget("model_loader_ui", "model_loader_ui", root);
            domWidget.serialize = false;
            render();
            return r;
        };
    }
});