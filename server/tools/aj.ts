/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { findGroupOrThrow } from "@/lib/util";
import {
  animationIdOptionalSchema,
  animationChannelEnum,
  timeRangeSchema,
} from "@/lib/zodObjects";

/**
 * Animated Java augments the active Blockbench project with an `animated_java`
 * object holding all Blueprint Settings as a flat record. Only AJ Blueprint
 * projects carry it, so its presence is used to gate these tools.
 */
interface AJAnimationLike {
  name: string;
  loop?: string;
  length?: number;
}

interface AJBlueprintProject {
  animated_java?: Record<string, unknown>;
  saved?: boolean;
  animations?: AJAnimationLike[];
}

interface AnimatedJavaApiLike {
  Variant?: unknown;
  exportProject?: (options?: unknown) => Promise<boolean>;
}

type SettingValue = string | number | boolean | number[];

const AJ_FORMAT_ID = "animated-java:format/blueprint";

function getAJProject(): AJBlueprintProject {
  if (!Project) {
    throw new Error(
      "No project is open. Open or create an Animated Java Blueprint first."
    );
  }

  const proj = Project as unknown as AJBlueprintProject;
  if (!proj.animated_java) {
    const formatId = (Format as { id?: string } | undefined)?.id ?? "unknown";
    throw new Error(
      `The active project is not an Animated Java Blueprint (format: ${formatId}). ` +
        `These tools require a project of format "${AJ_FORMAT_ID}".`
    );
  }

  return proj;
}

function getAJSettings(): Record<string, unknown> {
  return getAJProject().animated_java as Record<string, unknown>;
}

function markUnsaved(): void {
  (Project as unknown as AJBlueprintProject).saved = false;
}

function typeName(value: unknown): string {
  return Array.isArray(value) ? "array" : typeof value;
}

/**
 * Animated Java's NumberSlider-backed settings are sometimes stored as numeric
 * strings (e.g. interpolation_duration = "2") rather than numbers. This lets
 * the set tool treat numbers and numeric strings as interchangeable.
 */
function isNumericLike(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "" && Number.isFinite(Number(value));
  return false;
}

/** Mirror of Animated Java's sanitizeStorageKey (src/util/minecraftUtil.ts). */
function sanitizeStorageKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function getAJApi(): AnimatedJavaApiLike {
  getAJProject();
  const api = (globalThis as { AnimatedJava?: AnimatedJavaApiLike }).AnimatedJava;
  if (!api) {
    throw new Error(
      "The Animated Java API (window.AnimatedJava) is not available. " +
        "Ensure the Animated Java plugin is loaded."
    );
  }
  return api;
}

// ============================================================================
// Animated Java Variant access (via window.AnimatedJava.Variant)
// ============================================================================

interface AJVariant {
  id: number;
  name: string;
  displayName: string;
  uuid: string;
  isDefault: boolean;
  generateNameFromDisplayName: boolean;
  textureMap: { toJSON?: () => Record<string, string> };
  excludedNodes: Array<{ name?: string; value: string }>;
  select(): void;
  delete(): void;
  duplicate(): void;
}

interface AJVariantConstructor {
  new (displayName: string, isDefault?: boolean): AJVariant;
  all: AJVariant[];
  selected?: AJVariant;
  getByUUID(uuid: string): AJVariant | undefined;
  makeDisplayNameUnique(variant: AJVariant, displayName: string): string;
  makeNameUnique(variant: AJVariant, name: string): string;
}

function getVariantClass(): AJVariantConstructor {
  const api = getAJApi();
  if (!api.Variant) {
    throw new Error(
      "window.AnimatedJava.Variant is not available. Ensure the Animated Java plugin is loaded."
    );
  }
  return api.Variant as AJVariantConstructor;
}

function findVariantOrThrow(Variant: AJVariantConstructor, idOrName: string): AJVariant {
  const variant =
    Variant.all.find(
      (v) => v.uuid === idOrName || v.name === idOrName || v.displayName === idOrName
    ) ?? Variant.all.find((v) => v.uuid.startsWith(idOrName));
  if (!variant) {
    throw new Error(
      `Variant not found: "${idOrName}". Use aj_variant_list to see available variants.`
    );
  }
  return variant;
}

