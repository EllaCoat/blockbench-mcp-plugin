/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  nullObjectAdd,
  nullObjectUpdate,
  nullObjectRemove,
} from "../null-object";
import { ok, err, wrap } from "./_response";

export const nullObjectOpParameters = z.object({
  action: z
    .enum(["create", "update", "remove"])
    .describe(
      "Operation. create: new null object (IK target). update: mutate fields by id. remove: delete by id."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Target null object UUID or name. Required for update/remove."
    ),
  name: z.string().optional().describe("Name (create) or new name (update)."),
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Position [x, y, z]."),
  parent: z
    .string()
    .optional()
    .describe(
      "Parent group (name/UUID) for create. Defaults to outliner root."
    ),
  ik_target: z
    .string()
    .optional()
    .describe(
      "IK chain end node (Group/Locator/ArmatureBone, by name or UUID). Pass empty string in update to clear."
    ),
  ik_source: z
    .string()
    .optional()
    .describe(
      "IK chain start node. Pass empty string in update to clear."
    ),
  lock_ik_target_rotation: z
    .boolean()
    .optional()
    .describe("Lock the IK target's rotation while solving."),
  visibility: z.boolean().optional().describe("Visibility (update only)."),
  locked: z.boolean().optional().describe("Lock flag (update only)."),
});

export const nullObjectOpToolDocs: ToolSpec[] = [
  {
    name: "null_object_op",
    description:
      "Null object operations (create/update/remove) collapsed into a single tool. Null objects act as IK targets in animation_mode formats. Returns { ok, data, error?, meta? }. Replaces legacy add_null_object / update_null_object / remove_null_object. Use inspect(target='null_objects') to list.",
    annotations: {
      title: "Null Object Op",
      destructiveHint: true,
    },
    parameters: nullObjectOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerNullObjectOpTool() {
  createTool(
    nullObjectOpToolDocs[0].name,
    {
      ...nullObjectOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create":
              return wrap(
                ok(
                  nullObjectAdd({
                    name: args.name,
                    position: args.position,
                    parent: args.parent,
                    ik_target: args.ik_target,
                    ik_source: args.ik_source,
                    lock_ik_target_rotation: args.lock_ik_target_rotation,
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
                  nullObjectUpdate({
                    id: args.id,
                    name: args.name,
                    position: args.position,
                    ik_target: args.ik_target,
                    ik_source: args.ik_source,
                    lock_ik_target_rotation: args.lock_ik_target_rotation,
                    visibility: args.visibility,
                    locked: args.locked,
                  }),
                  { dispatch_target: "update" }
                )
              );
            case "remove":
              if (!args.id) {
                return wrap(
                  err("INVALID_INPUT", "action='remove' requires 'id'.")
                );
              }
              return wrap(
                ok(nullObjectRemove(args.id), { dispatch_target: "remove" })
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "NULL_OBJECT_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    nullObjectOpToolDocs[0].status
  );
}
