/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  paintFillTool,
  paintDrawShape,
  paintGradient,
  paintColorPick,
  paintCopyBrush,
  paintEraser,
  paintSettings,
  paintWithBrush,
  paintTextureSelection,
  paintTextureLayer,
} from "../paint";
import { ok, err, wrap } from "./_response";

const point2D = z.object({ x: z.number(), y: z.number() });
const selectionCoords = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

export const paintToolOpParameters = z.object({
  action: z
    .enum([
      "fill",
      "shape",
      "gradient",
      "color_pick",
      "copy_brush",
      "eraser",
      "settings",
      "paint_with_brush",
      "texture_selection",
      "texture_layer",
    ])
    .describe(
      "Paint operation. Most ops require texture_id (defaults to the active texture). Coordinates are in texture-space pixels unless noted."
    ),
  texture_id: z
    .string()
    .optional()
    .describe(
      "Texture uuid/name/id. Defaults to the currently active texture if omitted."
    ),
  // fill / color_pick
  x: z.number().optional().describe("Texture-space x (fill / color_pick)."),
  y: z.number().optional().describe("Texture-space y (fill / color_pick)."),
  color: z.string().optional().describe("Hex color (fill / shape)."),
  opacity: z
    .number()
    .optional()
    .describe(
      "0-100 for fill/shape/gradient/copy_brush/eraser; 0-100 layer opacity for texture_layer set_opacity."
    ),
  tolerance: z.number().optional().describe("fill: fill tolerance."),
  fill_mode: z.string().optional().describe("fill: fill mode label."),
  blend_mode: z
    .string()
    .optional()
    .describe("Blend mode (fill/shape/gradient or texture_layer set_blend_mode)."),
  // shape / gradient / copy_brush
  shape: z.string().optional().describe("shape kind (shape) or brush shape (eraser)."),
  start: point2D.optional().describe("shape/gradient: start point."),
  end: point2D.optional().describe("shape/gradient: end point."),
  line_width: z.number().optional().describe("shape: line/outline width."),
  start_color: z.string().optional().describe("gradient: starting color (hex)."),
  end_color: z.string().optional().describe("gradient: ending color (hex)."),
  set_as_secondary: z
    .boolean()
    .optional()
    .describe("color_pick: store the picked color as the secondary color."),
  pick_opacity: z
    .boolean()
    .optional()
    .describe("color_pick: also pick opacity from the texture alpha."),
  source: point2D.optional().describe("copy_brush: source point."),
  target: point2D.optional().describe("copy_brush: target point."),
  brush_size: z.number().optional().describe("Brush size (copy_brush / eraser)."),
  mode: z
    .string()
    .optional()
    .describe("Copy-brush mode (copy_brush) or selection mode (texture_selection)."),
  // eraser / paint_with_brush
  coordinates: z
    .union([z.array(point2D), selectionCoords])
    .optional()
    .describe(
      "Array of points (eraser / paint_with_brush) or rectangle coords (texture_selection select_rectangle / select_ellipse)."
    ),
  softness: z.number().optional().describe("eraser: brush softness."),
  connect_strokes: z
    .boolean()
    .optional()
    .describe("eraser / paint_with_brush: continue the previous stroke instead of starting a new one."),
  brush_settings: z
    .object({
      color: z.string().optional(),
      opacity: z.number().optional(),
      size: z.number().optional(),
      softness: z.number().optional(),
      shape: z.string().optional(),
    })
    .optional()
    .describe("paint_with_brush: brush configuration."),
  // settings (full set)
  mirror_painting: z
    .object({
      enabled: z.boolean(),
      axis: z.array(z.string()).optional(),
      // Match legacy schema (= paintSettingsParameters.mirror_painting.texture).
      texture: z.boolean().optional(),
      texture_center: point2D.optional(),
    })
    .optional()
    .describe("settings: mirror painting configuration."),
  lock_alpha: z.boolean().optional().describe("settings: lock alpha channel."),
  pixel_perfect: z.boolean().optional().describe("settings: pixel-perfect drawing."),
  paint_side_restrict: z.boolean().optional(),
  color_erase_mode: z.boolean().optional(),
  brush_opacity_modifier: z.string().optional(),
  brush_size_modifier: z.string().optional(),
  paint_with_stylus_only: z.boolean().optional(),
  pick_color_opacity: z.boolean().optional(),
  pick_combined_color: z.boolean().optional(),
  // texture_selection
  radius: z
    .number()
    .optional()
    .describe("texture_selection: radius for expand/contract/feather."),
  // texture_layer
  layer_name: z
    .string()
    .optional()
    .describe("texture_layer: name for create_layer or rename_layer."),
  target_index: z
    .number()
    .int()
    .optional()
    .describe("texture_layer: target index for move_layer."),
});