function serializeVariant(variant: AJVariant, selectedUuid?: string) {
  return {
    uuid: variant.uuid,
    name: variant.name,
    display_name: variant.displayName,
    is_default: variant.isDefault,
    selected: variant.uuid === selectedUuid,
    texture_map:
      typeof variant.textureMap?.toJSON === "function" ? variant.textureMap.toJSON() : {},
    excluded_nodes: (variant.excludedNodes ?? []).map((n) => ({
      name: n.name,
      uuid: n.value,
    })),
  };
}

// ============================================================================
// Keyframe easing (mirrors Animated Java's src/util/easing.ts)
// ============================================================================

/**
 * Structural view of a Blockbench Animation at runtime. blockbench-types omits
 * the static `all`/`selected` members and the `animators` map, so this names
 * just the fields the easing tool reads.
 */
interface AJAnimationRuntime {
  uuid: string;
  name: string;
  animators?: Record<string, Record<string, unknown>>;
}

/**
 * Named easing functions Animated Java understands on a keyframe's `easing`
 * field. Easing only takes effect when the keyframe's interpolation is
 * "linear" (the AJ panel hides the controls otherwise).
 */
const AJ_EASING_NAMES = [
  "linear",
  "step",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
] as const;

/** Back/Elastic/Bounce (overshoot/bounciness) and step (step count) take an arg. */
function easingHasArg(easing: string): boolean {
  return (
    easing.includes("Back") ||
    easing.includes("Elastic") ||
    easing.includes("Bounce") ||
    easing === "step"
  );
}

/** Default easing arg, matching AJ's getEasingArgDefault. */
function easingArgDefault(easing: string): number | undefined {
  if (easing.includes("Back") || easing.includes("Elastic")) return 1;
  if (easing.includes("Bounce")) return 0.25;
  if (easing === "step") return 5;
  return undefined;
}

// ============================================================================
// Parameter schemas
// ============================================================================

export const blueprintSettingsGetParameters = z.object({});

export const blueprintSettingsSetParameters = z.object({
  key: z
    .string()
    .describe(
      "Blueprint Setting key to update (e.g. `tsb_optimized_export`, " +
        "`tsb_quantization_digits_default`, `interpolation_duration`). " +
        "Call aj_blueprint_settings_get to discover valid keys and their current types."
    ),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.number())])
    .describe(
      "New value. Its type must match the existing value's type " +
        "(boolean/number/string, or a number array for vector settings like render_box)."
    ),
});

export const rigTreeParameters = z.object({
  include_geometry: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Include cube and mesh leaves under each bone. Defaults to false, " +
        "returning a bone/locator/armature skeleton only."
    ),
});

export const variantListParameters = z.object({});

export const variantCreateParameters = z.object({
  display_name: z
    .string()
    .describe("Display name for the new variant. Made unique automatically if it collides."),
});

const variantRefSchema = z
  .string()
  .describe("Target variant: UUID, internal name, or display name.");

export const variantDuplicateParameters = z.object({
  variant: variantRefSchema,
});

export const variantUpdateParameters = z.object({
  variant: variantRefSchema,
  display_name: z
    .string()
    .describe("New display name. The internal name is regenerated to match (made unique)."),
});

export const variantDeleteParameters = z.object({
  variant: variantRefSchema,
});

export const variantApplyParameters = z.object({
  variant: variantRefSchema,
});

export const exportParameters = z.object({});

export const animIdMappingParameters = z.object({});

