/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  elementRemove,
  elementAddGroup,
  elementDuplicate,
  elementRename,
} from "../element";
import { ok, err, wrap } from "./_response";

export const elementOpParameters = z.object({
  action: z
    .enum(["remove", "add_group", "duplicate", "rename"])
    .describe(
      "Operation. remove: delete element by id. add_group: create a new outliner group. duplicate: copy an element with offset. rename: change an element's name."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Target element UUID or name. Required for remove/duplicate/rename. Use inspect(target='outline') to discover ids."
    ),
  name: z
    .string()
    .optional()
    .describe("Name for add_group (required) or new name for rename (required)."),
  origin: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Pivot origin for add_group."),
  rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Rotation for add_group."),
  parent: z
    .string()
    .optional()
    .describe(
      "Parent group name/uuid for add_group, or 'root' to attach at the outliner root. Defaults to 'root'."
    ),
  visibility: z.boolean().optional().describe("Visibility for add_group. Defaults to true."),
  autouv: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .optional()
    .describe("Auto-UV mode for add_group. Defaults to 1."),
  selected: z
    .boolean()
    .optional()
    .describe("Whether new group is selected after creation. Defaults to false."),
  shade: z.boolean().optional().describe("Shade flag for add_group. Defaults to true."),
  offset: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Position offset for duplicate. Defaults to [0, 0, 0]."),
  new_name: z
    .string()
    .optional()
    .describe("New name for duplicate (optional) or rename (required as 'name')."),
});

export const elementOpToolDocs: ToolSpec[] = [
  {
    name: "element_op",
    description:
      "Element operations (remove/add_group/duplicate/rename) collapsed into a single tool. Replaces legacy remove_element / add_group / duplicate_element / rename_element. Returns { ok, data, error?, meta? }. Use inspect(target='outline') to discover element ids.",
    annotations: {
      title: "Element Op",
      destructiveHint: true,
    },
    parameters: elementOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerElementOpTool() {
  createTool(
    elementOpToolDocs[0].name,
    {
      ...elementOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "remove": {
              if (!args.id) {
                return wrap(err("INVALID_INPUT", "action='remove' requires 'id'."));
              }
              return wrap(
                ok(elementRemove(args.id), { dispatch_target: "remove" })
              );
            }
            case "add_group": {
              if (!args.name) {
                return wrap(
                  err("INVALID_INPUT", "action='add_group' requires 'name'.")
                );
              }
              return wrap(
                ok(
                  elementAddGroup({
                    name: args.name,
                    origin: args.origin ?? [0, 0, 0],
                    rotation: args.rotation ?? [0, 0, 0],
                    parent: args.parent ?? "root",
                    visibility: args.visibility ?? true,
                    // Match legacy zod defaults (= server/tools/element.ts addGroupParameters):
                    // autouv default was "0" (disabled); shade default was false.
                    autouv: (args.autouv ?? 0) as 0 | 1 | 2,
                    selected: args.selected ?? false,
                    shade: args.shade ?? false,
                  }),
                  { dispatch_target: "add_group" }
                )
              );
            }
            case "duplicate": {
              if (!args.id) {
                return wrap(
                  err("INVALID_INPUT", "action='duplicate' requires 'id'.")
                );
              }
              return wrap(
                ok(
                  elementDuplicate({
                    id: args.id,
                    offset: args.offset ?? [0, 0, 0],
                    newName: args.new_name,
                  }),
                  { dispatch_target: "duplicate" }
                )
              );
            }
            case "rename": {
              if (!args.id) {
                return wrap(err("INVALID_INPUT", "action='rename' requires 'id'."));
              }
              const newName = args.new_name ?? args.name;
              if (!newName) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='rename' requires 'new_name' (or 'name')."
                  )
                );
              }
              return wrap(
                ok(elementRename(args.id, newName), {
                  dispatch_target: "rename",
                })
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("ELEMENT_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    elementOpToolDocs[0].status
  );
}
