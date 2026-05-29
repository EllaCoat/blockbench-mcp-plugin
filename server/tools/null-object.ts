/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL, STATUS_STABLE } from "@/lib/constants";
import { elementIdSchema, vector3Schema } from "@/lib/zodObjects";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a NullObject by UUID or name.
 */
function findNullObject(id: string): NullObject | undefined {
  return NullObject.all.find(
    (n) => n.uuid === id || n.name === id || n.uuid.startsWith(id)
  );
}

function findNullObjectOrThrow(id: string): NullObject {
  const nullObject = findNullObject(id);
  if (!nullObject) {
    throw new Error(`NullObject not found: ${id}`);
  }
  return nullObject;
}

/**
 * Resolve an IK target/source reference (name or UUID) to a node UUID.
 * IK target/source must point at an animatable node — a Group, Locator or
 * ArmatureBone. Returns the node's UUID (Blockbench stores ik_target/ik_source
 * as UUID strings, see null_object.js set_ik_target/set_ik_source actions).
 */
function resolveAnimatableUuid(id: string): string {
  const candidates: OutlinerElement[] = [];
  // @ts-ignore — Blockbench runtime globals, types are incomplete.
  if (typeof Group !== "undefined") candidates.push(...Group.all);
  // @ts-ignore
  if (typeof Locator !== "undefined") candidates.push(...Locator.all);
  // @ts-ignore
  if (typeof ArmatureBone !== "undefined") candidates.push(...ArmatureBone.all);

  const node = candidates.find(
    (n) => n.uuid === id || n.name === id || n.uuid.startsWith(id)
  );
  if (!node) {
    throw new Error(
      `IK reference target not found: "${id}". Must be a Group, Locator or ArmatureBone (by name or UUID).`
    );
  }
  return node.uuid;
}

/**
 * Resolve a parent reference to a Group instance, or Outliner.root.
 */
function resolveParent(parent: string | undefined): Group | OutlinerNode {
  if (!parent || parent === "root") {
    // @ts-ignore — Outliner.root is a valid addTo target.
    return Outliner.root;
  }
  // @ts-ignore
  const group = Group.all.find(
    (g) => g.name === parent || g.uuid === parent || g.uuid.startsWith(parent)
  );
  if (!group) {
    throw new Error(`Parent group not found: ${parent}`);
  }
  return group;
}

function serializeNullObject(nullObject: NullObject) {
  return {
    uuid: nullObject.uuid,
    name: nullObject.name,
    type: nullObject.type,
    position: nullObject.position,
    // @ts-ignore — ik_* props exist on NullObject (animation_mode formats).
    ik_target: nullObject.ik_target || null,
    // @ts-ignore
    ik_source: nullObject.ik_source || null,
    // @ts-ignore
    lock_ik_target_rotation: nullObject.lock_ik_target_rotation,
    // @ts-ignore
    visibility: nullObject.visibility,
    locked: nullObject.locked,
  };
}

// ============================================================================
// NullObject Tool Parameter Schemas
// ============================================================================

export const listNullObjectsParameters = z.object({});

export const addNullObjectParameters = z.object({
  name: z
    .string()
    .optional()
    .default("null_object")
    .describe("Name for the new null object."),
  position: vector3Schema
    .optional()
    .describe("Position [x, y, z]. Defaults to [0, 0, 0]."),
  parent: z
    .string()
    .optional()
    .describe(
      "Parent group (name or UUID) to nest the null object under. Defaults to the outliner root. For IK, place the null object inside the chain's root group."
    ),
  ik_target: z
    .string()
    .optional()
    .describe(
      "IK chain end node (Group/Locator/ArmatureBone, by name or UUID). The chain bones rotate so this node reaches the null object's position. Requires an animation_mode format."
    ),
  ik_source: z
    .string()
    .optional()
    .describe(
      "IK chain start node (Group/Locator/ArmatureBone, by name or UUID). Optional; bounds the upper end of the solved chain. Requires an animation_mode format."
    ),
  lock_ik_target_rotation: z
    .boolean()
    .optional()
    .default(false)
    .describe("Lock the IK target's rotation while solving."),
});

