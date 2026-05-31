/// <reference types="three" />
/// <reference types="blockbench-types" />

import { tools, prompts } from "@/lib/factories";

// Import tool registration functions
import { registerCameraTools } from "./tools/camera";
import { registerAnimationTools } from "./tools/animation";
import { registerCubesTools } from "./tools/cubes";
import { registerElementTools } from "./tools/element";
import { registerImportTools } from "./tools/import";
import { registerMeshTools } from "./tools/mesh";
import { registerPaintTools } from "./tools/paint";
import { registerProjectTools } from "./tools/project";
import { registerTextureTools } from "./tools/texture";
import { registerUITools } from "./tools/ui";
import { registerUVTools } from "./tools/uv";
import { registerMaterialInstanceTools } from "./tools/material-instances";
import { registerArmatureTools } from "./tools/armature";
import { registerHistoryTools } from "./tools/history";
import { registerExportTools } from "./tools/export";
import { registerAJTools } from "./tools/aj";
import { registerNullObjectTools } from "./tools/null-object";

// Stage-II redesigned tools (server/tools/_redesign/)
import { registerRiskyEvalTool } from "./tools/_redesign/risky_eval";
import { registerInspectTool } from "./tools/_redesign/inspect";
import { registerAJVariantOpTool } from "./tools/_redesign/aj_variant_op";
import { registerNullObjectOpTool } from "./tools/_redesign/null_object_op";
import { registerHistoryOpTool } from "./tools/_redesign/history_op";
import { registerArmatureOpTool } from "./tools/_redesign/armature_op";

// Core resource registrations
import { registerValidatorResources } from "./resources/validator";

// All registration functions - MUST be used to prevent tree-shaking
const registrationFunctions = [
  registerAJTools,
  registerAnimationTools,
  registerArmatureTools,
  registerCameraTools,
  registerCubesTools,
  registerElementTools,
  registerExportTools,
  registerHistoryTools,
  registerImportTools,
  registerMaterialInstanceTools,
  registerMeshTools,
  registerNullObjectTools,
  registerPaintTools,
  registerProjectTools,
  registerTextureTools,
  registerUITools,
  registerUVTools,
  // Stage-II redesigned tools
  registerRiskyEvalTool,
  registerInspectTool,
  registerAJVariantOpTool,
  registerNullObjectOpTool,
  registerHistoryOpTool,
  registerArmatureOpTool,
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