export const paintToolOpToolDocs: ToolSpec[] = [
  {
    name: "paint_tool_op",
    description:
      "Paint operations (fill/shape/gradient/color_pick/copy_brush/eraser/settings/paint_with_brush/texture_selection/texture_layer) collapsed into a single tool. Replaces legacy paint_fill_tool / draw_shape_tool / gradient_tool / color_picker_tool / copy_brush_tool / eraser_tool / paint_settings / paint_with_brush / texture_selection / texture_layer_management. Returns { ok, data, error?, meta? }.",
    annotations: {
      title: "Paint Tool Op",
    },
    parameters: paintToolOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerPaintToolOpTool() {
  createTool(
    paintToolOpToolDocs[0].name,
    {
      ...paintToolOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "fill": {
              if (args.x === undefined || args.y === undefined) {
                return wrap(
                  err("INVALID_INPUT", "action='fill' requires 'x' and 'y'.")
                );
              }
              return wrap(
                ok(
                  paintFillTool({
                    texture_id: args.texture_id,
                    x: args.x,
                    y: args.y,
                    color: args.color,
                    opacity: args.opacity,
                    tolerance: args.tolerance,
                    fill_mode: args.fill_mode,
                    blend_mode: args.blend_mode,
                  }),
                  { dispatch_target: "fill" }
                )
              );
            }
            case "shape": {
              if (!args.shape || !args.start || !args.end) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='shape' requires 'shape', 'start', and 'end'."
                  )
                );
              }
              return wrap(
                ok(
                  paintDrawShape({
                    texture_id: args.texture_id,
                    shape: args.shape,
                    start: args.start,
                    end: args.end,
                    color: args.color,
                    line_width: args.line_width,
                    opacity: args.opacity,
                    blend_mode: args.blend_mode,
                  }),
                  { dispatch_target: "shape" }
                )
              );
            }
            case "gradient": {
              if (!args.start || !args.end || !args.start_color || !args.end_color) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='gradient' requires 'start', 'end', 'start_color', 'end_color'."
                  )
                );
              }
              return wrap(
                ok(
                  paintGradient({
                    texture_id: args.texture_id,
                    start: args.start,
                    end: args.end,
                    start_color: args.start_color,
                    end_color: args.end_color,
                    opacity: args.opacity,
                    blend_mode: args.blend_mode,
                  }),
                  { dispatch_target: "gradient" }
                )
              );
            }
            case "color_pick": {
              if (args.x === undefined || args.y === undefined) {
                return wrap(
                  err("INVALID_INPUT", "action='color_pick' requires 'x' and 'y'.")
                );
              }
              return wrap(
                ok(
                  paintColorPick({
                    texture_id: args.texture_id,
                    x: args.x,
                    y: args.y,
                    set_as_secondary: args.set_as_secondary,
                    pick_opacity: args.pick_opacity,
                  }),
                  { dispatch_target: "color_pick" }
                )
              );
            }
            case "copy_brush": {
              if (!args.source || !args.target) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='copy_brush' requires 'source' and 'target'."
                  )
                );
              }
              return wrap(
                ok(
                  paintCopyBrush({
                    texture_id: args.texture_id,
                    source: args.source,
                    target: args.target,
                    brush_size: args.brush_size,
                    opacity: args.opacity,
                    mode: args.mode,
                  }),
                  { dispatch_target: "copy_brush" }
                )
              );
            }
            case "eraser": {
              if (!args.coordinates || !Array.isArray(args.coordinates)) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='eraser' requires 'coordinates' (array of {x,y})."
                  )
                );
              }
              return wrap(
                ok(
                  paintEraser({
                    texture_id: args.texture_id,
                    coordinates: args.coordinates,
                    brush_size: args.brush_size,
                    opacity: args.opacity,
                    softness: args.softness,
                    shape: args.shape,
                    connect_strokes: args.connect_strokes,
                  }),
                  { dispatch_target: "eraser" }
                )
              );
            }
            case "settings": {
              return wrap(
                ok(
                  paintSettings({
                    mirror_painting: args.mirror_painting,
                    lock_alpha: args.lock_alpha,
                    pixel_perfect: args.pixel_perfect,
                    paint_side_restrict: args.paint_side_restrict,
                    color_erase_mode: args.color_erase_mode,
                    brush_opacity_modifier: args.brush_opacity_modifier,
                    brush_size_modifier: args.brush_size_modifier,
                    paint_with_stylus_only: args.paint_with_stylus_only,
                    pick_color_opacity: args.pick_color_opacity,
                    pick_combined_color: args.pick_combined_color,
                  }),
                  { dispatch_target: "settings" }
                )
              );
            }
            case "paint_with_brush": {
              if (!args.coordinates || !Array.isArray(args.coordinates)) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='paint_with_brush' requires 'coordinates' (array of {x,y})."
                  )
                );
              }
              return wrap(
                ok(
                  paintWithBrush({
                    texture_id: args.texture_id,
                    coordinates: args.coordinates,
                    brush_settings: args.brush_settings,
                    connect_strokes: args.connect_strokes,
                  }),
                  { dispatch_target: "paint_with_brush" }
                )
              );
            }
            case "texture_selection": {
              if (!args.mode) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='texture_selection' requires 'mode' (e.g. 'select_rectangle')."
                  )
                );
              }
              const coords =
                args.coordinates && !Array.isArray(args.coordinates)
                  ? args.coordinates
                  : undefined;
              return wrap(
                ok(
                  paintTextureSelection({
                    action: args.mode,
                    texture_id: args.texture_id,
                    coordinates: coords,
                    radius: args.radius,
                    mode: args.mode,
                  }),
                  { dispatch_target: "texture_selection" }
                )
              );
            }
            case "texture_layer": {
              if (!args.mode) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='texture_layer' requires 'mode' (e.g. 'create_layer')."
                  )
                );
              }
              return wrap(
                ok(
                  paintTextureLayer({
                    action: args.mode,
                    texture_id: args.texture_id,
                    layer_name: args.layer_name,
                    opacity: args.opacity,
                    blend_mode: args.blend_mode,
                    target_index: args.target_index,
                  }),
                  { dispatch_target: "texture_layer" }
                )
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("PAINT_TOOL_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    paintToolOpToolDocs[0].status
  );
}
