import { z } from "zod";
import type { ToolSpec, PromptSpec, ResourceSpec } from "../lib/factories";

// Tool docs imports — each file exports schemas at module level with zero Blockbench deps.
// Files whose registrations are fully replaced by Stage-II _redesign/ tools are NOT imported
// here (the .ts files stay in repo as inventory but their toolDocs aren't manifested).
// Currently dropped: armature / null-object / history / cubes / uv / material-instances.
// Partial-OFF files (element / mesh / texture / paint) expose Keep / Off derived
// toolDocs arrays — only the Keep arrays are manifested. See 14- § 3.4.1.
import { cameraToolDocs } from "../server/tools/camera";
import { elementKeepToolDocs } from "../server/tools/element";
import { importToolDocs } from "../server/tools/import";
import { meshKeepToolDocs } from "../server/tools/mesh";
import { paintKeepToolDocs } from "../server/tools/paint";
import { projectToolDocs } from "../server/tools/project";
import { textureKeepToolDocs } from "../server/tools/texture";
import { animationToolDocs } from "../server/tools/animation";
import { uiToolDocs } from "../server/tools/ui";
import { exportToolDocs } from "../server/tools/export";
import { ajToolDocs } from "../server/tools/aj";

// Stage-II redesigned tools
import { riskyEvalToolDocs } from "../server/tools/_redesign/risky_eval";
import { inspectToolDocs } from "../server/tools/_redesign/inspect";
import { ajVariantOpToolDocs } from "../server/tools/_redesign/aj_variant_op";
import { nullObjectOpToolDocs } from "../server/tools/_redesign/null_object_op";
import { historyOpToolDocs } from "../server/tools/_redesign/history_op";
import { armatureOpToolDocs } from "../server/tools/_redesign/armature_op";
import { armatureBoneOpToolDocs } from "../server/tools/_redesign/armature_bone_op";
import { vertexWeightOpToolDocs } from "../server/tools/_redesign/vertex_weight_op";
import { materialInstanceOpToolDocs } from "../server/tools/_redesign/material_instance_op";
import { cubeOpToolDocs } from "../server/tools/_redesign/cube_op";
import { meshPrimitiveOpToolDocs } from "../server/tools/_redesign/mesh_primitive_op";
import { meshUvOpToolDocs } from "../server/tools/_redesign/mesh_uv_op";
import { materialOpToolDocs } from "../server/tools/_redesign/material_op";
import { brushPresetOpToolDocs } from "../server/tools/_redesign/brush_preset_op";
import { selectionOpToolDocs } from "../server/tools/_redesign/selection_op";

export interface CategoryGroup {
  category: string;
  tools: ToolSpec[];
}

export const toolManifest: CategoryGroup[] = [
  { category: "Inspect (Stage II)", tools: inspectToolDocs },
  { category: "Animated Java", tools: [...ajToolDocs, ...ajVariantOpToolDocs] },
  { category: "Cubes", tools: [...cubeOpToolDocs] },
  { category: "Camera & Screenshots", tools: cameraToolDocs },
  { category: "Animation", tools: animationToolDocs },
  { category: "Armature", tools: [...armatureOpToolDocs, ...armatureBoneOpToolDocs, ...vertexWeightOpToolDocs] },
  { category: "Elements", tools: [...elementKeepToolDocs, ...selectionOpToolDocs] },
  { category: "Export", tools: exportToolDocs },
  { category: "History", tools: [...historyOpToolDocs] },
  { category: "Import/Export", tools: importToolDocs },
  { category: "Material Instances", tools: [...materialInstanceOpToolDocs] },
  { category: "Mesh Editing", tools: [...meshKeepToolDocs, ...meshPrimitiveOpToolDocs] },
  { category: "Null Objects / IK", tools: [...nullObjectOpToolDocs] },
  { category: "Paint Tools", tools: [...paintKeepToolDocs, ...brushPresetOpToolDocs] },
  { category: "Project", tools: projectToolDocs },
  { category: "Textures", tools: [...textureKeepToolDocs, ...materialOpToolDocs] },
  { category: "UI Interaction", tools: [...uiToolDocs, ...riskyEvalToolDocs] },
  { category: "UV Mapping", tools: [...meshUvOpToolDocs] },
];

// Prompt specs defined inline — server/prompts.ts uses macros that complicate direct import
export const promptDocs: PromptSpec[] = [
  {
    name: "blockbench_native_apis",
    description:
      "Essential information about Blockbench v5.0 native API security model and requireNativeModule() usage. Use this when working with Node.js modules, file system access, or native APIs in Blockbench plugins.",
    status: "stable",
  },
  {
    name: "blockbench_code_eval_safety",
    description:
      "Critical safety guide for agents using code evaluation/execution tools with Blockbench v5.0+. Contains breaking changes, quick reference, common mistakes, and safe code patterns for native module usage.",
    status: "stable",
  },
  {
    name: "model_creation_strategy",
    title: "Model Creation Strategy",
    description: "A strategy for creating a new 3D model in Blockbench.",
    argsSchema: z.object({
      format: z
        .enum(["java_block", "bedrock"])
        .optional()
        .describe("Target model format."),
      approach: z
        .enum(["ui", "programmatic", "import"])
        .optional()
        .describe("Creation approach to use."),
    }),
    status: "stable",
  },
];

// Resource specs defined inline — server/resources.ts uses Blockbench globals at module level
export const resourceDocs: ResourceSpec[] = [
  {
    name: "projects",
    uriTemplate: "projects://{id}",
    title: "Blockbench Projects",
    description:
      "Returns information about available projects. List URIs use the slugified project name (e.g. `projects://my-character`) when unique, or `projects://<slug>~<uuid-prefix>` on collision. Reads accept UUID, exact name, or slug.",
  },
  {
    name: "nodes",
    uriTemplate: "nodes://{id}",
    title: "Blockbench Nodes",
    description:
      "Returns the current 3D nodes in the editor. List URIs use slugified names (e.g. `nodes://head`) when unique, with `~<uuid-prefix>` on collision. Reads accept UUID, exact name, or slug.",
  },
  {
    name: "textures",
    uriTemplate: "textures://{id}",
    title: "Blockbench Textures",
    description:
      "Returns information about textures. List URIs use slugified names (e.g. `textures://skin`) when unique, with `~<uuid-prefix>` on collision. Reads accept UUID, exact name, slug, or short numeric texture id.",
  },
  {
    name: "reference_models",
    uriTemplate: "reference_models://{id}",
    title: "Reference Models",
    description:
      "Returns reference models in the current project. Requires the Reference Models plugin. List URIs use slugified names (e.g. `reference_models://turntable`) with `~<uuid-prefix>` on collision. Reads accept UUID, exact name, or slug.",
  },
  {
    name: "validator-status",
    uriTemplate: "validator://status",
    title: "Validator Status",
    description:
      "Returns the current validation status including error/warning counts and a summary of all problems.",
  },
  {
    name: "validator-checks",
    uriTemplate: "validator://checks/{id}",
    title: "Validator Checks",
    description:
      "Returns information about registered validator checks. Use without an ID to list all checks, or provide a check ID to get details about a specific check.",
  },
  {
    name: "validator-warnings",
    uriTemplate: "validator://warnings",
    title: "Validator Warnings",
    description:
      "Returns all current validation warnings with element references where available.",
  },
  {
    name: "validator-errors",
    uriTemplate: "validator://errors",
    title: "Validator Errors",
    description:
      "Returns all current validation errors with element references where available.",
  },
];