export const keyframeSetEasingParameters = z.object({
  easing: z
    .enum(AJ_EASING_NAMES)
    .describe(
      "Named easing function to apply to the keyframe `easing` field (e.g. easeInOutSine). " +
        "Only affects keyframes whose interpolation is 'linear' — non-linear keyframes are " +
        "skipped, mirroring the Animated Java panel. Use 'linear' to clear easing."
    ),
  easing_arg: z
    .number()
    .optional()
    .describe(
      "Optional easing argument. Only used by Back/Elastic (overshoot), Bounce (bounciness) and " +
        "step (number of steps). Defaults when omitted: Back/Elastic=1, Bounce=0.25, step=5. " +
        "Ignored for easings that take no argument."
    ),
  animation_id: animationIdOptionalSchema,
  bone_name: z
    .string()
    .optional()
    .describe(
      "Restrict to this bone/group's keyframes. If omitted, applies across all bones in the animation."
    ),
  channel: animationChannelEnum
    .optional()
    .describe("Restrict to this channel (rotation/position/scale). If omitted, applies to all channels."),
  keyframe_range: timeRangeSchema
    .optional()
    .describe(
      "Restrict to keyframes within this time range (seconds, inclusive). If omitted, applies to all keyframes."
    ),
});

// ============================================================================
// Tool docs
// ============================================================================

