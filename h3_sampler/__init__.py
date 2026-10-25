import nodes
from comfy_api.latest import ComfyExtension

from .director_core import UniversalTimelineEncoder, UniversalH3TimelineEncoderWithRefMod
from .segment_sampler import (
    UniversalSegmentSampler,
    UniversalH3LatentUpscale,
    UniversalSaveLatent,
    UniversalLoadLatent,
    MiniMaxH3FiniteLatentContinuation,
    MiniMaxH3FiniteAudioTrimTail,
    MiniMaxH3FiniteOutputTrim,
    MiniMaxH3FiniteSegmentFinalize,
    MiniMaxH3FiniteImageJoin,
    MiniMaxH3FiniteDecodeTiledHalf,
    MiniMaxH3FiniteStageTimerStart,
    MiniMaxH3FiniteStageTimerFinish,
    MiniMaxH3FiniteDecodeAudio,
    MiniMaxH3LockedAudioSlice,
    MiniMaxH3SilentAudioSlice,
    MiniMaxH3LockAudioLatent,
    MiniMaxH3LockedAudioMaster,
    MiniMaxH3SilentAudioMaster,
)
# 引入二采相关的底层节点
from .selflift_runtime.nodes import (
    SelfLiftH3Sampler,
    SelfLiftImageSampler,
    SelfLiftH3TST,
)

# 运行时用到的内部节点，只注入到后端，不给前端看，防黑屏
_INTERNAL_MAPPINGS = {
    "UniversalH3TimelineEncoder": UniversalTimelineEncoder,
    "UniversalH3TimelineEncoderWithRefMod": UniversalH3TimelineEncoderWithRefMod,
    "UniversalH3SegmentSampler": UniversalSegmentSampler,
     "UniversalH3LatentUpscale": UniversalH3LatentUpscale,
     "UniversalSaveLatent": UniversalSaveLatent,
    "UniversalLoadLatent": UniversalLoadLatent,
    "UniversalH3FiniteLatentContinuation": MiniMaxH3FiniteLatentContinuation,
    "UniversalH3FiniteAudioTrimTail": MiniMaxH3FiniteAudioTrimTail,
    "UniversalH3FiniteOutputTrim": MiniMaxH3FiniteOutputTrim,
    "UniversalH3FiniteSegmentFinalize": MiniMaxH3FiniteSegmentFinalize,
    "UniversalH3FiniteImageJoin": MiniMaxH3FiniteImageJoin,
    "UniversalH3FiniteDecodeTiledHalf": MiniMaxH3FiniteDecodeTiledHalf,
    "UniversalH3FiniteStageTimerStart": MiniMaxH3FiniteStageTimerStart,
    "UniversalH3FiniteStageTimerFinish": MiniMaxH3FiniteStageTimerFinish,
    "UniversalH3FiniteDecodeAudio": MiniMaxH3FiniteDecodeAudio,
    "UniversalH3LockedAudioSlice": MiniMaxH3LockedAudioSlice,
    "UniversalH3SilentAudioSlice": MiniMaxH3SilentAudioSlice,
    "UniversalH3LockAudioLatent": MiniMaxH3LockAudioLatent,
    "UniversalH3LockedAudioMaster": MiniMaxH3LockedAudioMaster,
    "UniversalH3SilentAudioMaster": MiniMaxH3SilentAudioMaster,
    # 二采节点加入运行时暗网
    "UniversalH3TimelineSelfLiftSampler": SelfLiftH3Sampler,
    "UniversalSelfLiftImageSampler": SelfLiftImageSampler,
    "UniversalSelfLiftH3TST": SelfLiftH3TST,
}

def inject_internal_nodes():
    """动态注入内部节点，规避 ComfyUI 前端解析 V3 节点黑屏的问题"""
    nodes.NODE_CLASS_MAPPINGS.update(_INTERNAL_MAPPINGS)

class UniversalH3SamplerExtension(ComfyExtension):
    async def get_node_list(self):
        # 只给前端暴露主采样器
        return [UniversalSegmentSampler]

__all__ = ["UniversalH3SamplerExtension", "inject_internal_nodes"]