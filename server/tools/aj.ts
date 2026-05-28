/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";

/**
 * Animated Java augments the active Blockbench project with an `animated_java`
 * object holding all Blueprint Settings as a flat record. Only AJ Blueprint
 * projects carry it, so its presence is used to gate these tools.
 */
interface AJBlueprintProject {
  animated_java?: Record<string, unknown>;
  saved?: boolean;
}

type SettingValue = string | number | boolean | number[];

const AJ_FORMAT_ID = "animated_java:format/blueprint";

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
  getAJProject();
  const api = (globalThis as { AnimatedJava?: { Variant?: unknown } }).AnimatedJava;
  if (!api?.Variant) {
    throw new Error(
      "The Animated Java API (window.AnimatedJava.Variant) is not available. " +
        "Ensure the Animated Java plugin is loaded."
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
      "through separate windows (list_outline vs list_armatures). Each node reports " +
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
// Registration
// ============================================================================

export function registerAJTools() {
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
        if (expected !== actual) {
          throw new Error(
            `Type mismatch for "${key}": expected ${expected}, got ${actual}.`
          );
        }

        settings[key] = value;
        markUnsaved();

        return `Set "${key}" from ${JSON.stringify(current)} to ${JSON.stringify(value)}.`;
      },
    },
    ajToolDocs[1].status
  );

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
          ? `Duplicated "${source.displayName}" into ${JSON.stringify(serializeVariant(copy))}.`
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
}
