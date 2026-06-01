/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  textureCreate,
  textureApply,
  textureAddGroup,
  textureImportSet,
  textureActivate,
} from "../texture";
import { ok, err, wrap } from "./_response";

export const textureOpParameters = z.object({
  action: z
    .enum(["create", "apply", "add_group", "import_set", "activate"])
    .describe(
      "Operation. create: new texture (data URL / file path / fill_color). apply: apply a texture to a cube/mesh/group's faces. add_group: create a texture group (optionally with members). import_set: import a *.texture_set.json file. activate: select an existing texture so paint tools target it."
    ),
  name: z
    .string()
    .optional()
    .describe("Texture name (create) or group name (add_group). Required for create/add_group."),
  width: z.number().int().optional().describe("Texture width in px (create). Defaults to 16."),
  height: z.number().int().optional().describe("Texture height in px (create). Defaults to 16."),
  data: z
    .string()
    .optional()
    .describe(
      "Source for create: data: URL ('data:image/png;base64,...') or file path. Omit to start blank."
    ),
  pbr_channel: z
    .string()
    .optional()
    .describe("PBR channel hint for create (e.g. 'color', 'normal')."),
  fill_color: z
    .union([z.string(), z.array(z.number())])
    .optional()
    .describe("Fill color for create when no data is given. Hex string or [r, g, b, a?]."),
  group: z
    .string()
    .optional()
    .describe("Existing texture group uuid/name to attach the new texture to (create)."),
  layer_name: z.string().optional().describe("Optional layer name for create."),
  id: z
    .string()
    .optional()
    .describe(
      "Target element uuid/name for action='apply' (cube/mesh/group). Use inspect(target='outline') to discover."
    ),
  applyTo: z
    .enum(["all", "blank", "none"])
    .optional()
    .describe("apply: 'all' = every face, 'blank' = untextured only, 'none' = clear. Defaults to 'blank'."),
  texture: z
    .string()
    .optional()
    .describe(
      "Texture uuid/name/id. Required for activate. Optional for apply (defaults to the project's default texture)."
    ),
  textures: z
    .array(z.string())
    .optional()
    .describe("Texture uuids/names to include in the new group (add_group)."),
  is_material: z
    .boolean()
    .optional()
    .describe("Whether the new group is a material group (add_group). Defaults to false."),
  path: z
    .string()
    .optional()
    .describe("Absolute filesystem path to a *.texture_set.json file (import_set)."),
});

export const textureOpToolDocs: ToolSpec[] = [
  {
    name: "texture_op",
    description:
      "Texture operations (create/apply/add_group/import_set/activate) collapsed into a single tool. Replaces legacy create_texture / apply_texture / add_texture_group / import_texture_set / activate_texture. Returns { ok, data, error?, meta? }. For listing/reading textures use inspect(target='textures').",
    annotations: {
      title: "Texture Op",
    },
    parameters: textureOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerTextureOpTool() {
  createTool(
    textureOpToolDocs[0].name,
    {
      ...textureOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create": {
              if (!args.name) {
                return wrap(
                  err("INVALID_INPUT", "action='create' requires 'name'.")
                );
              }
              return wrap(
                ok(
                  textureCreate({
                    name: args.name,
                    width: args.width ?? 16,
                    height: args.height ?? 16,
                    data: args.data,
                    pbr_channel: args.pbr_channel,
                    fill_color: args.fill_color,
                    group: args.group,
                    layer_name: args.layer_name,
                  }),
                  { dispatch_target: "create" }
                )
              );
            }
            case "apply": {
              if (!args.id) {
                return wrap(
                  err("INVALID_INPUT", "action='apply' requires 'id' (element uuid/name).")
                );
              }
              return wrap(
                ok(
                  textureApply({
                    applyTo: args.applyTo ?? "blank",
                    id: args.id,
                    texture: args.texture,
                  }),
                  { dispatch_target: "apply" }
                )
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
                  textureAddGroup({
                    name: args.name,
                    textures: args.textures,
                    // Match legacy zod default (= addTextureGroupParameters.is_material.default(true)).
                    is_material: args.is_material ?? true,
                  }),
                  { dispatch_target: "add_group" }
                )
              );
            }
            case "import_set": {
              if (!args.path) {
                return wrap(
                  err("INVALID_INPUT", "action='import_set' requires 'path'.")
                );
              }
              return wrap(
                ok(textureImportSet(args.path), {
                  dispatch_target: "import_set",
                })
              );
            }
            case "activate": {
              if (!args.texture) {
                return wrap(
                  err("INVALID_INPUT", "action='activate' requires 'texture'.")
                );
              }
              return wrap(
                ok(textureActivate(args.texture), {
                  dispatch_target: "activate",
                })
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("TEXTURE_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    textureOpToolDocs[0].status
  );
}
