// Modified by aihaipan (2026-09). Licensed under GPL-3.0-or-later.
// 【L2-d】MiniMax H3 Finite Segment 桥接器前端扩展
// 提供"段间引导"面板：显示 summary 摘要 + 甘特图 + 拖拽重叠调整。

import { app } from "/scripts/app.js";

const NODE = "MiniMaxH3FiniteBridgeGH";

function make(tag, css = {}, text = "") {
    const el = document.createElement(tag);
    Object.assign(el.style, css);
    if (text) el.textContent = text;
    return el;
}

function createPanel(node) {
    if (typeof node.addDOMWidget !== "function") {
        console.warn("[GH-Bridge] addDOMWidget not available");
        return false;
    }

        // 主容器
    const root = make("div", {
        width: "100%",
        boxSizing: "border-box",
        color: "#d7e3ef",
        fontFamily: "Arial,sans-serif",
        fontSize: "12px",
        padding: "4px 0",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    });

    // 【L2-d·A5】拖动状态 + 统一重叠读取
    const DEFAULT_OV = 24;
    let liveOverlaps = null;   // 拖动中的临时 overlaps
    let dragState = null;      // 拖动状态

    function getEffectiveOverlaps(segCount) {
        if (liveOverlaps && liveOverlaps.length === segCount) {
            return liveOverlaps.slice();
        }
        let parsed = parseOverlaps();
        if (!parsed || parsed.length !== segCount) {
            return Array.from({ length: segCount }, (_, i) => i === 0 ? 0 : DEFAULT_OV);
        }
        return parsed.map((v, i) => i === 0 ? 0 : v);
    }

    // 摘要面板
    const summaryPanel = make("div", {
        padding: "8px 10px",
        background: "#0f1a24",
        border: "1px solid #2c4255",
        borderRadius: "6px",
        fontFamily: "Consolas, Menlo, monospace",
        fontSize: "11px",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap",
        color: "#a9bac8",
    });
    summaryPanel.textContent = "段间引导加载中...";
    root.appendChild(summaryPanel);

    // 渲染函数（挂在 node 上供轮询调用）
    const H3_FPS = 24;

    function widgetVal(name, fallback) {
        const w = node.widgets?.find(w => w.name === name);
        return w ? w.value : fallback;
    }

    function readSourceData() {
        const input = node.inputs?.find(i => i.name === "segments_json");
        if (!input?.link) return null;
        const link = app.graph.links?.[input.link];
        if (!link) return null;
        const srcNode = app.graph.getNodeById?.(link.origin_id);
        if (!srcNode || typeof srcNode.__ghupoBridgeData !== "function") return null;
        try {
            return srcNode.__ghupoBridgeData();
        } catch (e) {
            console.warn("[GH-Bridge] read source data failed:", e);
            return null;
        }
    }

    function parseOverlaps() {
        const raw = String(widgetVal("bridge_overlaps", "") || "").trim();
        if (!raw) return null;
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr.map(x => Math.max(0, Math.floor(Number(x) || 0)));
        } catch {}
        return null;
    }

    function renderSummary() {
        const data = readSourceData();
        if (!data) {
            summaryPanel.textContent = "（等待万能节点连接 segments_json…）";
            return;
        }
        if (data.viewMode !== "video") {
            summaryPanel.textContent = "（图片模式，无段间引导）";
            return;
        }
        const segs = data.segments || [];
        const segCount = segs.length;
        const w = Number(widgetVal("width", 864)) || 864;
        const h = Number(widgetVal("height", 480)) || 480;
        const mc = data.mediaCounts || { images: 0, videos: 0, audios: 0 };
        const audioMode = String(widgetVal("audio_mode", "reference"));

        // 重叠：从统一函数读
        const overlaps = getEffectiveOverlaps(segCount);
        const totalOverlap = overlaps.reduce((a, b) => a + b, 0);

        // 帧数计算
        let totalFrames = 0;
        const frameList = segs.map(s => {
            const sec = Number(s.duration) || 5;
            const frames = Math.round((sec * H3_FPS) / 17) * 17 + 5;
            totalFrames += frames;
            return frames;
        });
        const outputFrames = Math.max(0, totalFrames - totalOverlap);

        const lines = [
            `模式: ${segCount <= 1 ? "单段" : `多段 (${segCount} 段)`}`,
            `分辨率: ${w}x${h}`,
            `素材池: ${mc.images} 张图, ${mc.audios} 个音频 (${audioMode})`,
            `段间重叠: 共 ${totalOverlap} 帧`,
            `总帧数: ${totalFrames} 帧 → 扣重叠 ${totalOverlap} 帧 = ${outputFrames} 帧 (${(outputFrames / H3_FPS).toFixed(2)}s)`,
        ];
        summaryPanel.textContent = lines.join("\n");
    }

    // ---- 甘特图容器 ----
    const ganttWrap = make("div", {
        background: "#0f1a24",
        border: "1px solid #2c4255",
        borderRadius: "6px",
        overflow: "hidden",
        display: "none",
    });
    // 【L2-d 对齐修复】刻度尺拆成 [52px 占位] + [刻度容器]，跟段块行的结构一致
    const ganttRuler = make("div", {
        display: "flex",
        height: "20px",
        background: "#0a141d",
        borderBottom: "1px solid #1e3344",
        overflow: "hidden",
    });
    const ganttRulerLeft = make("div", {
        flex: "0 0 52px",
        borderRight: "1px solid #1e3344",
        background: "#0a141d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        font: "9px/1.15 Arial",
        color: "#6f8291",
        textAlign: "center",
        padding: "0 2px",
        boxSizing: "border-box",
    });
    const ganttRulerLeftL1 = make("div", {}, "各段");
    const ganttRulerLeftL2 = make("div", {}, "重叠帧");
    ganttRulerLeft.append(ganttRulerLeftL1, ganttRulerLeftL2);
    const ganttRulerInner = make("div", {
        flex: "1",
        position: "relative",
        overflow: "hidden",
    });
    ganttRuler.append(ganttRulerLeft, ganttRulerInner);
    const ganttBody = make("div", {
        position: "relative",
        overflowY: "auto",
        maxHeight: "320px",
    });
    // ---- 【L3 二采】面板 ----
    const spPanel = make("div", {
        marginTop: "6px",
        padding: "8px 10px",
        background: "#0f1a24",
        border: "1px solid #2c4255",
        borderRadius: "6px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        font: "11px/1.4 Arial",
        color: "#a9bac8",
    });
    const spHeader = make("div", {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        color: "#cdf0f7",
        fontWeight: "600",
        fontSize: "11px",
    }, "二采 · 画质提升");
    const spToggle = make("input", { cursor: "pointer" });
    spToggle.type = "checkbox";
    const spToggleLabel = make("label", {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        cursor: "pointer",
    });
    spToggleLabel.append(spToggle, make("span", {}, "开启二采"));
    const spRowModel = make("div", { display: "flex", alignItems: "center", gap: "6px" });
    spRowModel.append(make("span", { flex: "0 0 62px", color: "#6f8291" }, "二采模型"));
    const spModelSelect = make("select", {
        flex: "1",
        height: "22px",
        background: "#14202c",
        color: "#cdf0f7",
        border: "1px solid #2c4255",
        borderRadius: "3px",
        padding: "0 4px",
        font: "11px Arial",
    });
    spModelSelect.title = "H3 3D latent 放大权重。\n放到 ComfyUI/models/latent_upscale_models/，\n文件名含 3d（如 minimax_h3_latent_upscaler_3d_*.safetensors）。";
    spRowModel.append(spModelSelect);
    const spRowSteps = make("div", { display: "flex", alignItems: "center", gap: "6px" });
    spRowSteps.append(make("span", { flex: "0 0 62px", color: "#6f8291" }, "高清步数"));
    const spStepsInput = make("input", {
        width: "60px",
        height: "22px",
        background: "#14202c",
        color: "#cdf0f7",
        border: "1px solid #2c4255",
        borderRadius: "3px",
        padding: "0 6px",
        font: "11px Consolas,Menlo,monospace",
        textAlign: "center",
    });
    spStepsInput.type = "number";
    spStepsInput.min = "1";
    spStepsInput.max = "99";
    spStepsInput.value = "2";
    spStepsInput.title = "二采在高分辨率 latent 上执行的步数。推荐 2。";
    spRowSteps.append(spStepsInput);
    const spHint = make("div", {
        font: "10px/1.4 Arial",
        color: "#6f8291",
        marginTop: "2px",
    }, "💡 二采用更少步数在一采 latent 上做精修，画质更好但耗时更长。");
    spPanel.append(spHeader, spToggleLabel, spRowModel, spRowSteps, spHint);
    root.appendChild(spPanel);

    const ganttHint = make("div", {
        padding: "6px 10px",
        font: "10px/1.4 Arial",
        color: "#6f8291",
        background: "#0a141d",
        borderTop: "1px solid #1e3344",
    }, "💡 拖动色块调整重叠。0 = 硬切，越大越平滑。推荐 24 帧。");
        // 【L3 段间引导】标题栏 + 可收起
    const ganttHeader = make("div", {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 8px",
        background: "#1a2a38",
        cursor: "pointer",
        userSelect: "none",
        font: "11px/1 Arial",
    });
    const ganttTitle = make("span", { color: "#cdf0f7", fontWeight: "600" }, "段间引导");
    const ganttMeta = make("span", { color: "#6f8291", marginLeft: "auto", fontSize: "10px" });
    const ganttToggle = make("span", { color: "#6f8291", fontSize: "11px", padding: "0 2px" }, "▾");
    ganttHeader.append(ganttTitle, ganttMeta, ganttToggle);

    const ganttInner = make("div", { display: "flex", flexDirection: "column" });
    ganttInner.append(ganttRuler, ganttBody, ganttHint);

    ganttWrap.append(ganttHeader, ganttInner);

    // 【L3 段间引导】默认收起 + 用户点击状态持久化（localStorage）
    const GANTT_STORAGE_KEY = "gh_bridge_gantt_collapsed_" + (node.id ?? "default");
    function loadGanttCollapsed() {
        try {
            const raw = localStorage.getItem(GANTT_STORAGE_KEY);
            if (raw === "0") return false;  // 展开
            if (raw === "1") return true;   // 收起
        } catch {}
        return true;  // 默认收起
    }
    function saveGanttCollapsed(v) {
        try { localStorage.setItem(GANTT_STORAGE_KEY, v ? "1" : "0"); } catch {}
    }

    let ganttCollapsed = loadGanttCollapsed();
    ganttInner.style.display = ganttCollapsed ? "none" : "";
    ganttToggle.textContent = ganttCollapsed ? "▸" : "▾";
    ganttHeader.onclick = () => {
        ganttCollapsed = !ganttCollapsed;
        ganttInner.style.display = ganttCollapsed ? "none" : "";
        ganttToggle.textContent = ganttCollapsed ? "▸" : "▾";
        saveGanttCollapsed(ganttCollapsed);
        node.setDirtyCanvas?.(true, true);
    };
    root.appendChild(ganttWrap);
    root.appendChild(spPanel);  // 【修复】spPanel 重新 append，DOM 移到末尾;

    // ---- 甘特图渲染 ----
    function renderGantt() {
        const data = readSourceData();
        if (!data || data.viewMode !== "video") {
            ganttWrap.style.display = "none";
            return;
        }
        const segs = data.segments || [];
        if (!segs.length) {
            ganttWrap.style.display = "none";
            return;
        }
        ganttWrap.style.display = "";

        // 重叠：从统一函数读
        const overlaps = getEffectiveOverlaps(segs.length);

        // 【L2-d·帧刻度】计算每段起止（帧）：段i 起点 = 累积位置 - 本段重叠
        const rows = [];
        let cursor = 0;
        for (let i = 0; i < segs.length; i++) {
            const dur = Number(segs[i].duration) || 5;
            const fl = Math.round((dur * H3_FPS - 5) / 17) * 17 + 5;
            const ov = overlaps[i] || 0;
            const start = i === 0 ? 0 : cursor - ov;
            const end = start + fl;
            rows.push({ start, end, fl, dur, ov, seg: segs[i], index: i });
            cursor = end;
        }
        const totalRange = cursor || 1;

        // 【L2-d·帧刻度】刻度尺：以帧为单位
        ganttRulerInner.replaceChildren();
        const pxPerFrame = (ganttRulerInner.clientWidth || ganttBody.clientWidth || 300) / totalRange;
        // 【L2-d·帧刻度】步长候选加密 + 阈值降到 30px（更精细）
        const candidates = [6, 8, 12, 16, 24, 30, 36, 48, 60, 72, 96, 120, 144, 168, 192, 240, 360, 480, 720, 1200, 2400];
        let step = candidates[candidates.length - 1];
        for (const c of candidates) {
            if (c * pxPerFrame >= 30) { step = c; break; }
        }
        for (let t = 0; t <= totalRange + 1e-6; t += step) {
            const tick = make("div", {
                position: "absolute",
                left: (t / totalRange * 100) + "%",
                top: "0",
                height: "100%",
                borderLeft: "1px solid #1e3344",
                paddingLeft: "3px",
                font: "9px/20px Consolas,Menlo,monospace",
                color: "#5a7183",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                pointerEvents: "none",
            }, String(Math.round(t)));
            ganttRulerInner.appendChild(tick);
        }

        // 每段一行
        ganttBody.replaceChildren();
        for (const r of rows) {
            const row = make("div", {
                display: "flex",
                alignItems: "stretch",
                borderBottom: "1px solid #16283a",
                minHeight: "34px",
            });

            // 左侧：段号 + 重叠
            const left = make("div", {
                flex: "0 0 52px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRight: "1px solid #1e3344",
                background: "#0a141d",
                padding: "2px",
                font: "10px/1.2 Consolas,monospace",
            });
            const lbl = make("div", { color: r.seg.color || "#6f8291", fontWeight: "600" }, "段" + (r.index + 1));
            const ov = make("div", { color: "#cdf0f7", fontWeight: "600", fontSize: "11px" }, String(overlaps[r.index] || 0));
            ov.classList.add("gh-ov-num");
            ov.dataset.index = String(r.index);
            left.append(lbl, ov);
            row.appendChild(left);

            // 右侧：色块
            const right = make("div", {
                flex: "1",
                position: "relative",
                background: "#0f1a24",
            });
            const blockColor = r.seg.color || "#2c4255";
            const block = make("div", {
                position: "absolute",
                left: (r.start / totalRange * 100) + "%",
                width: (r.fl / totalRange * 100) + "%",
                top: "4px",
                bottom: "4px",
                border: "1px solid " + blockColor,
                borderRadius: "4px",
                background: blockColor + "22",
                boxSizing: "border-box",
                padding: "4px 6px",
                font: "10px/1.2 Arial",
                color: blockColor,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",  // 文字靠右，给左边斜纹让位
            });
            const textSpan = make("span", { pointerEvents: "none" }, r.fl + " 帧");
            block.appendChild(textSpan);

            // 【L2-d·重叠斜纹】段N 前 ov 帧区域 = 与前段的重叠区
            if (r.ov > 0 && r.fl > 0) {
                const ovPct = (r.ov / r.fl) * 100;
                // 斜纹叠加：左 ovPct% 宽，其余主体色
                block.style.background = `repeating-linear-gradient(45deg, rgba(255,215,107,.42), rgba(255,215,107,.42) 3px, rgba(255,215,107,.08) 3px, rgba(255,215,107,.08) 7px) left top / ${ovPct}% 100% no-repeat, ${blockColor}22`;
                // 斜纹区数字（空间够才显示）
                if (ovPct >= 6) {
                    const ovLabel = make("span", {
                        position: "absolute",
                        left: "0",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: ovPct + "%",
                        textAlign: "center",
                        font: "9px/1 Arial",
                        color: "#ffd76b",
                        fontWeight: "700",
                        pointerEvents: "none",
                        boxSizing: "border-box",
                    }, String(r.ov));
                    block.appendChild(ovLabel);
                }
            }

            // 【L2-d·A5 修复】色块打标记，事件由 ganttBody 委托处理
            block.classList.add("gh-block");
            block.dataset.index = String(r.index);
            if (r.index > 0) {
                const isDragging = dragState && dragState.index === r.index;
                block.style.cursor = isDragging ? "grabbing" : "grab";
            }
            right.appendChild(block);
            row.appendChild(right);
            ganttBody.appendChild(row);
        }
        // 【L3 段间引导】更新标题栏元信息
        const totalOv = overlaps.reduce((a, b) => a + b, 0);
        ganttMeta.textContent = `共 ${totalOv} 帧`;
    }

    // 【L2-d·A5 修复】pointerdown 事件委托到 ganttBody（不重建的父容器）
    ganttBody.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const block = e.target.closest(".gh-block");
        if (!block) return;
        const idx = Number(block.dataset.index);
        if (!Number.isFinite(idx) || idx <= 0) return;   // 段1 不可拖
        e.preventDefault();
        e.stopPropagation();
        // 从当前渲染快照恢复 overlaps + rows
        const data = readSourceData();
        if (!data) return;
        const segs = data.segments || [];
        const overlaps = getEffectiveOverlaps(segs.length);
        // 【L2-d·帧刻度】重算 rows（帧，与 renderGantt 一致）
        const rows = [];
        let cursor = 0;
        for (let i = 0; i < segs.length; i++) {
            const dur = Number(segs[i].duration) || 5;
            const fl = Math.round((dur * H3_FPS - 5) / 17) * 17 + 5;
            const ov = overlaps[i] || 0;
            const start = i === 0 ? 0 : cursor - ov;
            const end = start + fl;
            rows.push({ start, end, fl, dur });
            cursor = end;
        }
        const totalRange = cursor || 1;
        dragState = {
            index: idx,
            startX: e.clientX,
            pointerId: e.pointerId,
            origOverlaps: overlaps.slice(),
            origRows: rows,
            totalRange,
        };
        liveOverlaps = overlaps.slice();
        block.style.cursor = "grabbing";
        // pointer capture：让所有后续指针事件路由到此元素，避免被画布吃
        try { block.setPointerCapture(e.pointerId); } catch {}
    });

    function handlePointerMove(e) {
        if (!dragState) return;
        const ds = dragState;
        if (ds.pointerId !== e.pointerId) return;
        const dx = e.clientX - ds.startX;
        const timelineW = ganttRulerInner.clientWidth || 300;
        const pxPerFrame = timelineW / (ds.totalRange || 1);
        const deltaFrames = -dx / pxPerFrame;  // 左拖增加重叠

        const prev = ds.index > 0 ? ds.origRows[ds.index - 1] : null;
        const cur = ds.origRows[ds.index];
        const maxOverlap = Math.min(prev?.fl || 0, cur?.fl || 0);

        let newOv = (ds.origOverlaps[ds.index] || 0) + deltaFrames;
        newOv = Math.max(0, Math.min(maxOverlap, Math.round(newOv)));

        if (liveOverlaps[ds.index] === newOv) return;
        liveOverlaps[ds.index] = newOv;
        renderAll();
    }

    function handlePointerUp(e) {
        if (!dragState) return;
        const ds = dragState;
        if (ds.pointerId !== e.pointerId) return;
        // 写回 widget + 持久化
        const ovWidget = node.widgets?.find(w => w.name === "bridge_overlaps");
        if (ovWidget) {
            ovWidget.value = JSON.stringify(liveOverlaps);
        }
        node.setDirtyCanvas?.(true, true);
        try { node.onSerialize?.(); } catch {}
        dragState = null;
        liveOverlaps = null;
        renderAll();
    }

    function handlePointerCancel(e) {
        if (!dragState) return;
        dragState = null;
        liveOverlaps = null;
        renderAll();
    }

    // 【L2-d·A5 修复3】window 捕获阶段监听，绕过 ComfyUI canvas 在冒泡阶段的拦截
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerCancel, { capture: true });
    node.__ghBridgeDragCleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove, { capture: true });
        window.removeEventListener("pointerup", handlePointerUp, { capture: true });
        window.removeEventListener("pointercancel", handlePointerCancel, { capture: true });
    };

    // ---- 【L2-d·A5 修复3】拖动中"快渲染"：不重建 DOM，只更新位置 ----
    function renderGanttFast() {
        const data = readSourceData();
        if (!data || data.viewMode !== "video") return;
        const segs = data.segments || [];
        if (!segs.length) return;
        const overlaps = getEffectiveOverlaps(segs.length);
        // 【L2-d·帧刻度】重算 rows（帧为单位）
        const rows = [];
        let cursor = 0;
        for (let i = 0; i < segs.length; i++) {
            const dur = Number(segs[i].duration) || 5;
            const fl = Math.round((dur * H3_FPS - 5) / 17) * 17 + 5;
            const ov = overlaps[i] || 0;
            const start = i === 0 ? 0 : cursor - ov;
            const end = start + fl;
            rows.push({ start, end, fl, dur });
            cursor = end;
        }
        const totalRange = cursor || 1;
        // 更新 block 位置（不重建）
        ganttBody.querySelectorAll(".gh-block").forEach((b) => {
            const i = Number(b.dataset.index);
            const r = rows[i];
            if (!r) return;
            b.style.left = (r.start / totalRange * 100) + "%";
            b.style.width = (r.fl / totalRange * 100) + "%";
            b.textContent = r.fl + " 帧";
        });
        // 更新左侧数字
        ganttBody.querySelectorAll(".gh-ov-num").forEach((el) => {
            const i = Number(el.dataset.index);
            el.textContent = String(overlaps[i] || 0);
        });
        // 摘要也更新
        renderSummary();
    }

    // ---- 【L3 二采】UI 逻辑 ----
    // 【持久化修复】localStorage 备份（按 node.id 隔离，不跨工作流污染）
    const SP_STORAGE_KEY = "gh_bridge_sp_" + (node.id ?? "default");
    function saveSpToLocal() {
        try {
            localStorage.setItem(SP_STORAGE_KEY, JSON.stringify({
                enabled: spToggle.checked,
                model: spModelSelect.value || "",
                steps: Math.max(1, Math.min(99, parseInt(spStepsInput.value, 10) || 2)),
            }));
        } catch {}
    }
    function loadSpFromLocal() {
        try {
            const raw = localStorage.getItem(SP_STORAGE_KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (d && typeof d === "object") return d;
        } catch {}
        return null;
    }

    function readSpWidget(name, def) {
        const w = node.widgets?.find(w => w.name === name);
        return w ? String(w.value ?? def) : def;
    }
    function writeSpWidget(name, val) {
        const w = node.widgets?.find(w => w.name === name);
        if (w && String(w.value ?? "") !== String(val)) {
            w.value = String(val);
            try { w.callback?.call(w, String(val)); } catch {}
        }
    }
    function applySpEnableState() {
        const on = spToggle.checked;
        spModelSelect.disabled = !on;
        spStepsInput.disabled = !on;
        spPanel.style.opacity = on ? "1" : "0.55";
    }

    // 初始化：localStorage（用户最近操作）→ widget（workflow 保存）→ 默认
    const localSp = loadSpFromLocal();
    const widgetEnabled = readSpWidget("second_pass", "false") === "true";
    const widgetSteps = parseInt(readSpWidget("second_pass_high_steps", "2"), 10);
    const initSpEnabled = localSp?.enabled ?? widgetEnabled;
    const initSpSteps = localSp?.steps ?? widgetSteps;
    spToggle.checked = !!initSpEnabled;
    spStepsInput.value = String(Number.isFinite(initSpSteps) && initSpSteps >= 1 ? initSpSteps : 2);
    applySpEnableState();
    // 立即回写 widget，保证 workflow 未保存前也一致
    writeSpWidget("second_pass", spToggle.checked ? "true" : "false");
    writeSpWidget("second_pass_high_steps", spStepsInput.value);

    // fetch 模型列表 + 填充下拉
    (async () => {
        let models = [];
        let h3Compat = [];
        try {
            const r = await fetch("/minimax-bridge/upscalers", { cache: "no-store" });
            const data = await r.json();
            models = Array.isArray(data.models) ? data.models : [];
            h3Compat = Array.isArray(data.h3_compatible) ? data.h3_compatible : [];
        } catch (e) {
            console.warn("[GH-Bridge] failed to fetch upscalers:", e);
        }
        spModelSelect.replaceChildren();
        if (!models.length) {
            spModelSelect.append(new Option("（未找到模型，请查看提示）", ""));
            spModelSelect.disabled = true;
            spModelSelect.title = "未找到二采模型。\n请下载 minimax_h3_latent_upscaler_3d_bf16.safetensors\n并放入 ComfyUI/models/latent_upscale_models/";
            return;
        }
        // 排序：H3 兼容的置顶，其他按字母
        const sorted = [...h3Compat, ...models.filter(m => !h3Compat.includes(m)).sort()];
        for (const m of sorted) spModelSelect.append(new Option(m, m));
        // 默认选中：优先保存值 → 官方模型 → 第一个 H3 兼容 → 第一个
        const saved = readSpWidget("second_pass_model", "");
        const DEFAULT_NAME = "minimax_h3_latent_upscaler_3d_bf16.safetensors";
        let picked = "";
        if (saved && sorted.includes(saved)) picked = saved;
        else if (sorted.includes(DEFAULT_NAME)) picked = DEFAULT_NAME;
        else if (h3Compat.length) picked = h3Compat[0];
        else picked = sorted[0];
        spModelSelect.value = picked;
        writeSpWidget("second_pass_model", picked);
        saveSpToLocal();
        applySpEnableState();
    })();

    // 事件绑定
    spToggle.addEventListener("change", () => {
        writeSpWidget("second_pass", spToggle.checked ? "true" : "false");
        applySpEnableState();
        saveSpToLocal();
        node.setDirtyCanvas?.(true, true);
    });
    spModelSelect.addEventListener("change", () => {
        writeSpWidget("second_pass_model", spModelSelect.value);
        saveSpToLocal();
        node.setDirtyCanvas?.(true, true);
    });
    spStepsInput.addEventListener("input", () => {
        const v = Math.max(1, Math.min(99, parseInt(spStepsInput.value, 10) || 2));
        writeSpWidget("second_pass_high_steps", String(v));
        saveSpToLocal();
        node.setDirtyCanvas?.(true, true);
    });
    spStepsInput.addEventListener("blur", () => {
        const v = Math.max(1, Math.min(99, parseInt(spStepsInput.value, 10) || 2));
        spStepsInput.value = String(v);
        writeSpWidget("second_pass_high_steps", String(v));
        saveSpToLocal();
    });

    // ---- 首次渲染 + 轮询 ----
    function renderAll() {
        // 【L2-d·A5 修复3】拖动中走"快渲染"（不重建 DOM，pointer capture 不丢）
        if (dragState) {
            renderGanttFast();
        } else {
            renderGantt();
            renderSummary();
        }
    }
    renderAll();
    const pollTimer = setInterval(renderAll, 1000);
    node.__ghBridgePollTimer = pollTimer;
    node.__ghBridgeRenderAll = renderAll;

    // 【L3 audio_mode 汉化】值直接改中文（后端关键词归一化兜底）
    const amWidget = node.widgets?.find(w => w.name === "audio_mode");
    if (amWidget) {
        const ZH_REF = "参考音色";
        const ZH_LCK = "强制使用音频1";
        const OLD_MAP = { "reference": ZH_REF, "locked": ZH_LCK };
        amWidget.options = amWidget.options || {};
        amWidget.options.values = [ZH_REF, ZH_LCK];
        // 旧 workflow 兼容：英文值映射到中文
        if (OLD_MAP[amWidget.value]) amWidget.value = OLD_MAP[amWidget.value];
        // 兜底：值不在列表里 → 默认 reference
        if (![ZH_REF, ZH_LCK].includes(amWidget.value)) amWidget.value = ZH_REF;
        amWidget.callback?.(amWidget.value);
    }

    // 挂载 DOM widget
    const dw = node.addDOMWidget("gh_bridge_panel", "gh_bridge_panel", root, {
        serialize: false,
        hideOnZoom: false,
    });
    dw.options = dw.options || {};
    dw.options.serialize = false;
    dw.options.getMinHeight = () => root.scrollHeight || 100;

    // 首次创建时保证最小宽度
    if (!node.size || !node.size[0] || node.size[0] < 400) {
        node.size = [400, node.size?.[1] || 240];
    }
    node.setDirtyCanvas?.(true, true);
    return true;
}

app.registerExtension({
    name: "goohai.minimax_finite_bridge",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const prev = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = prev?.apply(this, arguments);
            if (!this._ghBridgeReady && createPanel(this)) {
                this._ghBridgeReady = true;
            }
            return r;
        };
    },
});