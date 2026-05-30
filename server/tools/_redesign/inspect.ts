/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  ok,
  err,
  wrap,
  safeStringify,
  INSPECT_TRUNCATE,
  type ToolResponse,
  type WrappedToolResult,
} from "./_response";

// ============================================================================
// Schema
// ============================================================================
// One Zod object with a `target` discriminator + all optional filters across
// all targets. Per-target validation lives inside the dispatcher; bundling
// every field here keeps the JSON Schema flat for the doc generator.

const TARGETS = [
  "outline",
  "find",
  "selection",
  "by_material",
  "armatures",
  "bones",
  "null_objects",
  "rig",
  "variants",
  "settings",
  "anim_mapping",
  "textures",
  "materials",
  "material_instances",
  "history",
  "project",
  "screenshot",
  "export_formats",
  "vertex_weights",
] as const;

export const inspectParameters = z.object({
  target: z
    .enum(TARGETS)
    .describe(
      "Which slice of Blockbench state to read. Each target accepts a subset of the optional filters below; unrelated filters are ignored."
    ),

  // Single-entity lookup (armatures / bones / null_objects / textures / materials / variants).
  id: z.string().optional(),

  // outline
  include_cubes: z.boolean().optional(),
  include_meshes: z.boolean().optional(),
  max_depth: z.number().int().positive().optional(),

  // armatures / bones
  include_bones: z.boolean().optional(),
  include_weights: z.boolean().optional(),
  armature_id: z.string().optional(),

  // rig
  include_geometry: z.boolean().optional(),

  // find
  name_pattern: z.string().optional(),
  name_contains: z.string().optional(),
  type: z.enum(["cube", "mesh", "group", "any"]).optional(),
  parent_group: z.string().optional(),
  min_size: z.tuple([z.number(), z.number(), z.number()]).optional(),
  max_size: z.tuple([z.number(), z.number(), z.number()]).optional(),
  selected_only: z.boolean().optional(),
  limit: z.number().int().positive().optional(),

  // by_material / textures
  texture: z.string().optional(),
  include_face_keys: z.boolean().optional(),

  // material_instances
  cube_id: z.string().optional(),
  faces: z
    .array(z.enum(["north", "south", "east", "west", "up", "down"]))
    .optional(),

  // history
  history_limit: z.number().int().positive().max(200).optional(),

  // screenshot
  screenshot_kind: z.enum(["viewport", "app"]).optional(),
  // Named `screenshot_project` (not `project`) to avoid shadowing the `project` target.
  screenshot_project: z.string().optional(),

  // export_formats
  only_current_format: z.boolean().optional(),

  // vertex_weights
  mesh_id: z.string().optional(),
  bone_id: z.string().optional(),
});

