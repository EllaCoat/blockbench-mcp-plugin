/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { armatureAdd, armatureUpdate, armatureRemove } from "../armature";
import { ok, err, wrap } from "./_response";

export const armatureOpParameters = z.object({
  action: z
    .enum(["create", "update", "remove"])
    .describe(
      "Operation. create: new armature (skeletal rig). update: mutate fields by id. remove: delete armature and its bones."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Target armature UUID or name. Required for update/remove."
    ),
  name: z.string().optional().describe("Name (create) or new name (update)."),
  visibility: z.boolean().optional(),
  locked: z.boolean().optional(),
  add_initial_bone: z
    .boolean()
    .optional()
    .describe(
      "Whether to add an initial bone on create. Defaults to true."
    ),
  export: z
    .boolean()
    .optional()
    .describe("Whether to export this armature (update only)."),
});

export const armatureOpToolDocs: ToolSpec[] = [
  {
    name: "armature_op",
    description:
      "Armature operations (create/update/remove) collapsed into a single tool. Armatures are skeletal rigs used for mesh deformation; requires a format with armature_rig support. Returns { ok, data, error?, meta? }. Replaces legacy add_armature / update_armature / remove_armature. Use inspect(target='armatures') to list.",
    annotations: {
      title: "Armature Op",
      destructiveHint: true,
    },
    parameters: armatureOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerArmatureOpTool() {
  createTool(
    armatureOpToolDocs[0].name,
    {
      ...armatureOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create":
              return wrap(
                ok(
                  armatureAdd({
                    name: args.name,
                    visibility: args.visibility,
                    locked: args.locked,
                    add_initial_bone: args.add_initial_bone,
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
                  armatureUpdate({
                    id: args.id,
                    name: args.name,
                    visibility: args.visibility,
                    locked: args.locked,
                    export: args.export,
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
                ok(armatureRemove(args.id), { dispatch_target: "remove" })
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("ARMATURE_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    armatureOpToolDocs[0].status
  );
}
