/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { cubeSchema } from "@/lib/zodObjects";
import { cubePlace, cubeModify } from "../cubes";
import { ok, err, wrap } from "./_response";

const faceDirEnum = z.enum(["north", "south", "east", "west", "up", "down"]);

export const cubeOpParameters = z.object({
  action: z
    .enum(["create", "update"])
    .describe(
      "Operation. create: place one or more cubes (legacy place_cube). update: modify an existing cube (legacy modify_cube)."
    ),
  elements: z
    .array(cubeSchema)
    .optional()
    .describe(
      "Array of cubes to place. Required for action='create'."
    ),
  texture: z
    .string()
    .optional()
    .describe(
      "Texture ID or name to apply (action='create'). Defaults to project default."
    ),
  group: z
    .string()
    .optional()
    .describe(
      "Group/bone for new cubes (action='create')."
    ),
  faces: z
    .union([
      z.boolean(),
      z.array(faceDirEnum),
      z.array(
        z.object({
          face: faceDirEnum,
          uv: z.array(z.number()).length(4),
        })
      ),
    ])
    .optional()
    .describe(
      "Face selection for create. true = auto UV, string[] = specific faces, object[] = per-face UV override."
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Cube UUID or name to modify. For action='update'; defaults to selected cubes when omitted."
    ),
  name: z.string().optional().describe("New name (update)."),
  origin: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Pivot point (update)."),
  from: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Starting corner (update)."),
  to: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Ending corner (update)."),
  rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Rotation (update)."),
  autouv: z
    .enum(["0", "1", "2"])
    .optional()
    .describe("Auto UV setting (update). 0=off, 1=on, 2=relative."),
  uv_offset: z
    .tuple([z.number(), z.number()])
    .optional()
    .describe("UV offset (update)."),
  mirror_uv: z.boolean().optional().describe("Mirror UVs (update)."),
  shade: z.boolean().optional().describe("Apply shading (update)."),
  inflate: z.number().optional().describe("Inflation amount (update)."),
  color: z.number().optional().describe("Palette color index (update)."),
  visibility: z.boolean().optional().describe("Visibility (update)."),
});

export const cubeOpToolDocs: ToolSpec[] = [
  {
    name: "cube_op",
    description:
      "Cube operations (create/update) collapsed into a single tool. create places one or more new cubes with optional texture+UV; update mutates an existing cube (or all selected cubes when id is omitted). Returns { ok, data, error?, meta? }. Replaces legacy place_cube / modify_cube.",
    annotations: {
      title: "Cube Op",
      destructiveHint: true,
    },
    parameters: cubeOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerCubeOpTool() {
  createTool(
    cubeOpToolDocs[0].name,
    {
      ...cubeOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "create":
              if (!args.elements || args.elements.length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='create' requires non-empty 'elements'."
                  )
                );
              }
              return wrap(
                ok(
                  cubePlace({
                    elements: args.elements as unknown as Cube[],
                    texture: args.texture,
                    group: args.group,
                    faces: args.faces,
                  }),
                  {
                    dispatch_target: "create",
                    count: args.elements.length,
                  }
                )
              );
            case "update":
              return wrap(
                ok(
                  cubeModify({
                    id: args.id,
                    name: args.name,
                    origin: args.origin,
                    from: args.from,
                    to: args.to,
                    rotation: args.rotation,
                    autouv: args.autouv,
                    uv_offset: args.uv_offset,
                    mirror_uv: args.mirror_uv,
                    shade: args.shade,
                    inflate: args.inflate,
                    color: args.color,
                    visibility: args.visibility,
                  }),
                  { dispatch_target: "update" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("CUBE_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    cubeOpToolDocs[0].status
  );
}
