/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { ajBlueprintSettingsGet, ajBlueprintSettingsSet } from "../aj";
import { ok, err, wrap } from "./_response";

export const ajBlueprintSettingsOpParameters = z.object({
  action: z
    .enum(["get", "set"])
    .describe(
      "Operation. get: returns all Blueprint Settings as a JSON object. set: updates a single setting by key."
    ),
  key: z
    .string()
    .optional()
    .describe(
      "Blueprint Setting key to update (e.g. `tsb_optimized_export`). Required for set."
    ),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.number())])
    .optional()
    .describe(
      "New value for the setting. Type must match the setting's current type. Required for set."
    ),
});

export const ajBlueprintSettingsOpToolDocs: ToolSpec[] = [
  {
    name: "aj_blueprint_settings_op",
    description:
      "Animated Java Blueprint Settings operations (get/set) collapsed into a single tool. Returns { ok, data, error?, meta? }. Replaces legacy aj_blueprint_settings_get / aj_blueprint_settings_set. Requires an Animated Java Blueprint project to be open.",
    annotations: {
      title: "AJ Blueprint Settings Op",
    },
    parameters: ajBlueprintSettingsOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerAJBlueprintSettingsOpTool() {
  createTool(
    ajBlueprintSettingsOpToolDocs[0].name,
    {
      ...ajBlueprintSettingsOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "get":
              return wrap(
                ok(ajBlueprintSettingsGet(), { dispatch_target: "get" })
              );
            case "set": {
              if (args.key === undefined) {
                return wrap(
                  err("INVALID_INPUT", "action='set' requires 'key'.")
                );
              }
              if (args.value === undefined) {
                return wrap(
                  err("INVALID_INPUT", "action='set' requires 'value'.")
                );
              }
              return wrap(
                ok(ajBlueprintSettingsSet(args.key, args.value), {
                  dispatch_target: "set",
                })
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "AJ_BLUEPRINT_SETTINGS_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    ajBlueprintSettingsOpToolDocs[0].status
  );
}
