/// <reference types="three" />
/// <reference types="blockbench-types" />

import { tools, prompts } from "@/lib/factories";

// Import tool registration functions
// Legacy registrations fully replaced by Stage-II _redesign/ tools are NOT imported
// here (the source files stay in repo as inventory but are no longer registered).
// Currently dropped: armature / null-object / history / cubes / uv / material-instances.
// Phase 3.3 (= 14- § 3.4.2): the Keep halves of aj/element/mesh/paint/texture are
// now also dropped — their behaviour is fully covered by the new *_op aggregators
// in _redesign/. The source files stay in repo as inventory.
import { registerCameraTools } from "./tools/camera";
import { registerAnimationTools } from "./tools/animation";
import { registerImportTools } from "./tools/import";
import { registerProjectTools } from "./tools/project";
import { registerUITools } from "./tools/ui";
import { registerExportTools } from "./tools/export";

// Stage-II redesigned tools (server/tools/_redesign/)
import { registerRiskyEvalTool } from "./tools/_redesign/risky_eval";
import { registerInspectTool } from "./tools/_redesign/inspect";
import { registerAJVariantOpTool } from "./tools/_redesign/aj_variant_op";
import { registerNullObjectOpTool } from "./tools/_redesign/null_object_op";
import { registerHistoryOpTool } from "./tools/_redesign/history_op";
import { registerArmatureOpTool } from "./tools/_redesign/armature_op";
import { registerArmatureBoneOpTool } from "./tools/_redesign/armature_bone_op";
import { registerVertexWeightOpTool } from "./tools/_redesign/vertex_weight_op";
import { registerMaterialInstanceOpTool } from "./tools/_redesign/material_instance_op";
import { registerCubeOpTool } from "./tools/_redesign/cube_op";
import { registerMeshPrimitiveOpTool } from "./tools/_redesign/mesh_primitive_op";
import { registerMeshUvOpTool } from "./tools/_redesign/mesh_uv_op";
import { registerMaterialOpTool } from "./tools/_redesign/material_op";
import { registerBrushPresetOpTool } from "./tools/_redesign/brush_preset_op";
import { registerSelectionOpTool } from "./tools/_redesign/selection_op";
import { registerAJBlueprintSettingsOpTool } from "./tools/_redesign/aj_blueprint_settings_op";
import { registerElementOpTool } from "./tools/_redesign/element_op";
import { registerTextureOpTool } from "./tools/_redesign/texture_op";
import { registerMeshEditOpTool } from "./tools/_redesign/mesh_edit_op";
import { registerPaintToolOpTool } from "./tools/_redesign/paint_tool_op";

// Core resource registrations
import { registerValidatorResources } from "./resources/validator";

// All registration functions - MUST be used to prevent tree-shaking
const registrationFunctions = [
  registerAnimationTools,
  registerCameraTools,
  registerExportTools,
  registerImportTools,
  registerProjectTools,
  registerUITools,
  // Stage-II redesigned tools
  registerRiskyEvalTool,
  registerInspectTool,
  registerAJVariantOpTool,
  registerNullObjectOpTool,
  registerHistoryOpTool,
  registerArmatureOpTool,
  registerArmatureBoneOpTool,
  registerVertexWeightOpTool,
  registerMaterialInstanceOpTool,
  registerCubeOpTool,
  registerMeshPrimitiveOpTool,
  registerMeshUvOpTool,
  registerMaterialOpTool,
  registerBrushPresetOpTool,
  registerSelectionOpTool,
  registerAJBlueprintSettingsOpTool,
  registerElementOpTool,
  registerTextureOpTool,
  registerMeshEditOpTool,
  registerPaintToolOpTool,
  registerValidatorResources,
];

// Register all core tools immediately when this module loads
for (const register of registrationFunctions) {
  register();
}

// Function to get tool count - called at runtime after registration
export function getToolCount(): number {
  return Object.keys(tools).length;
}

// Re-export tools and prompts for use by other modules
export { tools, prompts };
