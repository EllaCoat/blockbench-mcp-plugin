/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { pbrChannelEnum } from "@/lib/zodObjects";
import {
  materialCreatePbr,
  materialConfigure,
  materialAssignChannel,
  materialSaveConfig,
} from "../texture";
import { ok, err, wrap } from "./_response";

export const materialOpParameters = z.object({
  action: z
    .enum(["create_pbr", "configure", "assign_channel", "save_config"])
    .describe(
      "Operation. create_pbr: new PBR material (texture group is_material=true). configure: mutate channel assignments / uniform values. assign_channel: bind one texture to a PBR channel. save_config: write texture_set.json to disk (Bedrock)."
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Material name. Required for action='create_pbr'."
    ),
  material: z
    .string()
    .optional()
    .describe(
      "Material name or UUID. Required for action='configure'/'assign_channel'/'save_config'."
    ),
  texture: z
    .string()
    .optional()
    .describe(
      "Texture name or UUID to assign. Required for action='assign_channel'."
    ),
  channel: pbrChannelEnum
    .optional()
    .describe(
      "PBR channel. Required for action='assign_channel'."
    ),
  color_texture: z
    .string()
    .optional()
    .describe("Texture for color channel. Pass 'none' in configure to unbind."),
  normal_texture: z
    .string()
    .optional()
    .describe("Texture for normal channel. Pass 'none' in configure to unbind."),
  height_texture: z
    .string()
    .optional()
    .describe("Texture for height channel. Pass 'none' in configure to unbind."),
  mer_texture: z
    .string()
    .optional()
    .describe("Texture for MER channel. Pass 'none' in configure to unbind."),
  color_value: z
    .array(z.number().min(0).max(255))
    .length(4)
    .optional()
    .describe("Uniform RGBA color [R,G,B,A]."),
  mer_value: z
    .array(z.number().min(0).max(255))
    .length(3)
    .optional()
    .describe("Uniform MER values [Metalness, Emissive, Roughness] (0-255)."),
  subsurface_value: z
    .number()
    .min(0)
    .max(255)
    .optional()
    .describe("Subsurface scattering value (0-255)."),
});

export const materialOpToolDocs: ToolSpec[] = [
  {
    name: "material_op",
    description:
      "PBR material operations (create_pbr/configure/assign_channel/save_config) collapsed into a single tool. Materials are texture groups with is_material=true. Returns { ok, data, error?, meta? }. Replaces legacy create_pbr_material / configure_material / assign_texture_channel / save_material_config. Use inspect(target='materials') to list.",
    annotations: {
      title: "Material Op",
      destructiveHint: true,
    },
    parameters: materialOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerMaterialOpTool() {
  createTool(
    materialOpToolDocs[0].name,
    {
      ...materialOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create_pbr":
              if (!args.name) {
                return wrap(
                  err("INVALID_INPUT", "action='create_pbr' requires 'name'.")
                );
              }
              return wrap(
                ok(
                  materialCreatePbr({
                    name: args.name,
                    color_texture: args.color_texture,
                    normal_texture: args.normal_texture,
                    height_texture: args.height_texture,
                    mer_texture: args.mer_texture,
                    color_value: args.color_value,
                    mer_value: args.mer_value,
                    subsurface_value: args.subsurface_value,
                  }),
                  { dispatch_target: "create_pbr" }
                )
              );
            case "configure":
              if (!args.material) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='configure' requires 'material'."
                  )
                );
              }
              return wrap(
                ok(
                  materialConfigure({
                    material: args.material,
                    color_texture: args.color_texture,
                    normal_texture: args.normal_texture,
                    height_texture: args.height_texture,
                    mer_texture: args.mer_texture,
                    color_value: args.color_value,
                    mer_value: args.mer_value,
                    subsurface_value: args.subsurface_value,
                  }),
                  { dispatch_target: "configure" }
                )
              );
            case "assign_channel":
              if (!args.material) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='assign_channel' requires 'material'."
                  )
                );
              }
              if (!args.texture) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='assign_channel' requires 'texture'."
                  )
                );
              }
              if (!args.channel) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='assign_channel' requires 'channel'."
                  )
                );
              }
              return wrap(
                ok(
                  materialAssignChannel({
                    material: args.material,
                    texture: args.texture,
                    channel: args.channel,
                  }),
                  { dispatch_target: "assign_channel" }
                )
              );
            case "save_config":
              if (!args.material) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='save_config' requires 'material'."
                  )
                );
              }
              return wrap(
                ok(
                  materialSaveConfig({ material: args.material }),
                  { dispatch_target: "save_config" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("MATERIAL_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    materialOpToolDocs[0].status
  );
}
