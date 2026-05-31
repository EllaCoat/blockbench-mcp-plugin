/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  armatureBoneAdd,
  armatureBoneUpdate,
  armatureBoneUpdateBatch,
  armatureBoneRemove,
} from "../armature";
import { ok, err, wrap } from "./_response";

export const armatureBoneOpParameters = z.object({
  action: z
    .enum(["create", "update", "update_batch", "remove"])
    .describe(
      "Operation. create: new bone under parent (armature or bone). update: mutate one bone by id. update_batch: apply visibility/locked/color to many bones at once. remove: delete bone."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Target bone UUID or name. Required for update/remove."
    ),
  ids: z
    .array(z.string())
    .optional()
    .describe(
      "Array of bone UUIDs or names. Required for update_batch."
    ),
  parent_id: z
    .string()
    .optional()
    .describe(
      "Parent armature or bone (name/UUID). Required for create."
    ),
  name: z.string().optional().describe("Name (create) or new name (update)."),
  origin: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Position [x, y, z]. Defaults to [0, parent.length, 0] for child bones on create."),
  rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Rotation [x, y, z] in degrees."),
  length: z.number().optional().describe("Bone length."),
  width: z.number().optional().describe("Bone width."),
  connected: z
    .boolean()
    .optional()
    .describe("Whether bone is connected to parent."),
  color: z
    .number()
    .int()
    .min(0)
    .max(7)
    .optional()
    .describe("Marker color index (0-7)."),
  visibility: z.boolean().optional().describe("Visibility (update/update_batch)."),
  locked: z.boolean().optional().describe("Lock flag (update/update_batch)."),
  remove_children: z
    .boolean()
    .optional()
    .describe(
      "When action=remove, whether to also remove child bones. Default true."
    ),
});

export const armatureBoneOpToolDocs: ToolSpec[] = [
  {
    name: "armature_bone_op",
    description:
      "Armature bone operations (create/update/update_batch/remove) collapsed into a single tool. Bones are children of an Armature or another bone. Returns { ok, data, error?, meta? }. Replaces legacy add_armature_bone / update_armature_bone / update_armature_bones_batch / remove_armature_bone. Use inspect(target='bones') to list.",
    annotations: {
      title: "Armature Bone Op",
      destructiveHint: true,
    },
    parameters: armatureBoneOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerArmatureBoneOpTool() {
  createTool(
    armatureBoneOpToolDocs[0].name,
    {
      ...armatureBoneOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create":
              if (!args.parent_id) {
                return wrap(
                  err("INVALID_INPUT", "action='create' requires 'parent_id'.")
                );
              }
              return wrap(
                ok(
                  armatureBoneAdd({
                    parent_id: args.parent_id,
                    name: args.name,
                    origin: args.origin,
                    rotation: args.rotation,
                    length: args.length,
                    width: args.width,
                    connected: args.connected,
                    color: args.color,
                  }),
                  { dispatch_target: "create" }
                )
              );
            case "update":
              if (!args.id) {
                return wrap(
                  err("INVALID_INPUT", "action='update' requires 'id'.")
                );
              }
              return wrap(
                ok(
                  armatureBoneUpdate({
                    id: args.id,
                    name: args.name,
                    origin: args.origin,
                    rotation: args.rotation,
                    length: args.length,
                    width: args.width,
                    connected: args.connected,
                    color: args.color,
                    visibility: args.visibility,
                    locked: args.locked,
                  }),
                  { dispatch_target: "update" }
                )
              );
            case "update_batch":
              if (!args.ids || args.ids.length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='update_batch' requires non-empty 'ids'."
                  )
                );
              }
              return wrap(
                ok(
                  armatureBoneUpdateBatch({
                    ids: args.ids,
                    visibility: args.visibility,
                    locked: args.locked,
                    color: args.color,
                  }),
                  { dispatch_target: "update_batch", count: args.ids.length }
                )
              );
            case "remove":
              if (!args.id) {
                return wrap(
                  err("INVALID_INPUT", "action='remove' requires 'id'.")
                );
              }
              return wrap(
                ok(
                  armatureBoneRemove({
                    id: args.id,
                    remove_children: args.remove_children,
                  }),
                  { dispatch_target: "remove" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "ARMATURE_BONE_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    armatureBoneOpToolDocs[0].status
  );
}
