/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  ajVariantCreate,
  ajVariantDuplicate,
  ajVariantUpdate,
  ajVariantDelete,
  ajVariantApply,
} from "../aj";
import { ok, err, wrap } from "./_response";

// Action discriminator union that collapses the legacy 5 variant tools
// (aj_variant_create / _duplicate / _update / _delete / _apply) into a
// single tool with a single shared param surface.

export const ajVariantOpParameters = z.object({
  action: z
    .enum(["create", "duplicate", "update", "delete", "apply"])
    .describe(
      "Operation to perform. create: new empty variant. duplicate: copy an existing variant. update: rename. delete: remove. apply: select for the preview viewport."
    ),
  variant: z
    .string()
    .optional()
    .describe(
      "Target variant for duplicate/update/delete/apply. UUID, internal name, or display name."
    ),
  display_name: z
    .string()
    .optional()
    .describe(
      "Display name for create/update. Made unique automatically if it collides."
    ),
});

export const ajVariantOpToolDocs: ToolSpec[] = [
  {
    name: "aj_variant_op",
    description:
      "Animated Java variant operations (create/duplicate/update/delete/apply) collapsed into a single tool. Specify `action` plus the relevant fields. Returns { ok, data, error?, meta? }. Replaces legacy aj_variant_create / aj_variant_duplicate / aj_variant_update / aj_variant_delete / aj_variant_apply.",
    annotations: {
      title: "AJ: Variant Op",
    },
    parameters: ajVariantOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerAJVariantOpTool() {
  createTool(
    ajVariantOpToolDocs[0].name,
    {
      ...ajVariantOpToolDocs[0],
      async execute({ action, variant, display_name }) {
        try {
          switch (action) {
            case "create": {
              if (!display_name) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='create' requires 'display_name'."
                  )
                );
              }
              return wrap(
                ok(ajVariantCreate(display_name), { dispatch_target: "create" })
              );
            }
            case "duplicate": {
              if (!variant) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='duplicate' requires 'variant'."
                  )
                );
              }
              return wrap(
                ok(ajVariantDuplicate(variant), {
                  dispatch_target: "duplicate",
                })
              );
            }
            case "update": {
              if (!variant || !display_name) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='update' requires both 'variant' and 'display_name'."
                  )
                );
              }
              return wrap(
                ok(ajVariantUpdate(variant, display_name), {
                  dispatch_target: "update",
                })
              );
            }
            case "delete": {
              if (!variant) {
                return wrap(
                  err("INVALID_INPUT", "action='delete' requires 'variant'.")
                );
              }
              return wrap(
                ok(ajVariantDelete(variant), { dispatch_target: "delete" })
              );
            }
            case "apply": {
              if (!variant) {
                return wrap(
                  err("INVALID_INPUT", "action='apply' requires 'variant'.")
                );
              }
              return wrap(
                ok(ajVariantApply(variant), { dispatch_target: "apply" })
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "AJ_VARIANT_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    ajVariantOpToolDocs[0].status
  );
}
