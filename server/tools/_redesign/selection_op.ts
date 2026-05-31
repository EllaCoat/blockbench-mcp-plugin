/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_STABLE } from "@/lib/constants";
import { elementIdSchema } from "@/lib/zodObjects";
import { selectAllOfType } from "../element";
import { selectArmatureBones } from "../armature";
import { ok, err, wrap } from "./_response";

export const selectionOpParameters = z.object({
  action: z
    .enum(["all_of_type", "armature_bones"])
    .describe(
      "Selection scope. all_of_type: select every cube/mesh/group of a given type. armature_bones: select bones by id or whole armature."
    ),
  type: z
    .enum(["cube", "mesh", "group"])
    .optional()
    .describe(
      "Element type. Required for action='all_of_type'."
    ),
  parent_group: z
    .string()
    .optional()
    .describe(
      "Parent group (UUID or name) to scope the selection. For action='all_of_type'."
    ),
  add_to_selection: z
    .boolean()
    .optional()
    .describe(
      "If true, add to current selection instead of replacing. For action='all_of_type'."
    ),
  ids: z
    .array(elementIdSchema)
    .optional()
    .describe(
      "Bone UUIDs or names to select. For action='armature_bones'."
    ),
  armature_id: z
    .string()
    .optional()
    .describe(
      "Select all bones in this armature. For action='armature_bones'."
    ),
  include_descendants: z
    .boolean()
    .optional()
    .describe(
      "Include descendant bones in selection. For action='armature_bones'."
    ),
  clear_selection: z
    .boolean()
    .optional()
    .describe(
      "Clear existing selection before selecting (default true). For action='armature_bones'."
    ),
});

export const selectionOpToolDocs: ToolSpec[] = [
  {
    name: "selection_op",
    description:
      "Selection operations (all_of_type/armature_bones) collapsed into a single tool. all_of_type selects every cube/mesh/group of a given type (optionally scoped to a parent group); armature_bones selects bones by id list or whole armature. Returns { ok, data, error?, meta? }. Replaces legacy select_all_of_type / select_armature_bones. Use inspect(target='selection') to read the current selection.",
    annotations: {
      title: "Selection Op",
      destructiveHint: false,
    },
    parameters: selectionOpParameters,
    status: STATUS_STABLE,
  },
];

export function registerSelectionOpTool() {
  createTool(
    selectionOpToolDocs[0].name,
    {
      ...selectionOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "all_of_type":
              if (!args.type) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='all_of_type' requires 'type'."
                  )
                );
              }
              return wrap(
                ok(
                  selectAllOfType({
                    type: args.type,
                    add_to_selection: args.add_to_selection,
                    parent_group: args.parent_group,
                  }),
                  { dispatch_target: "all_of_type" }
                )
              );
            case "armature_bones":
              if (
                (!args.ids || args.ids.length === 0) &&
                !args.armature_id
              ) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='armature_bones' requires 'ids' or 'armature_id'."
                  )
                );
              }
              return wrap(
                ok(
                  selectArmatureBones({
                    ids: args.ids,
                    armature_id: args.armature_id,
                    include_descendants: args.include_descendants,
                    clear_selection: args.clear_selection,
                  }),
                  { dispatch_target: "armature_bones" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("SELECTION_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    selectionOpToolDocs[0].status
  );
}
