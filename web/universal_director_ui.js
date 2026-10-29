import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE = "UniversalMiniMax_H3Director";

app.registerExtension({
    name: "universal.director_ui",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            // 1. 隐藏所有原生控件
            const hideWidget = (name) => {
                const w = this.widgets?.find(w => w.name === name);
                if (w) {
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                }
            };
            
            const nativeWidgets = ["width", "height", "duration", "steps", "seed", "second_pass", "second_pass_model", "second_pass_high_steps", "director_config", "control_after_generate"];
            nativeWidgets.forEach(hideWidget);

            // 2. 创建 UI 面板
            const root = document.createElement("div");
            root.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:10px;background:#1d2731;border-radius:6px;color:#d7e3ef;font-family:Arial;font-size:12px;width:100%;box-sizing:border-box;overflow:hidden;";

            // --- 基础设置 ---
            root.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;">
                    <span style="white-space:nowrap;">输出比例</span>
                    <select id="dir-ar" style="flex:1;min-width:0;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;outline:none;">
                        <option value="16:9">16:9 (宽屏)</option>
                        <option value="9:16">9:16 (竖屏)</option>
                        <option value="1:1">1:1 (方形)</option>
                        <option value="4:3">4:3 (标准)</option>
                        <option value="3:4">3:4 (竖版)</option>
                    </select>
                    <span style="white-space:nowrap;margin-left:2px;">百万像素</span>
                    <input id="dir-mp" type="number" step="0.1" value="0.4" style="width:40px;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;padding:0 4px;box-sizing:border-box;text-align:center;">
                    <span style="white-space:nowrap;margin-left:2px;">帧率</span>
                    <input id="dir-fps" type="number" value="24" style="width:36px;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;padding:0 4px;box-sizing:border-box;text-align:center;">
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;">
                    <span style="white-space:nowrap;">步数</span>
                    <input id="dir-steps" type="number" value="8" style="flex:0 0 50px;min-width:0;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;padding:0 4px;box-sizing:border-box;">
                    <span style="white-space:nowrap;margin-left:4px;">种子</span>
                    <input id="dir-seed" type="number" value="42" style="flex:1;min-width:0;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;padding:0 4px;box-sizing:border-box;">
                    <button id="dir-rand" style="flex:0 0 auto;background:#0aa4d6;border:0;color:#000;border-radius:3px;height:22px;padding:0 6px;cursor:pointer;">🎲</button>
                </div>
                <div style="border-top:1px solid #334a5d;margin:4px 0;"></div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" id="dir-sp-chk" style="margin:0;">
                    <label for="dir-sp-chk" style="cursor:pointer;font-weight:bold;color:#0aa4d6;">开启二采 (Upscale)</label>
                </div>
                <div id="dir-sp-panel" style="display:none;flex-direction:column;gap:6px;padding-left:20px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="white-space:nowrap;">二采模型</span>
                        <select id="dir-sp-model" style="flex:1;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;">
                            <option value="">(加载中...)</option>
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="white-space:nowrap;">高清步数</span>
                        <input id="dir-sp-steps" type="number" value="2" style="flex:1;background:#0f1a24;color:#dce7ee;border:1px solid #2c4255;border-radius:3px;height:22px;font-size:11px;padding:0 6px;">
                    </div>
                </div>
            `;

            const domWidget = this.addDOMWidget("director_ui", "director_ui", root);
            domWidget.serialize = false;

            // 3. 绑定 DOM 元素和原生 Widget
            const domAR = root.querySelector("#dir-ar");
            const domMP = root.querySelector("#dir-mp");
            const domFPS = root.querySelector("#dir-fps");
            const domSteps = root.querySelector("#dir-steps");
            const domSeed = root.querySelector("#dir-seed");
            const domRand = root.querySelector("#dir-rand");
            
            const domSpChk = root.querySelector("#dir-sp-chk");
            const domSpPanel = root.querySelector("#dir-sp-panel");
            const domSpModel = root.querySelector("#dir-sp-model");
            const domSpSteps = root.querySelector("#dir-sp-steps");

            const wWidth = this.widgets.find(w => w.name === "width");
            const wHeight = this.widgets.find(w => w.name === "height");
            const wDur = this.widgets.find(w => w.name === "duration");
            const wSteps = this.widgets.find(w => w.name === "steps");
            const wSeed = this.widgets.find(w => w.name === "seed");
            const wSpChk = this.widgets.find(w => w.name === "second_pass");
            const wSpModel = this.widgets.find(w => w.name === "second_pass_model");
            const wSpSteps = this.widgets.find(w => w.name === "second_pass_high_steps");
            const wFPS = this.widgets.find(w => w.name === "fps");
            
            // 隐藏原生 fps 和 prefix 控件
            ["fps", "filename_prefix"].forEach(n => {
                const w = this.widgets.find(w => w.name === n);
                if (w) { w.type = "hidden"; w.computeSize = () => [0, -4]; }
            });

            // 拉取二采模型列表
            let upsModelList = [];
            api.fetchApi("/minimax-bridge/upscalers").then(r => r.json()).then(data => {
                if (data && data.h3_compatible) {
                    upsModelList = data.h3_compatible;
                    domSpModel.innerHTML = "";
                    if (upsModelList.length === 0) {
                        domSpModel.appendChild(new Option("(未找到兼容模型)", ""));
                    } else {
                        upsModelList.forEach(m => domSpModel.appendChild(new Option(m, m)));
                    }
                    if (wSpModel && wSpModel.value) {
                        domSpModel.value = wSpModel.value;
                    } else if (upsModelList.length > 0) {
                        domSpModel.value = upsModelList[0];
                        if (wSpModel) wSpModel.value = upsModelList[0];
                    }
                }
            });

            // 【核心计算】根据比例和像素自动计算宽高 (对齐32倍数)
            const updateDimensions = () => {
                const arParts = domAR.value.split(":");
                const arW = parseInt(arParts[0]) || 16;
                const arH = parseInt(arParts[1]) || 9;
                const mp = parseFloat(domMP.value) || 0.4;
                const totalPixels = mp * 1000000;
                
                // 保持比例求解宽高
                let w = Math.sqrt(totalPixels * (arW / arH));
                let h = w * (arH / arW);
                
                // H3 模型要求宽高必须是 32 的倍数
                w = Math.round(w / 32) * 32;
                h = Math.round(h / 32) * 32;
                
                if (wWidth) wWidth.value = w;
                if (wHeight) wHeight.value = h;
            };

            domAR.onchange = updateDimensions;
            domMP.onchange = updateDimensions;
            domFPS.onchange = () => { if (wFPS) wFPS.value = parseInt(domFPS.value) || 24; };
            domSteps.onchange = () => { if (wSteps) wSteps.value = parseInt(domSteps.value) || 8; };
            domSeed.onchange = () => { if (wSeed) wSeed.value = parseInt(domSeed.value) || 0; };
            domRand.onclick = () => {
                const ns = Math.floor(Math.random() * 1000000000);
                domSeed.value = ns;
                if (wSeed) wSeed.value = ns;
            };
            
            domSpChk.onchange = () => {
                if (wSpChk) wSpChk.value = domSpChk.checked;
                domSpPanel.style.display = domSpChk.checked ? "flex" : "none";
            };
            domSpModel.onchange = () => { if (wSpModel) wSpModel.value = domSpModel.value; };
            domSpSteps.onchange = () => { if (wSpSteps) wSpSteps.value = parseInt(domSpSteps.value) || 2; };

            // 恢复 UI 状态
            const setUIfromWidgets = () => {
                // 根据现有宽高反推一个大致比例
                if (wWidth && wHeight && wWidth.value && wHeight.value) {
                    const ratio = wWidth.value / wHeight.value;
                    if (Math.abs(ratio - 16/9) < 0.1) domAR.value = "16:9";
                    else if (Math.abs(ratio - 9/16) < 0.1) domAR.value = "9:16";
                    else if (Math.abs(ratio - 1) < 0.1) domAR.value = "1:1";
                    else if (Math.abs(ratio - 4/3) < 0.1) domAR.value = "4:3";
                    else if (Math.abs(ratio - 3/4) < 0.1) domAR.value = "3:4";
                    else domAR.value = "16:9"; // 兜底

                    const mp = (wWidth.value * wHeight.value) / 1000000;
                    domMP.value = parseFloat(mp.toFixed(2));
                }
                if (wSteps) domSteps.value = wSteps.value;
                if (wSeed) domSeed.value = wSeed.value;
                
                if (wSpChk) {
                    domSpChk.checked = wSpChk.value;
                    domSpPanel.style.display = wSpChk.value ? "flex" : "none";
                }
                if (wSpModel && wSpModel.value) domSpModel.value = wSpModel.value;
                if (wSpSteps) domSpSteps.value = wSpSteps.value;
                if (wFPS) domFPS.value = wFPS.value;
            };
            setUIfromWidgets();

            const onConfigure = this.onConfigure;
            this.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                requestAnimationFrame(setUIfromWidgets);
            };

            // 4. 设置合适的节点尺寸
            if (!this._isInitializedSize) {
                this._isInitializedSize = true;
                if (this.size[0] < 360) this.size[0] = 460; // 加宽节点
                if (this.size[1] < 320) this.size[1] = 320;
            }

            return r;
        };
    }
});