export const updateNullObjectParameters = z.object({
  id: elementIdSchema.describe("UUID or name of the null object."),
  name: z.string().optional(),
  position: vector3Schema.optional().describe("New position [x, y, z]."),
  ik_target: z
    .string()
    .optional()
    .describe("New IK target node (name or UUID). Pass empty string to clear."),
  ik_source: z
    .string()
    .optional()
    .describe("New IK source node (name or UUID). Pass empty string to clear."),
  lock_ik_target_rotation: z.boolean().optional(),
  visibility: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export const removeNullObjectParameters = z.object({
  id: elementIdSchema.describe(
    "UUID or name of the null object to remove."
  ),
});

// ============================================================================
// NullObject Tool Docs
// ============================================================================

export const nullObjectToolDocs: ToolSpec[] = [
  {
    name: "list_null_objects",
    description:
      "Lists all null objects in the current project with their position and IK settings.",
    annotations: {
      title: "List Null Objects",
      readOnlyHint: true,
    },
    parameters: listNullObjectsParameters,
    status: STATUS_STABLE,
  },
  {
    name: "add_null_object",
    description:
      "Creates a null object. Null objects are IK targets: set ik_target to a chain-end node and the chain bones rotate so that node reaches the null object's animated position. Requires an animation_mode format (e.g. Animated Java Blueprint) for the IK settings to apply.",
    annotations: {
      title: "Add Null Object",
      destructiveHint: true,
    },
    parameters: addNullObjectParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "update_null_object",
    description:
      "Updates an existing null object's name, position, IK target/source, lock or visibility.",
    annotations: {
      title: "Update Null Object",
      destructiveHint: true,
    },
    parameters: updateNullObjectParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "remove_null_object",
    description: "Removes a null object from the project.",
    annotations: {
      title: "Remove Null Object",
      destructiveHint: true,
    },
    parameters: removeNullObjectParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

// ============================================================================
// NullObject Tools
// ============================================================================

export function registerNullObjectTools() {
  // ---------------------------------------------------------------------------
  // List Null Objects
  // ---------------------------------------------------------------------------
  createTool(
    nullObjectToolDocs[0].name,
    {
      ...nullObjectToolDocs[0],
      async execute() {
        const nullObjects = NullObject.all.map(serializeNullObject);
        return JSON.stringify(
          { count: nullObjects.length, null_objects: nullObjects },
          null,
          2
        );
      },
    },
    nullObjectToolDocs[0].status
  );

  // ---------------------------------------------------------------------------
  // Add Null Object
  // ---------------------------------------------------------------------------
  createTool(
    nullObjectToolDocs[1].name,
    {
      ...nullObjectToolDocs[1],
      async execute({
        name,
        position,
        parent,
        ik_target,
        ik_source,
        lock_ik_target_rotation,
      }) {
        // @ts-ignore — Format global.
        const animationMode = !!Format?.animation_mode;
        if ((ik_target || ik_source) && !animationMode) {
          throw new Error(
            "Current format does not support IK (ik_target/ik_source require an animation_mode format like Animated Java Blueprint)."
          );
        }

        const parentTarget = resolveParent(parent);
        const targetUuid = ik_target ? resolveAnimatableUuid(ik_target) : undefined;
        const sourceUuid = ik_source ? resolveAnimatableUuid(ik_source) : undefined;

        Undo.initEdit({ outliner: true, elements: [] });

        const nullObject = new NullObject({
          name,
          position: (position ?? [0, 0, 0]) as [number, number, number],
        });
        // @ts-ignore — addTo accepts Group | Outliner.root.
        nullObject.addTo(parentTarget);
        nullObject.init();
        nullObject.createUniqueName();

        if (targetUuid !== undefined) {
          // @ts-ignore
          nullObject.ik_target = targetUuid;
        }
        if (sourceUuid !== undefined) {
          // @ts-ignore
          nullObject.ik_source = sourceUuid;
        }
        if (lock_ik_target_rotation !== undefined) {
          // @ts-ignore
          nullObject.lock_ik_target_rotation = lock_ik_target_rotation;
        }

        Undo.finishEdit("Agent added null object", {
          outliner: true,
          elements: [nullObject],
        });
        Canvas.updateAll();

        return JSON.stringify(
          {
            message: `Created null object "${nullObject.name}"`,
            null_object: serializeNullObject(nullObject),
          },
          null,
          2
        );
      },
    },
    nullObjectToolDocs[1].status
  );

  // ---------------------------------------------------------------------------
  // Update Null Object
  // ---------------------------------------------------------------------------
  createTool(
    nullObjectToolDocs[2].name,
    {
      ...nullObjectToolDocs[2],
      async execute({
        id,
        name,
        position,
        ik_target,
        ik_source,
        lock_ik_target_rotation,
        visibility,
        locked,
      }) {
        const nullObject = findNullObjectOrThrow(id);

        // @ts-ignore — Format global.
        const animationMode = !!Format?.animation_mode;
        if ((ik_target || ik_source) && !animationMode) {
          throw new Error(
            "Current format does not support IK (ik_target/ik_source require an animation_mode format)."
          );
        }

        Undo.initEdit({ outliner: true, elements: [nullObject] });

        if (name !== undefined) nullObject.name = name;
        if (position !== undefined) {
          nullObject.position.V3_set(position as [number, number, number]);
        }
        if (ik_target !== undefined) {
          // @ts-ignore — empty string clears the target.
          nullObject.ik_target = ik_target === "" ? "" : resolveAnimatableUuid(ik_target);
        }
        if (ik_source !== undefined) {
          // @ts-ignore
          nullObject.ik_source = ik_source === "" ? "" : resolveAnimatableUuid(ik_source);
        }
        if (lock_ik_target_rotation !== undefined) {
          // @ts-ignore
          nullObject.lock_ik_target_rotation = lock_ik_target_rotation;
        }
        // @ts-ignore — visibility missing from NullObject type, exists at runtime.
        if (visibility !== undefined) nullObject.visibility = visibility;
        if (locked !== undefined) nullObject.locked = locked;

        nullObject.preview_controller.updateTransform(nullObject);
        nullObject.createUniqueName();
        Undo.finishEdit("Agent updated null object");
        Canvas.updateAll();

        return JSON.stringify(
          {
            message: `Updated null object "${nullObject.name}"`,
            null_object: serializeNullObject(nullObject),
          },
          null,
          2
        );
      },
    },
    nullObjectToolDocs[2].status
  );

  // ---------------------------------------------------------------------------
  // Remove Null Object
  // ---------------------------------------------------------------------------
  createTool(
    nullObjectToolDocs[3].name,
    {
      ...nullObjectToolDocs[3],
      async execute({ id }) {
        const nullObject = findNullObjectOrThrow(id);
        const name = nullObject.name;

        Undo.initEdit({ outliner: true, elements: [] });
        nullObject.remove();
        Undo.finishEdit("Agent removed null object");
        Canvas.updateAll();

        return `Removed null object "${name}"`;
      },
    },
    nullObjectToolDocs[3].status
  );
}
