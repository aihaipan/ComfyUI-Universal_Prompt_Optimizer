from comfy_api.latest import ComfyExtension as _ComfyExtension
from . import prompt_optimizer as _prompt_optimizer
from .universal_prompt_node import UniversalPromptOptimizerExtension as _universal_extension
from .minimax_r2v_bridge import MiniMaxH3R2VBridgeExtension as _bridge_extension
from .minimax_finite_bridge import MiniMaxH3FiniteBridgeExtension as _finite_bridge_extension


class _CombinedExtension(_ComfyExtension):
    async def get_node_list(self):
        result = list(await _universal_extension().get_node_list())
        result.extend(await _bridge_extension().get_node_list())
        result.extend(await _finite_bridge_extension().get_node_list())
        return result


def comfy_entrypoint():
    _prompt_optimizer.register_prompt_optimizer_routes()
    return _CombinedExtension()


WEB_DIRECTORY = "./web"

__all__ = ["comfy_entrypoint"]