export const inspectToolDocs: ToolSpec[] = [
  {
    name: "inspect",
    description:
      "Read-only inspection of the current Blockbench project. `target` selects which slice of state to return; remaining fields are per-target filters. Replaces 28 legacy read tools (list_*/get_*/find_*/filter_*). See docs for the full target list. Returns structured JSON wrapped in { ok, data, meta }.",
    annotations: {
      title: "Inspect",
      readOnlyHint: true,
    },
    parameters: inspectParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

// ============================================================================
// Response wrapping (with truncate)
// ============================================================================

function wrapInspect<T>(response: ToolResponse<T>): WrappedToolResult {
  // safeStringify absorbs circular refs / BigInt / Map / Set / Error so a raw
  // Blockbench object can reach us without dying. Anything bigger than the
  // inspect-specific budget collapses to a single error response so the caller
  // gets a parseable JSON payload instead of a malformed truncated one.
  const text = safeStringify(response);
  if (text.length <= INSPECT_TRUNCATE) {
    return { content: [{ type: "text", text }] };
  }
  const errResponse = err(
    "RESPONSE_TOO_LARGE",
    `inspect result exceeds ${INSPECT_TRUNCATE} chars (actual: ${text.length}). Narrow your query (apply limits/include filters or split by id).`,
  );
  return { content: [{ type: "text", text: JSON.stringify(errResponse) }] };
}

// ============================================================================
// AJ Blueprint helpers
// ============================================================================
// Mirror of helpers in server/tools/aj.ts. Intentional duplication: the legacy
// file is kept as-is per the stage-II "case 2" plan (file stays, register is
// dropped). Once every read-side target migrates here we can consolidate.

interface AJBlueprintLike {
  animated_java?: Record<string, unknown>;
  animations?: Array<{ name: string; loop?: string; length?: number }>;
}

const AJ_FORMAT_ID = "animated-java:format/blueprint";

function getAJProjectGuard(): AJBlueprintLike {
  if (!Project) {
    throw new Error(
      "No project is open. Use create_project to start a new one, or open an existing Animated Java Blueprint in Blockbench."
    );
  }
  const proj = Project as unknown as AJBlueprintLike;
  if (!proj.animated_java) {
    const formatId = (Format as { id?: string } | undefined)?.id ?? "unknown";
    throw new Error(
      `The active project is not an Animated Java Blueprint (format: ${formatId}). This target requires format "${AJ_FORMAT_ID}".`
    );
  }
  return proj;
}

function sanitizeStorageKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

interface AJVariantLike {
  uuid: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  textureMap: { toJSON?: () => Record<string, string> };
  excludedNodes: Array<{ name?: string; value: string }>;
}

interface AJVariantConstructorLike {
  all: AJVariantLike[];
  selected?: AJVariantLike;
}

function getVariantsApi(): AJVariantConstructorLike {
  getAJProjectGuard();
  const api = (globalThis as {
    AnimatedJava?: { Variant?: AJVariantConstructorLike };
  }).AnimatedJava;
  if (!api?.Variant) {
    throw new Error(
      "window.AnimatedJava.Variant is not available. Ensure the Animated Java plugin is loaded."
    );
  }
  return api.Variant;
}

function serializeVariant(variant: AJVariantLike, selectedUuid?: string) {
  return {
    uuid: variant.uuid,
    name: variant.name,
    display_name: variant.displayName,
    is_default: variant.isDefault,
    selected: variant.uuid === selectedUuid,
    texture_map:
      typeof variant.textureMap?.toJSON === "function"
        ? variant.textureMap.toJSON()
        : {},
    excluded_nodes: (variant.excludedNodes ?? []).map((n) => ({
      name: n.name,
      uuid: n.value,
    })),
  };
}

interface OutlinerLike {
  name?: string;
  uuid?: string;
  type?: string;
  children?: unknown[];
  position?: unknown;
  origin?: unknown;
  rotation?: unknown;
  length?: unknown;
  connected?: unknown;
}

interface RigNode {
  name: string;
  uuid: string;
  type: string;
  position?: unknown;
  origin?: unknown;
  rotation?: unknown;
  length?: unknown;
  connected?: unknown;
  children?: RigNode[];
}

function serializeRigNode(
  input: unknown,
  includeGeometry: boolean
): RigNode | null {
  const el = input as OutlinerLike;
  const type = el.type ?? "unknown";
  if (type === "cube" || type === "mesh") {
    if (!includeGeometry) return null;
    return { name: el.name ?? "", uuid: el.uuid ?? "", type };
  }
  const node: RigNode = { name: el.name ?? "", uuid: el.uuid ?? "", type };
  if (type === "locator" || type === "null_object") {
    if (el.position !== undefined) node.position = el.position;
  } else if (type === "armature_bone") {
    node.origin = el.origin;
    node.rotation = el.rotation;
    node.length = el.length;
    node.connected = el.connected;
  }
  if (Array.isArray(el.children) && el.children.length > 0) {
    const children = el.children
      .map((child) => serializeRigNode(child, includeGeometry))
      .filter((c): c is RigNode => c !== null);
    if (children.length > 0) node.children = children;
  }
  return node;
}

interface NullObjectLike {
  uuid: string;
  name: string;
  type: string;
  position: unknown;
  ik_target?: unknown;
  ik_source?: unknown;
  lock_ik_target_rotation?: unknown;
  visibility?: unknown;
  locked?: unknown;
}

function serializeNullObjectLite(n: unknown) {
  const obj = n as NullObjectLike;
  return {
    uuid: obj.uuid,
    name: obj.name,
    type: obj.type,
    position: obj.position,
    ik_target: obj.ik_target || null,
    ik_source: obj.ik_source || null,
    lock_ik_target_rotation: obj.lock_ik_target_rotation,
    visibility: obj.visibility,
    locked: obj.locked,
  };
}

// ============================================================================
// Target implementations (stage-II growth point — add cases incrementally)
// ============================================================================

interface IUndoEntrySummary {
  index: number;
  action: string;
  type: string;
  time: number;
  is_applied: boolean;
  is_current: boolean;
}

function summarizeHistory(limit: number): {
  index: number;
  total: number;
  can_undo: boolean;
  can_redo: boolean;
  entries: IUndoEntrySummary[];
} {
  const history = (Undo.history ?? []) as Array<{
    action?: string;
    type?: string;
    time?: number;
  }>;
  const index = Undo.index ?? 0;

  const start = Math.max(0, history.length - limit);
  const entries: IUndoEntrySummary[] = history
    .slice(start)
    .map((entry, offset) => {
      const absoluteIndex = start + offset;
      return {
        index: absoluteIndex,
        action: entry.action ?? "(unnamed edit)",
        type: entry.type ?? "edit",
        time: entry.time ?? 0,
        is_applied: absoluteIndex < index,
        is_current: absoluteIndex === index - 1,
      };
    })
    .reverse();

  return {
    index,
    total: history.length,
    can_undo: index > 0,
    can_redo: index < history.length,
    entries,
  };
}

function inspectProject(): unknown {
  if (!Project) {
    throw new Error(
      "No project is open. Use create_project to start a new one, or open an existing file in Blockbench."
    );
  }
  const format = Format as
    | { id?: string; name?: string; display_name?: string }
    | undefined;

  const rootGroups = Outliner.root
    .filter((n): n is Group => n instanceof Group)
    .map((g) => ({
      name: g.name,
      uuid: g.uuid,
      children: g.children?.length ?? 0,
    }));

  return {
    project: {
      name: Project.name,
      uuid: Project.uuid,
      save_path: (Project as { save_path?: string }).save_path ?? null,
    },
    format: {
      id: format?.id ?? null,
      name: format?.display_name ?? format?.name ?? null,
    },
    resolution: {
      texture_width: Project.texture_width ?? null,
      texture_height: Project.texture_height ?? null,
    },
    counts: {
      cubes: Cube.all.length,
      meshes: Mesh.all.length,
      groups: Group.all.length,
      textures: Texture.all.length,
      outliner_elements: Outliner.elements.length,
    },
    root_groups: rootGroups,
  };
}

function inspectHistory(limit: number): unknown {
  return summarizeHistory(limit);
}

function inspectSettings(): unknown {
  return { settings: getAJProjectGuard().animated_java ?? {} };
}

function inspectAnimMapping(): unknown {
  const proj = getAJProjectGuard();
  const animations = proj.animations ?? [];
  const mapping = animations.map((a, i) => ({
    id: i,
    name: a.name,
    storage_name: sanitizeStorageKey(a.name),
    loop_mode: a.loop ?? null,
    length: a.length ?? null,
  }));
  return { count: mapping.length, animations: mapping };
}

function inspectVariants(): unknown {
  const Variant = getVariantsApi();
  const selectedUuid = Variant.selected?.uuid;
  const variants = Variant.all.map((v) => serializeVariant(v, selectedUuid));
  return { count: variants.length, variants };
}

function inspectRig(includeGeometry: boolean): unknown {
  getAJProjectGuard();
  const roots = Outliner.root
    .map((el) => serializeRigNode(el, includeGeometry))
    .filter((n): n is RigNode => n !== null);
  const counts = {
    groups: Group.all.length,
    armatures: Armature.all.length,
    armature_bones: ArmatureBone.all.length,
    cubes: Cube.all.length,
    meshes: Mesh.all.length,
  };
  return { counts, roots };
}

function inspectSelection(): unknown {
  const cubes = Cube.selected.map((c: Cube) => ({
    uuid: c.uuid,
    name: c.name,
    type: "cube" as const,
  }));
  const meshes = Mesh.selected.map((m: Mesh) => ({
    uuid: m.uuid,
    name: m.name,
    type: "mesh" as const,
  }));
  const groups = Group.all
    .filter((g: Group) => g.selected)
    .map((g: Group) => ({
      uuid: g.uuid,
      name: g.name,
      type: "group" as const,
    }));
  const activeTexture = Texture.selected
    ? {
        uuid: Texture.selected.uuid,
        id: Texture.selected.id,
        name: Texture.selected.name,
        width: Texture.selected.width,
        height: Texture.selected.height,
      }
    : null;
  return {
    counts: {
      cubes: cubes.length,
      meshes: meshes.length,
      groups: groups.length,
    },
    cubes,
    meshes,
    groups,
    active_texture: activeTexture,
  };
}

function inspectNullObjects(id?: string): unknown {
  const all = (NullObject as unknown as { all: unknown[] }).all;
  if (id) {
    const found = all.find((n) => {
      const obj = n as { uuid: string; name: string };
      return obj.uuid === id || obj.name === id || obj.uuid.startsWith(id);
    });
    if (!found) {
      throw new Error(
        `NullObject not found: ${id}. Use inspect(target='null_objects') without 'id' to list available null objects.`
      );
    }
    return { null_object: serializeNullObjectLite(found) };
  }
  const nullObjects = all.map(serializeNullObjectLite);
  return { count: nullObjects.length, null_objects: nullObjects };
}

// ============================================================================
// Dispatcher
// ============================================================================

type InspectArgs = z.infer<typeof inspectParameters>;

async function dispatchInspect(args: InspectArgs): Promise<unknown> {
  switch (args.target) {
    case "project":
      return inspectProject();
    case "history":
      return inspectHistory(args.history_limit ?? 50);
    case "settings":
      return inspectSettings();
    case "anim_mapping":
      return inspectAnimMapping();
    case "variants":
      return inspectVariants();
    case "rig":
      return inspectRig(args.include_geometry ?? false);
    case "null_objects":
      return inspectNullObjects(args.id);
    case "selection":
      return inspectSelection();
    default:
      // Stage-II growth point: each target is migrated from its legacy tool
      // one at a time. Until then, fall through with a structured error so
      // callers (especially subagents) get a clear "use the legacy tool"
      // signal instead of silent failure.
      throw new InspectNotImplemented(args.target);
  }
}

class InspectNotImplemented extends Error {
  readonly code = "NOT_IMPLEMENTED";
  constructor(public readonly target: string) {
    super(
      `inspect target '${target}' is not yet migrated to stage-II. Use the legacy read tool for this target until the migration lands.`
    );
    this.name = "InspectNotImplemented";
  }
}

// ============================================================================
// Tool registration
// ============================================================================

export function registerInspectTool() {
  createTool(
    inspectToolDocs[0].name,
    {
      ...inspectToolDocs[0],
      async execute(args) {
        try {
          const data = await dispatchInspect(args);
          return wrapInspect(ok(data, { dispatch_target: args.target }));
        } catch (error) {
          if (error instanceof InspectNotImplemented) {
            return wrap(
              err(error.code, error.message, `target=${error.target}`)
            );
          }
          const e = error as Error;
          return wrap(
            err("INSPECT_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    inspectToolDocs[0].status
  );
}
