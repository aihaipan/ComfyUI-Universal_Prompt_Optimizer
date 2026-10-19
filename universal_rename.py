import os
import re

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# ==========================================
# 1. 物理文件名重命名规则
# ==========================================
RENAME_FILES = {
    "h3_sampler/experimental_latent_guide.py": "h3_sampler/latent_guide.py",
    "h3_sampler/drift_control_av.py": "h3_sampler/drift_control.py",
    "h3_sampler/minimax_h3_timeline_director.py": "h3_sampler/director_core.py",
    "h3_sampler/minimax_h3_finite_segments.py": "h3_sampler/segment_sampler.py",
}

# ==========================================
# 2. 文本内容替换规则
# (按照你的逻辑：保留 MiniMaxH3，但剔除原作者特定命名和GH)
# ==========================================
REPLACE_RULES = [
    # 2.1 清理物理导入路径
    ("experimental_latent_guide", "latent_guide"),
    ("drift_control_av", "drift_control"),
    ("minimax_h3_timeline_director", "director_core"),
    ("minimax_h3_finite_segments", "segment_sampler"),
    
    # 2.2 清理原作者特定的节点 ID 与类名 (保留 MiniMaxH3 模型名)
    ("MiniMaxH3TimelineEncoder", "UniversalTimelineEncoder"),
    ("MiniMaxH3TimelineDirector", "UniversalTimelineDirector"),
    ("MiniMaxH3TimelinePlanner", "UniversalTimelinePlanner"),
    ("MiniMaxH3OmniPromptBridge", "UniversalOmniPromptBridge"),
    ("MiniMaxH3AddLatentGuide", "UniversalAddLatentGuide"),
    ("MiniMaxH3VisualDifference", "UniversalVisualDifference"),
    ("MiniMaxH3FiniteSegmentSampler", "UniversalSegmentSampler"),
    ("MiniMaxH3FiniteBridgeGH", "UniversalFiniteBridge"),
    ("MiniMaxH3R2VBridgeGH", "UniversalR2VBridge"),
    
    # 2.3 彻底清理 GH 遗留类型（插头类型）
    ("GH_MEDIA_BUNDLE", "UNIVERSAL_MEDIA_BUNDLE"),
    ("GH_PROMPT_STR", "UNIVERSAL_PROMPT_STR"),
    ("GH_SEGMENTS_STR", "UNIVERSAL_SEGMENTS_STR"),
    
    # 2.4 清理前端 JS 中的原作者标记
    ("goohai.universal_director_ui_max", "universal.director_ui_max"),
    ("goohai.universal_prompt_optimizer", "universal.prompt_optimizer"),
]

# ==========================================
# 3. 执行逻辑
# ==========================================

def step1_rename_files():
    print(">>> 第一步：正在重命名物理文件...")
    for old_path, new_path in RENAME_FILES.items():
        old_full = os.path.join(ROOT_DIR, old_path)
        new_full = os.path.join(ROOT_DIR, new_path)
        if os.path.exists(old_full):
            if os.path.exists(new_full):
                os.remove(new_full) # 如果目标存在，先删掉，防冲突
            os.rename(old_full, new_full)
            print(f"  [OK] {old_path} -> {new_path}")
        else:
            print(f"  [跳过] {old_path} 不存在（可能已经改过了）")

def step2_replace_contents():
    print("\n>>> 第二步：正在扫描并替换代码内容...")
    count = 0
    for root, dirs, files in os.walk(ROOT_DIR):
        # 忽略 .git 和缓存目录
        if ".git" in root or "__pycache__" in root:
            continue
            
        for file in files:
            if not (file.endswith(".py") or file.endswith(".js")):
                continue
                
            filepath = os.path.join(root, file)
            
            # 跳过当前脚本自己
            if filepath == os.path.abspath(__file__):
                continue

            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            original_content = content
            for old_str, new_str in REPLACE_RULES:
                content = content.replace(old_str, new_str)

            if content != original_content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  [修改] {os.path.relpath(filepath, ROOT_DIR)}")
                count += 1
                
    print(f"\n>>> 替换完成！共修改了 {count} 个文件。")

if __name__ == "__main__":
    print("=" * 50)
    print(" Universal 生态去原作者化 - 一键清理脚本")
    print("=" * 50)
    step1_rename_files()
    step2_replace_contents()
    print("=" * 50)
    print(" 全部完成！请重启 ComfyUI 并在画布上重新拉取节点。")
    input("\n>>> 脚本执行完毕，请按回车键退出...")