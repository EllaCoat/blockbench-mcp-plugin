/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  brushSizeSchema,
  opacitySchema,
  brushSoftnessSchema,
  brushShapeEnum,
  hexColorSchema,
  blendModeEnum,
} from "@/lib/zodObjects";
import { brushPresetCreate, brushPresetLoad } from "../paint";
import { ok, err, wrap } from "./_response";

export const brushPresetOpParameters = z.object({
  action: z
    .enum(["create", "load"])
    .describe(
      "Operation. create: save a new brush preset with the given settings. load: activate an existing preset by name."
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Preset name. Required for action='create' (saved as the preset's id) and action='load' (look up by this name)."
    ),
  size: brushSizeSchema.optional().describe("Brush size (create)."),
  opacity: opacitySchema.optional().describe("Brush opacity (create)."),
  softness: brushSoftnessSchema.optional().describe("Brush softness (create)."),
  shape: brushShapeEnum.optional().describe("Brush shape (create)."),
  color: hexColorSchema.optional().describe("Brush color hex (create)."),
  blend_mode: blendModeEnum.optional().describe("Blend mode (create)."),
  pixel_perfect: z
    .boolean()
    .optional()
    .describe("Pixel perfect drawing (create)."),
});

export const brushPresetOpToolDocs: ToolSpec[] = [
  {
    name: "brush_preset_op",
    description:
      "Brush preset operations (create/load) collapsed into a single tool. Presets are persisted via StateMemory.brush_presets. Returns { ok, data, error?, meta? }. Replaces legacy create_brush_preset / load_brush_preset.",
    annotations: {
      title: "Brush Preset Op",
      destructiveHint: true,
    },
    parameters: brushPresetOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerBrushPresetOpTool() {
  createTool(
    brushPresetOpToolDocs[0].name,
    {
      ...brushPresetOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create":
              if (!args.name) {
                return wrap(
                  err("INVALID_INPUT", "action='create' requires 'name'.")
                );
              }
              return wrap(
                ok(
                  brushPresetCreate({
                    name: args.name,
                    size: args.size,
                    opacity: args.opacity,
                    softness: args.softness,
                    shape: args.shape,
                    color: args.color,
                    blend_mode: args.blend_mode,
                    pixel_perfect: args.pixel_perfect,
                  }),
                  { dispatch_target: "create" }
                )
              );
            case "load":
              if (!args.name) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='load' requires 'name' (preset name)."
                  )
                );
              }
              return wrap(
                ok(
                  brushPresetLoad({ preset_name: args.name }),
                  { dispatch_target: "load" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "BRUSH_PRESET_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    brushPresetOpToolDocs[0].status
  );
}
