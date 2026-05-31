/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  vector2Schema,
  uvMappingModeEnum,
  uvRotationAngleEnum,
  faceKeysOptionalSchema,
} from "@/lib/zodObjects";
import { meshUvSet, meshUvAuto, meshUvRotate } from "../uv";
import { ok, err, wrap } from "./_response";

export const meshUvOpParameters = z.object({
  action: z
    .enum(["set", "auto", "rotate"])
    .describe(
      "Operation. set: explicit per-vertex UV for one face. auto: project/unwrap/cylinder/sphere mapping. rotate: 90/180/270 degree rotation."
    ),
  mesh_id: z
    .string()
    .optional()
    .describe(
      "Mesh UUID or name. Required for action='set'. For auto/rotate, defaults to first selected mesh."
    ),
  face_key: z
    .string()
    .optional()
    .describe(
      "Face key. Required for action='set'."
    ),
  uv_mapping: z
    .record(z.string(), vector2Schema)
    .optional()
    .describe(
      "Map of vertex_key -> [u, v]. Required for action='set'."
    ),
  mode: uvMappingModeEnum
    .optional()
    .default("project")
    .describe(
      "UV mapping mode for action='auto'. Defaults to 'project' (matches legacy auto_uv_mesh)."
    ),
  angle: uvRotationAngleEnum
    .optional()
    .default("90")
    .describe(
      "Rotation angle for action='rotate'. Defaults to '90' (matches legacy rotate_mesh_uv)."
    ),
  faces: faceKeysOptionalSchema.describe(
    "Specific face keys for auto/rotate. Defaults to currently selected faces."
  ),
});

export const meshUvOpToolDocs: ToolSpec[] = [
  {
    name: "mesh_uv_op",
    description:
      "Mesh UV operations (set/auto/rotate) collapsed into a single tool. set writes explicit UV for one face; auto applies project/unwrap/cylinder/sphere mapping; rotate rotates UV by 90/180/270 degrees. Returns { ok, data, error?, meta? }. Replaces legacy set_mesh_uv / auto_uv_mesh / rotate_mesh_uv.",
    annotations: {
      title: "Mesh UV Op",
      destructiveHint: true,
    },
    parameters: meshUvOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerMeshUvOpTool() {
  createTool(
    meshUvOpToolDocs[0].name,
    {
      ...meshUvOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "set":
              if (!args.mesh_id) {
                return wrap(
                  err("INVALID_INPUT", "action='set' requires 'mesh_id'.")
                );
              }
              if (!args.face_key) {
                return wrap(
                  err("INVALID_INPUT", "action='set' requires 'face_key'.")
                );
              }
              if (!args.uv_mapping) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='set' requires 'uv_mapping'."
                  )
                );
              }
              return wrap(
                ok(
                  meshUvSet({
                    mesh_id: args.mesh_id,
                    face_key: args.face_key,
                    uv_mapping: args.uv_mapping as Record<
                      string,
                      [number, number]
                    >,
                  }),
                  { dispatch_target: "set" }
                )
              );
            case "auto":
              return wrap(
                ok(
                  meshUvAuto({
                    mesh_id: args.mesh_id,
                    mode: args.mode,
                    faces: args.faces,
                  }),
                  { dispatch_target: "auto" }
                )
              );
            case "rotate":
              return wrap(
                ok(
                  meshUvRotate({
                    mesh_id: args.mesh_id,
                    angle: args.angle,
                    faces: args.faces,
                  }),
                  { dispatch_target: "rotate" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("MESH_UV_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    meshUvOpToolDocs[0].status
  );
}
