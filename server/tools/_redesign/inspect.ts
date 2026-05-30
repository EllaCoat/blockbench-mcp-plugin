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
import {
  findTextureOrThrow,
  findTextureGroupOrThrow,
  getChannelTextureInfo,
} from "@/lib/util";

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
  "export_formats",
  "vertex_weights",
] as const;
// Note: `screenshot` (capture_screenshot/capture_app_screenshot) is deliberately
// excluded — image content is not JSON-shaped and stays as standalone tools.

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
// Element / Armature / Texture helpers
// ============================================================================
// Mirror of helpers in element.ts / armature.ts / texture.ts / material-instances.ts.
// Intentional duplication per the stage-II "case 2" plan (legacy files stay,
// register is dropped; consolidate after all targets migrate).

const MAX_REGEX_PATTERN_LENGTH = 512;
// Reject quantifiers applied to a group whose body already contains a quantifier
// (classic catastrophic-backtracking shape: `(a+)+`, `(.*)*`, etc).
const CATASTROPHIC_BACKTRACK_HEURISTIC = /\([^)]*[+*?][^)]*\)\s*[+*?{]/;

function safeCompileRegex(pattern: string | undefined): RegExp | null {
  if (!pattern) return null;
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) return null;
  if (CATASTROPHIC_BACKTRACK_HEURISTIC.test(pattern)) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function getElementType(el: unknown): "cube" | "mesh" | "group" | null {
  if (el instanceof Cube) return "cube";
  if (el instanceof Mesh) return "mesh";
  if (el instanceof Group) return "group";
  return null;
}

function getParentName(el: { parent?: unknown }): string | null {
  const parent = el.parent as { name?: string; uuid?: string } | undefined;
  if (!parent || typeof parent !== "object") return null;
  return parent.name ?? parent.uuid ?? null;
}

function isDescendantOf(
  el: { parent?: unknown },
  targetGroup: Group
): boolean {
  let current: { parent?: unknown } | undefined = el;
  while (current && current.parent && typeof current.parent === "object") {
    if (current.parent === targetGroup) return true;
    current = current.parent as { parent?: unknown };
  }
  return false;
}

function cubeSize(cube: Cube): [number, number, number] {
  return [
    cube.to[0] - cube.from[0],
    cube.to[1] - cube.from[1],
    cube.to[2] - cube.from[2],
  ];
}

function exceedsBounds(
  size: [number, number, number],
  min?: number[],
  max?: number[]
): boolean {
  if (min && size.some((v, i) => v < (min[i] ?? -Infinity))) return true;
  if (max && size.some((v, i) => v > (max[i] ?? Infinity))) return true;
  return false;
}

function findArmature(id: string): Armature | undefined {
  return Armature.all.find(
    (a) => a.uuid === id || a.name === id || a.uuid.startsWith(id)
  );
}

function findArmatureOrThrow(id: string): Armature {
  const armature = findArmature(id);
  if (!armature) {
    throw new Error(
      `Armature not found: ${id}. Use inspect(target='armatures') to list available armatures.`
    );
  }
  return armature;
}

function findArmatureBone(id: string): ArmatureBone | undefined {
  return ArmatureBone.all.find(
    (b) => b.uuid === id || b.name === id || b.uuid.startsWith(id)
  );
}

function findArmatureBoneOrThrow(id: string): ArmatureBone {
  const bone = findArmatureBone(id);
  if (!bone) {
    throw new Error(
      `Armature bone not found: ${id}. Use inspect(target='bones') to list available bones.`
    );
  }
  return bone;
}

function findMeshById(id: string): Mesh | undefined {
  return Mesh.all.find(
    (m) => m.uuid === id || m.name === id || m.uuid.startsWith(id)
  );
}

function findCubeOrThrowById(id: string): Cube {
  const cube = Cube.all.find(
    (c) => c.uuid === id || c.name === id || c.uuid.startsWith(id)
  );
  if (!cube) {
    throw new Error(
      `Cube not found: ${id}. Material instances are only supported on cube faces.`
    );
  }
  return cube;
}

function serializeArmature(armature: Armature) {
  return {
    uuid: armature.uuid,
    name: armature.name,
    type: armature.type,
    visibility: armature.visibility,
    locked: armature.locked,
    export: armature.export,
    isOpen: armature.isOpen,
    origin: armature.origin,
    childCount: armature.children.length,
    boneCount: armature.getAllBones().length,
  };
}

function serializeArmatureBone(bone: ArmatureBone) {
  const armature = bone.getArmature();
  return {
    uuid: bone.uuid,
    name: bone.name,
    type: bone.type,
    armature: armature ? { uuid: armature.uuid, name: armature.name } : null,
    origin: bone.origin,
    rotation: bone.rotation,
    length: bone.length,
    width: bone.width,
    connected: bone.connected,
    color: bone.color,
    visibility: bone.visibility,
    locked: bone.locked,
    export: bone.export,
    parentBone:
      bone.parent instanceof ArmatureBone
        ? { uuid: bone.parent.uuid, name: bone.parent.name }
        : null,
    childCount: bone.children.length,
    vertexWeightCount: Object.keys(bone.vertex_weights).length,
  };
}

const FACE_KEYS = ["north", "south", "east", "west", "up", "down"] as const;
type FaceKey = (typeof FACE_KEYS)[number];

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

interface CodecLike {
  id?: string;
  name?: string;
  extension?: string;
  compile?: unknown;
  export?: unknown;
  support_partial_export?: boolean;
}

function inspectExportFormats(onlyCurrentFormat: boolean): unknown {
  // @ts-ignore - Codecs is a Blockbench global
  const registry = Codecs as Record<string, unknown>;
  const currentFormatCodecId = (Format as { codec?: { id?: string } } | undefined)
    ?.codec?.id;

  const summaries = Object.entries(registry).map(([id, codec]) => {
    const c = codec as CodecLike;
    return {
      id,
      name: c.name ?? id,
      extension: c.extension ?? null,
      has_compile: typeof c.compile === "function",
      has_export: typeof c.export === "function",
      supports_partial_export: Boolean(c.support_partial_export),
      belongs_to_current_format: c.id === currentFormatCodecId,
    };
  });

  const filtered = onlyCurrentFormat
    ? summaries.filter((s) => s.belongs_to_current_format)
    : summaries;

  return {
    current_format_codec: currentFormatCodecId ?? null,
    count: filtered.length,
    codecs: filtered.sort((a, b) => a.id.localeCompare(b.id)),
  };
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

interface IOutlineNode {
  name: string;
  uuid: string;
  type: "cube" | "mesh" | "group";
  children?: IOutlineNode[];
}

function inspectOutline(
  includeCubes: boolean,
  includeMeshes: boolean,
  maxDepth: number
): unknown {
  const truncated: string[] = [];
  const nodeFor = (el: unknown, depth: number): IOutlineNode | null => {
    if (el instanceof Group) {
      const node: IOutlineNode = {
        name: el.name,
        uuid: el.uuid,
        type: "group",
        children: [],
      };
      if (depth >= maxDepth) {
        truncated.push(el.name);
        delete node.children;
        return node;
      }
      for (const child of el.children ?? []) {
        const childNode = nodeFor(child, depth + 1);
        if (childNode) node.children!.push(childNode);
      }
      return node;
    }
    if (el instanceof Cube) {
      if (!includeCubes) return null;
      return { name: el.name, uuid: el.uuid, type: "cube" };
    }
    if (el instanceof Mesh) {
      if (!includeMeshes) return null;
      return { name: el.name, uuid: el.uuid, type: "mesh" };
    }
    return null;
  };
  const roots = Outliner.root
    .map((el) => nodeFor(el, 0))
    .filter((n): n is IOutlineNode => n !== null);
  const counts = {
    groups: Group.all.length,
    cubes: Cube.all.length,
    meshes: Mesh.all.length,
  };
  return {
    counts,
    truncated_at_max_depth: truncated.length ? truncated : undefined,
    roots,
  };
}

interface IFindMatch {
  uuid: string;
  name: string;
  type: "cube" | "mesh" | "group";
  parent: string | null;
}

function inspectFind(args: {
  name_pattern?: string;
  name_contains?: string;
  type?: "cube" | "mesh" | "group" | "any";
  parent_group?: string;
  min_size?: [number, number, number];
  max_size?: [number, number, number];
  selected_only?: boolean;
  limit?: number;
}): unknown {
  const type = args.type ?? "any";
  const selectedOnly = args.selected_only ?? false;
  const limit = args.limit ?? 50;

  const regex = safeCompileRegex(args.name_pattern);
  const needle = args.name_contains?.toLowerCase() ?? null;
  const parentScope = args.parent_group
    ? (Group.all.find(
        (g: Group) =>
          g.uuid === args.parent_group || g.name === args.parent_group
      ) ?? null)
    : null;
  if (args.parent_group && !parentScope) {
    throw new Error(
      `Parent group "${args.parent_group}" not found. Use inspect(target='outline') to see available groups.`
    );
  }

  const candidates: Array<Cube | Mesh | Group> = [
    ...(selectedOnly ? Cube.selected : Cube.all),
    ...(selectedOnly ? Mesh.selected : Mesh.all),
    ...(selectedOnly ? Group.all.filter((g: Group) => g.selected) : Group.all),
  ];

  const matches: IFindMatch[] = [];
  for (const el of candidates) {
    if (matches.length >= limit) break;
    const elType = getElementType(el);
    if (!elType) continue;
    if (type !== "any" && elType !== type) continue;
    if (regex && !regex.test(el.name)) continue;
    if (needle && !el.name.toLowerCase().includes(needle)) continue;
    if (parentScope && !isDescendantOf(el, parentScope)) continue;
    if (el instanceof Cube && (args.min_size || args.max_size)) {
      if (exceedsBounds(cubeSize(el), args.min_size, args.max_size)) continue;
    }
    matches.push({
      uuid: el.uuid,
      name: el.name,
      type: elType,
      parent: getParentName(el),
    });
  }

  return {
    count: matches.length,
    truncated: matches.length >= limit,
    matches,
  };
}

interface IByMaterialMatch {
  uuid: string;
  name: string;
  type: "cube" | "mesh";
  faces?: string[];
}

function inspectByMaterial(
  textureId: string,
  includeFaceKeys: boolean
): unknown {
  const tex = findTextureOrThrow(textureId);
  const matches: IByMaterialMatch[] = [];

  for (const cube of Cube.all) {
    const faceKeys: string[] = [];
    for (const [key, face] of Object.entries(cube.faces ?? {})) {
      const faceTexId = (face as { texture?: unknown }).texture;
      if (faceTexId === tex.uuid || faceTexId === tex.id) {
        faceKeys.push(key);
      }
    }
    if (faceKeys.length > 0) {
      matches.push({
        uuid: cube.uuid,
        name: cube.name,
        type: "cube",
        ...(includeFaceKeys ? { faces: faceKeys } : {}),
      });
    }
  }

  for (const mesh of Mesh.all) {
    const faceKeys: string[] = [];
    for (const [key, face] of Object.entries(mesh.faces ?? {})) {
      const faceTexId = (face as { texture?: unknown }).texture;
      if (faceTexId === tex.uuid || faceTexId === tex.id) {
        faceKeys.push(key);
      }
    }
    if (faceKeys.length > 0) {
      matches.push({
        uuid: mesh.uuid,
        name: mesh.name,
        type: "mesh",
        ...(includeFaceKeys ? { faces: faceKeys } : {}),
      });
    }
  }

  return {
    texture: { uuid: tex.uuid, name: tex.name },
    count: matches.length,
    matches,
  };
}

function inspectArmatures(id?: string, includeBones?: boolean): unknown {
  if (id) {
    const armature = findArmatureOrThrow(id);
    const result: Record<string, unknown> = serializeArmature(armature);
    if (includeBones) {
      result.bones = armature.getAllBones().map(serializeArmatureBone);
    }
    return result;
  }
  const armatures = Armature.all.map(serializeArmature);
  return { count: armatures.length, armatures };
}

function inspectBones(args: {
  id?: string;
  armature_id?: string;
  include_weights?: boolean;
}): unknown {
  if (args.id) {
    const bone = findArmatureBoneOrThrow(args.id);
    const result: Record<string, unknown> = serializeArmatureBone(bone);
    if (args.include_weights) {
      result.vertex_weights = bone.vertex_weights;
    }
    return result;
  }
  const bones = args.armature_id
    ? findArmatureOrThrow(args.armature_id).getAllBones()
    : ArmatureBone.all;
  const serialized = bones.map(serializeArmatureBone);
  return { count: serialized.length, bones: serialized };
}

function inspectTextures(id?: string): unknown {
  const all = Project?.textures ?? Texture.all;
  if (id) {
    const tex = findTextureOrThrow(id);
    return {
      texture: {
        name: tex.name,
        uuid: tex.uuid,
        id: tex.id,
        group: tex.group,
        width: tex.width,
        height: tex.height,
        // Image bytes deliberately omitted — use the standalone `get_texture`
        // tool to fetch the data URL, since image content is not JSON-shaped.
      },
    };
  }
  return {
    count: all.length,
    textures: all.map((t) => ({
      name: t.name,
      uuid: t.uuid,
      id: t.id,
      group: t.group,
    })),
  };
}

function inspectMaterials(id?: string): unknown {
  if (id) {
    const group = findTextureGroupOrThrow(id);
    const textures = group.getTextures();
    let textureSetJson = null;
    try {
      textureSetJson = group.material_config.compileForBedrock();
    } catch {
      // Format may not support texture_set.json
    }
    return {
      material: {
        name: group.name,
        uuid: group.uuid,
        is_material: group.is_material,
        textures: textures.map((tex: Texture) => ({
          name: tex.name,
          uuid: tex.uuid,
          pbr_channel: tex.pbr_channel,
          width: tex.width,
          height: tex.height,
          render_mode: tex.render_mode,
          render_sides: tex.render_sides,
        })),
        config: {
          color_value: group.material_config.color_value,
          mer_value: group.material_config.mer_value,
          subsurface_value: group.material_config.subsurface_value,
          saved: group.material_config.saved,
          file_path: group.material_config.getFilePath(),
        },
        texture_set_json: textureSetJson,
      },
    };
  }
  // @ts-ignore - TextureGroup is globally available
  const materials = TextureGroup.all.filter(
    (g: TextureGroup) => g.is_material
  );
  const result = materials.map((group: TextureGroup) => {
    const textures = group.getTextures();
    return {
      name: group.name,
      uuid: group.uuid,
      channels: {
        color: getChannelTextureInfo(textures, "color"),
        normal: getChannelTextureInfo(textures, "normal"),
        height: getChannelTextureInfo(textures, "height"),
        mer: getChannelTextureInfo(textures, "mer"),
      },
      config: {
        color_value: group.material_config.color_value,
        mer_value: group.material_config.mer_value,
        subsurface_value: group.material_config.subsurface_value,
        saved: group.material_config.saved,
      },
    };
  });
  return { count: result.length, materials: result };
}

function inspectMaterialInstances(
  cubeId?: string,
  faces?: FaceKey[]
): unknown {
  if (cubeId) {
    const cube = findCubeOrThrowById(cubeId);
    const facesToCheck = faces ?? FACE_KEYS;
    const result: Record<
      string,
      { material_name: string; texture: string | null }
    > = {};
    for (const faceDir of facesToCheck) {
      const face = cube.faces[faceDir];
      if (face) {
        result[faceDir] = {
          material_name: face.material_name || "",
          texture: face.texture
            ? (face.getTexture()?.name || face.texture.toString())
            : null,
        };
      }
    }
    return {
      cube: { name: cube.name, uuid: cube.uuid },
      faces: result,
    };
  }
  // Aggregate listing — group cubes by material_name.
  const materialMap: Record<
    string,
    Array<{ cube_name: string; cube_uuid: string; face: string }>
  > = {};
  for (const cube of Cube.all) {
    for (const faceDir of FACE_KEYS) {
      const face = cube.faces[faceDir];
      if (face && face.material_name) {
        if (!materialMap[face.material_name]) materialMap[face.material_name] = [];
        materialMap[face.material_name].push({
          cube_name: cube.name,
          cube_uuid: cube.uuid,
          face: faceDir,
        });
      }
    }
  }
  const materialInstances = Object.entries(materialMap).map(
    ([name, usages]) => ({ name, usage_count: usages.length, usages })
  );
  return {
    total_unique_instances: materialInstances.length,
    material_instances: materialInstances,
  };
}

function inspectVertexWeights(meshId?: string, boneId?: string): unknown {
  const mesh = meshId ? findMeshById(meshId) : Mesh.selected[0];
  if (!mesh) {
    throw new Error(
      "No mesh found. Provide mesh_id, or select a mesh in Blockbench."
    );
  }
  const armature = (mesh as unknown as { getArmature?: () => Armature | undefined })
    .getArmature?.();
  if (!armature) {
    throw new Error(
      `Mesh "${mesh.name}" is not associated with an armature.`
    );
  }
  const bones = boneId
    ? [findArmatureBoneOrThrow(boneId)]
    : armature.getAllBones();
  const weights: Record<string, Record<string, number>> = {};
  for (const bone of bones) {
    const boneWeights: Record<string, number> = {};
    for (const vkey in mesh.vertices) {
      const weight = bone.getVertexWeight(mesh, vkey);
      if (weight > 0) {
        boneWeights[vkey] = weight;
      }
    }
    if (Object.keys(boneWeights).length > 0) {
      weights[bone.name] = boneWeights;
    }
  }
  return {
    mesh: { uuid: mesh.uuid, name: mesh.name },
    armature: { uuid: armature.uuid, name: armature.name },
    weights,
  };
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
    case "export_formats":
      return inspectExportFormats(args.only_current_format ?? false);
    case "outline":
      return inspectOutline(
        args.include_cubes ?? true,
        args.include_meshes ?? true,
        args.max_depth ?? 6
      );
    case "find":
      return inspectFind({
        name_pattern: args.name_pattern,
        name_contains: args.name_contains,
        type: args.type,
        parent_group: args.parent_group,
        min_size: args.min_size,
        max_size: args.max_size,
        selected_only: args.selected_only,
        limit: args.limit,
      });
    case "by_material":
      if (!args.texture) {
        throw new Error(
          "target='by_material' requires the 'texture' field (texture UUID / id / name)."
        );
      }
      return inspectByMaterial(args.texture, args.include_face_keys ?? false);
    case "armatures":
      return inspectArmatures(args.id, args.include_bones);
    case "bones":
      return inspectBones({
        id: args.id,
        armature_id: args.armature_id,
        include_weights: args.include_weights,
      });
    case "textures":
      return inspectTextures(args.id);
    case "materials":
      return inspectMaterials(args.id);
    case "material_instances":
      return inspectMaterialInstances(
        args.cube_id,
        args.faces as FaceKey[] | undefined
      );
    case "vertex_weights":
      return inspectVertexWeights(args.mesh_id, args.bone_id);
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