export const ajToolDocs: ToolSpec[] = [
  {
    name: "aj_blueprint_settings_get",
    description:
      "Returns all Animated Java Blueprint Settings for the active project as a JSON object " +
      "(blueprint_id, export modes, TSB Optimized Export options, interpolation durations, etc.). " +
      "Requires an Animated Java Blueprint project to be open. Use this before " +
      "aj_blueprint_settings_set to discover valid keys and their value types.",
    annotations: {
      title: "AJ: Get Blueprint Settings",
      readOnlyHint: true,
    },
    parameters: blueprintSettingsGetParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_blueprint_settings_set",
    description:
      "Sets a single Animated Java Blueprint Setting on the active project. Takes a `key` and a " +
      "`value` whose type must match the setting's current type. Validates that the key exists and " +
      "rejects type mismatches. Marks the project as having unsaved changes. Requires an Animated " +
      "Java Blueprint project to be open.",
    annotations: {
      title: "AJ: Set Blueprint Setting",
    },
    parameters: blueprintSettingsSetParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_rig_tree",
    description:
      "Returns the active Animated Java Blueprint's rig as a single hierarchical JSON tree, " +
      "unifying regular bones (groups) and Armature bones — which Blockbench otherwise exposes " +
      "through separate windows. Each node reports " +
      "{ name, uuid, type, children? } plus type-specific fields (armature bones add origin/rotation/" +
      "length/connected; locators and null objects add position). Geometry (cubes/meshes) is omitted " +
      "unless include_geometry is true. Requires an Animated Java Blueprint project to be open.",
    annotations: {
      title: "AJ: Rig Tree",
      readOnlyHint: true,
    },
    parameters: rigTreeParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_list",
    description:
      "Lists all variants of the active Animated Java Blueprint. Each entry reports uuid, name, " +
      "display_name, is_default, selected, texture_map (source→replacement texture UUIDs), and " +
      "excluded_nodes. Use this to discover variant identifiers for the other aj_variant_* tools.",
    annotations: {
      title: "AJ: List Variants",
      readOnlyHint: true,
    },
    parameters: variantListParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_create",
    description:
      "Creates a new (empty) variant with the given display name. The internal name and display " +
      "name are made unique automatically. The new variant has no texture overrides yet — use the " +
      "Blockbench UI or aj_variant_duplicate to populate its texture map. Marks the project unsaved.",
    annotations: {
      title: "AJ: Create Variant",
    },
    parameters: variantCreateParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_duplicate",
    description:
      "Duplicates an existing variant (copying its texture map and excluded nodes) and selects the " +
      "copy. Identify the source by UUID, name, or display name. Marks the project unsaved. " +
      "Use aj_variant_update afterwards to rename the copy.",
    annotations: {
      title: "AJ: Duplicate Variant",
    },
    parameters: variantDuplicateParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_update",
    description:
      "Renames a variant. Sets a new display_name (made unique) and regenerates the internal name " +
      "to match. The default variant cannot be renamed. Marks the project unsaved. Note: the " +
      "variants panel may need to be reopened to reflect the new name.",
    annotations: {
      title: "AJ: Update Variant",
    },
    parameters: variantUpdateParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_delete",
    description:
      "Deletes a variant by UUID, name, or display name. The default variant cannot be deleted. " +
      "If the deleted variant was selected, the default variant becomes selected. Marks the " +
      "project unsaved.",
    annotations: {
      title: "AJ: Delete Variant",
      destructiveHint: true,
    },
    parameters: variantDeleteParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_variant_apply",
    description:
      "Applies (selects) a variant by UUID, name, or display name so its texture overrides are " +
      "shown in the editor viewport. This is the editor preview selection, not an export action.",
    annotations: {
      title: "AJ: Apply Variant",
    },
    parameters: variantApplyParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_export",
    description:
      "Exports the active Animated Java Blueprint using its configured export settings (data pack / " +
      "resource pack paths and modes). This overwrites the existing output at those paths and may " +
      "show progress or error dialogs in Blockbench. Returns whether the export completed. Requires " +
      "an Animated Java Blueprint project to be open.",
    annotations: {
      title: "AJ: Export",
      openWorldHint: true,
    },
    parameters: exportParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_anim_id_mapping",
    description:
      "Returns the animation id ↔ name mapping used by TSB Optimized Export. Each entry is " +
      "{ id, name, storage_name, loop_mode, length }, where id is the animation's index in the " +
      "project's animation list (the value stored in the `<bp>.current_anim` scoreboard, with -1 " +
      "meaning stopped) and storage_name is the sanitized name used as the storage path key. Useful " +
      "for debugging exported datapacks. Requires an Animated Java Blueprint project to be open.",
    annotations: {
      title: "AJ: Animation ID Mapping",
      readOnlyHint: true,
    },
    parameters: animIdMappingParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_keyframe_set_easing",
    description:
      "Sets the named easing (e.g. easeInOutSine) on an animation's keyframes in bulk. Easing only " +
      "applies to keyframes whose interpolation is 'linear'; non-linear keyframes are skipped and " +
      "reported. Optionally narrow the target set by bone_name, channel, and/or keyframe_range; " +
      "by default it covers every linear keyframe in the animation. Pass 'linear' to clear easing. " +
      "Back/Elastic/Bounce/step easings accept easing_arg. Requires an Animated Java Blueprint project.",
    annotations: {
      title: "AJ: Set Keyframe Easing",
    },
    parameters: keyframeSetEasingParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

// ============================================================================
// Rig tree traversal
// ============================================================================

/**
 * Minimal structural view of a Blockbench OutlinerNode. Avoids importing
 * AJ-specific node classes (TextDisplay, etc.) that aren't available to this
 * plugin — node identity is read from the runtime `type` string instead.
 */
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

function serializeRigNode(input: unknown, includeGeometry: boolean): RigNode | null {
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

// ============================================================================
// Stage-II op implementations (named exports for _redesign/*_op.ts reuse)
// ============================================================================
// These extract the inner logic of the variant-* tools so the stage-II
// `aj_variant_op` dispatcher can import and reuse them. Existing legacy tools
// (registerAJTools below) still wrap their own inline logic — kept untouched
// until the register switchover lands.

export function ajVariantCreate(displayName: string) {
  const Variant = getVariantClass();
  const variant = new Variant(displayName);
  markUnsaved();
  return serializeVariant(variant);
}

export function ajVariantDuplicate(variantId: string) {
  const Variant = getVariantClass();
  const source = findVariantOrThrow(Variant, variantId);
  source.duplicate();
  markUnsaved();
  const copy = Variant.selected;
  return {
    source: { uuid: source.uuid, display_name: source.displayName },
    copy: copy ? serializeVariant(copy, copy.uuid) : null,
  };
}

export function ajVariantUpdate(variantId: string, displayName: string) {
  const Variant = getVariantClass();
  const target = findVariantOrThrow(Variant, variantId);
  if (target.isDefault) {
    throw new Error("The default variant cannot be renamed.");
  }
  const oldName = target.displayName;
  target.displayName = Variant.makeDisplayNameUnique(target, displayName);
  if (target.generateNameFromDisplayName) {
    target.name = Variant.makeNameUnique(target, target.displayName);
  }
  target.select();
  markUnsaved();
  return { renamed_from: oldName, variant: serializeVariant(target) };
}

export function ajVariantDelete(variantId: string) {
  const Variant = getVariantClass();
  const target = findVariantOrThrow(Variant, variantId);
  if (target.isDefault) {
    throw new Error("The default variant cannot be deleted.");
  }
  const { displayName, uuid } = target;
  target.delete();
  markUnsaved();
  return { deleted: { display_name: displayName, uuid } };
}

export function ajVariantApply(variantId: string) {
  const Variant = getVariantClass();
  const target = findVariantOrThrow(Variant, variantId);
  target.select();
  return { applied: serializeVariant(target, target.uuid) };
}

export function ajBlueprintSettingsGet() {
  return getAJSettings();
}

export function ajBlueprintSettingsSet(key: string, value: SettingValue) {
  const settings = getAJSettings();

  if (!(key in settings)) {
    throw new Error(
      `Unknown Blueprint Setting "${key}". ` +
        `Use inspect(target='settings') to see available keys.`
    );
  }

  const current = settings[key];
  const expected = typeName(current);
  const actual = typeName(value);

  let nextValue: SettingValue = value;
  if (expected !== actual) {
    if (isNumericLike(current) && isNumericLike(value)) {
      // Coerce to the setting's current representation so NumberSlider
      // settings stored as strings stay strings.
      nextValue = expected === "string" ? String(value) : Number(value);
    } else {
      throw new Error(
        `Type mismatch for "${key}": expected ${expected}, got ${actual}.`
      );
    }
  }

  settings[key] = nextValue;
  markUnsaved();

  return { key, previous: current, next: nextValue };
}

// ============================================================================
// Registration
// ============================================================================

export function registerAJKeepTools() {
  createTool(
    ajToolDocs[0].name,
    {
      ...ajToolDocs[0],
      async execute() {
        const settings = getAJSettings();
        return JSON.stringify(settings, null, 2);
      },
    },
    ajToolDocs[0].status
  );

  createTool(
    ajToolDocs[1].name,
    {
      ...ajToolDocs[1],
      async execute({ key, value }: { key: string; value: SettingValue }) {
        const settings = getAJSettings();

        if (!(key in settings)) {
          throw new Error(
            `Unknown Blueprint Setting "${key}". ` +
              `Call aj_blueprint_settings_get to see available keys.`
          );
        }

        const current = settings[key];
        const expected = typeName(current);
        const actual = typeName(value);

        let nextValue: SettingValue = value;
        if (expected !== actual) {
          if (isNumericLike(current) && isNumericLike(value)) {
            // Coerce to the setting's current representation so NumberSlider
            // settings stored as strings stay strings.
            nextValue = expected === "string" ? String(value) : Number(value);
          } else {
            throw new Error(
              `Type mismatch for "${key}": expected ${expected}, got ${actual}.`
            );
          }
        }

        settings[key] = nextValue;
        markUnsaved();

        return `Set "${key}" from ${JSON.stringify(current)} to ${JSON.stringify(nextValue)}.`;
      },
    },
    ajToolDocs[1].status
  );

  createTool(
    ajToolDocs[9].name,
    {
      ...ajToolDocs[9],
      async execute() {
        const api = getAJApi();
        if (typeof api.exportProject !== "function") {
          throw new Error("window.AnimatedJava.exportProject is not available.");
        }

        const ok = await api.exportProject();
        if (!ok) {
          return (
            "Export did not complete: it was cancelled or failed validation. " +
            "Check Blockbench for an error dialog (e.g. missing data pack path or invalid " +
            "blueprint settings)."
          );
        }
        return "Export completed using the project's configured export settings.";
      },
    },
    ajToolDocs[9].status
  );

  createTool(
    ajToolDocs[11].name,
    {
      ...ajToolDocs[11],
      async execute({
        easing,
        easing_arg,
        animation_id,
        bone_name,
        channel,
        keyframe_range,
      }: {
        easing: string;
        easing_arg?: number;
        animation_id?: string;
        bone_name?: string;
        channel?: string;
        keyframe_range?: { start: number; end: number };
      }) {
        getAJProject();

        const AnimationRef = Animation as unknown as {
          all: AJAnimationRuntime[];
          selected?: AJAnimationRuntime;
        };
        const animation = animation_id
          ? AnimationRef.all.find(
              (a) => a.uuid === animation_id || a.name === animation_id
            )
          : AnimationRef.selected;
        if (!animation) {
          throw new Error(
            "No animation found or selected. Pass animation_id, or select an animation in Blockbench."
          );
        }

        const groupFilter = bone_name ? findGroupOrThrow(bone_name).uuid : undefined;
        const channels = channel ? [channel] : ["rotation", "position", "scale"];

        const needsArg = easingHasArg(easing);
        const argValue = needsArg ? easing_arg ?? easingArgDefault(easing) : undefined;

        const animators = animation.animators ?? {};

        const targets: Array<{ easing?: string; easingArgs?: number[] }> = [];
        let skippedNonLinear = 0;

        for (const [uuid, animator] of Object.entries(animators)) {
          if (groupFilter && uuid !== groupFilter) continue;
          for (const ch of channels) {
            const arr = animator[ch];
            if (!Array.isArray(arr)) continue;
            for (const kf of arr as Array<{
              time: number;
              interpolation?: string;
              easing?: string;
              easingArgs?: number[];
            }>) {
              if (
                keyframe_range &&
                (kf.time < keyframe_range.start || kf.time > keyframe_range.end)
              ) {
                continue;
              }
              if (kf.interpolation !== "linear") {
                skippedNonLinear++;
                continue;
              }
              targets.push(kf);
            }
          }
        }

        const skipNote =
          skippedNonLinear > 0
            ? ` Skipped ${skippedNonLinear} non-linear keyframe(s) (easing only applies to linear interpolation).`
            : "";

        if (targets.length === 0) {
          return (
            `No matching linear keyframes found in animation "${animation.name}".${skipNote} ` +
            "Easing only applies to keyframes with 'linear' interpolation; relax the " +
            "bone_name/channel/keyframe_range filters or switch the keyframes to linear first."
          );
        }

        Undo.initEdit({
          animations: [animation] as unknown as _Animation[],
          keyframes: targets as unknown as _Keyframe[],
        });

        for (const kf of targets) {
          if (easing === "linear") {
            kf.easing = "linear";
            delete kf.easingArgs;
          } else {
            kf.easing = easing;
            if (argValue !== undefined && !Number.isNaN(argValue)) {
              kf.easingArgs = [argValue];
            } else {
              delete kf.easingArgs;
            }
          }
        }

        Undo.finishEdit("Set keyframe easing");
        Animator.preview();
        markUnsaved();

        const argNote = needsArg && argValue !== undefined ? ` (arg ${argValue})` : "";
        return `Set easing "${easing}"${argNote} on ${targets.length} keyframe(s) in animation "${animation.name}".${skipNote}`;
      },
    },
    ajToolDocs[11].status
  );
}

export function registerAJOffTools() {
  createTool(
    ajToolDocs[2].name,
    {
      ...ajToolDocs[2],
      async execute({ include_geometry }: { include_geometry: boolean }) {
        getAJProject();

        const roots = Outliner.root
          .map((el) => serializeRigNode(el, include_geometry))
          .filter((n): n is RigNode => n !== null);

        const counts = {
          groups: Group.all.length,
          armatures: Armature.all.length,
          armature_bones: ArmatureBone.all.length,
          cubes: Cube.all.length,
          meshes: Mesh.all.length,
        };

        return JSON.stringify({ counts, roots }, null, 2);
      },
    },
    ajToolDocs[2].status
  );

  createTool(
    ajToolDocs[3].name,
    {
      ...ajToolDocs[3],
      async execute() {
        const Variant = getVariantClass();
        const selectedUuid = Variant.selected?.uuid;
        const variants = Variant.all.map((v) => serializeVariant(v, selectedUuid));
        return JSON.stringify({ count: variants.length, variants }, null, 2);
      },
    },
    ajToolDocs[3].status
  );

  createTool(
    ajToolDocs[4].name,
    {
      ...ajToolDocs[4],
      async execute({ display_name }: { display_name: string }) {
        const Variant = getVariantClass();
        const variant = new Variant(display_name);
        markUnsaved();
        return `Created variant ${JSON.stringify(serializeVariant(variant))}.`;
      },
    },
    ajToolDocs[4].status
  );

  createTool(
    ajToolDocs[5].name,
    {
      ...ajToolDocs[5],
      async execute({ variant }: { variant: string }) {
        const Variant = getVariantClass();
        const source = findVariantOrThrow(Variant, variant);
        source.duplicate();
        markUnsaved();
        const copy = Variant.selected;
        return copy
          ? `Duplicated "${source.displayName}" into ${JSON.stringify(serializeVariant(copy, copy.uuid))}.`
          : `Duplicated "${source.displayName}".`;
      },
    },
    ajToolDocs[5].status
  );

  createTool(
    ajToolDocs[6].name,
    {
      ...ajToolDocs[6],
      async execute({ variant, display_name }: { variant: string; display_name: string }) {
        const Variant = getVariantClass();
        const target = findVariantOrThrow(Variant, variant);
        if (target.isDefault) {
          throw new Error("The default variant cannot be renamed.");
        }

        const oldName = target.displayName;
        target.displayName = Variant.makeDisplayNameUnique(target, display_name);
        if (target.generateNameFromDisplayName) {
          target.name = Variant.makeNameUnique(target, target.displayName);
        }
        target.select();
        markUnsaved();

        return `Renamed variant "${oldName}" to ${JSON.stringify(serializeVariant(target))}.`;
      },
    },
    ajToolDocs[6].status
  );

  createTool(
    ajToolDocs[7].name,
    {
      ...ajToolDocs[7],
      async execute({ variant }: { variant: string }) {
        const Variant = getVariantClass();
        const target = findVariantOrThrow(Variant, variant);
        if (target.isDefault) {
          throw new Error("The default variant cannot be deleted.");
        }

        const { displayName, uuid } = target;
        target.delete();
        markUnsaved();

        return `Deleted variant "${displayName}" (${uuid}).`;
      },
    },
    ajToolDocs[7].status
  );

  createTool(
    ajToolDocs[8].name,
    {
      ...ajToolDocs[8],
      async execute({ variant }: { variant: string }) {
        const Variant = getVariantClass();
        const target = findVariantOrThrow(Variant, variant);
        target.select();
        return `Applied variant "${target.displayName}" (${target.uuid}).`;
      },
    },
    ajToolDocs[8].status
  );

  createTool(
    ajToolDocs[10].name,
    {
      ...ajToolDocs[10],
      async execute() {
        const proj = getAJProject();
        const animations = proj.animations ?? [];
        const mapping = animations.map((a, i) => ({
          id: i,
          name: a.name,
          storage_name: sanitizeStorageKey(a.name),
          loop_mode: a.loop ?? null,
          length: a.length ?? null,
        }));

        return JSON.stringify({ count: mapping.length, animations: mapping }, null, 2);
      },
    },
    ajToolDocs[10].status
  );
}

// Legacy wrapper — kept as inventory (not registered via tools.ts).
export function registerAJTools() {
  registerAJKeepTools();
  registerAJOffTools();
}

// Derived toolDocs for docs-manifest.ts partial OFF.
export const ajKeepToolDocs: ToolSpec[] = [
  ajToolDocs[0],
  ajToolDocs[1],
  ajToolDocs[9],
  ajToolDocs[11],
];

export const ajOffToolDocs: ToolSpec[] = [
  ajToolDocs[2],
  ajToolDocs[3],
  ajToolDocs[4],
  ajToolDocs[5],
  ajToolDocs[6],
  ajToolDocs[7],
  ajToolDocs[8],
  ajToolDocs[10],
];
