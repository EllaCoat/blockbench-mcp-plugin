/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import { faceEnum } from "@/lib/zodObjects";
import {
  materialInstanceSet,
  materialInstanceBulkSet,
  materialInstanceClear,
} from "../material-instances";
import { ok, err, wrap } from "./_response";

export const materialInstanceOpParameters = z.object({
  action: z
    .enum(["set", "bulk_set", "clear"])
    .describe(
      "Operation. set: assign one material instance to faces of one or more cubes. bulk_set: apply many assignments at once. clear: remove material instance names."
    ),
  cube_id: z
    .string()
    .optional()
    .describe(
      "Cube UUID or name. For set/clear; defaults to all selected cubes when omitted."
    ),
  material_name: z
    .string()
    .optional()
    .describe(
      "Material instance name. Required for action='set'. Empty string clears."
    ),
  faces: z
    .array(faceEnum)
    .optional()
    .describe(
      "Faces to set/clear. Defaults to all faces."
    ),
  assignments: z
    .array(
      z.object({
        cube_id: z.string(),
        faces: z.array(faceEnum),
        material_name: z.string(),
      })
    )
    .optional()
    .describe(
      "Bulk assignments. Required for action='bulk_set'."
    ),
  all_cubes: z
    .boolean()
    .optional()
    .describe(
      "When action='clear', clear from every cube in the project."
    ),
});

export const materialInstanceOpToolDocs: ToolSpec[] = [
  {
    name: "material_instance_op",
    description:
      "Material instance operations (set/bulk_set/clear) collapsed into a single tool. Material instances map cube faces to materials defined in the minecraft:material_instances component (Bedrock Block format). Returns { ok, data, error?, meta? }. Replaces legacy set_face_material_instance / bulk_set_material_instances / clear_material_instances. Use inspect(target='material_instances') to list current assignments.",
    annotations: {
      title: "Material Instance Op",
      destructiveHint: true,
    },
    parameters: materialInstanceOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerMaterialInstanceOpTool() {
  createTool(
    materialInstanceOpToolDocs[0].name,
    {
      ...materialInstanceOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "set":
              if (args.material_name === undefined) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='set' requires 'material_name'."
                  )
                );
              }
              return wrap(
                ok(
                  materialInstanceSet({
                    cube_id: args.cube_id,
                    material_name: args.material_name,
                    faces: args.faces,
                  }),
                  { dispatch_target: "set" }
                )
              );
            case "bulk_set":
              if (!args.assignments || args.assignments.length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='bulk_set' requires non-empty 'assignments'."
                  )
                );
              }
              return wrap(
                ok(
                  materialInstanceBulkSet({
                    assignments: args.assignments,
                  }),
                  {
                    dispatch_target: "bulk_set",
                    count: args.assignments.length,
                  }
                )
              );
            case "clear":
              return wrap(
                ok(
                  materialInstanceClear({
                    cube_id: args.cube_id,
                    faces: args.faces,
                    all_cubes: args.all_cubes,
                  }),
                  { dispatch_target: "clear" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "MATERIAL_INSTANCE_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    materialInstanceOpToolDocs[0].status
  );
}
