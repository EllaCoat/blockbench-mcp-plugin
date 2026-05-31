/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  vertexWeightSet,
  vertexWeightSetBatch,
  vertexWeightClear,
} from "../armature";
import { ok, err, wrap } from "./_response";

export const vertexWeightOpParameters = z.object({
  action: z
    .enum(["set", "set_batch", "clear"])
    .describe(
      "Operation. set: write one vertex weight. set_batch: write many weights at once. clear: remove all weights of this bone for this mesh."
    ),
  bone_id: z
    .string()
    .describe("Target bone UUID or name."),
  mesh_id: z
    .string()
    .optional()
    .describe(
      "Target mesh UUID or name. Defaults to the first selected mesh."
    ),
  vertex_key: z
    .string()
    .optional()
    .describe(
      "Vertex key in the mesh. Required for action='set'."
    ),
  weight: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Weight value (0-1, set to 0 to remove). Required for action='set'."
    ),
  weights: z
    .record(z.string(), z.number().min(0).max(1))
    .optional()
    .describe(
      "Map of vertex_key -> weight value. Required for action='set_batch'."
    ),
});

export const vertexWeightOpToolDocs: ToolSpec[] = [
  {
    name: "vertex_weight_op",
    description:
      "Vertex weight operations (set/set_batch/clear) collapsed into a single tool. Mesh defaults to the first selected mesh when mesh_id is omitted. Returns { ok, data, error?, meta? }. Replaces legacy set_vertex_weight / set_vertex_weights_batch / clear_vertex_weights. Use inspect(target='vertex_weights') to read current weights.",
    annotations: {
      title: "Vertex Weight Op",
      destructiveHint: true,
    },
    parameters: vertexWeightOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerVertexWeightOpTool() {
  createTool(
    vertexWeightOpToolDocs[0].name,
    {
      ...vertexWeightOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "set":
              if (!args.vertex_key) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='set' requires 'vertex_key'."
                  )
                );
              }
              if (args.weight === undefined) {
                return wrap(
                  err("INVALID_INPUT", "action='set' requires 'weight'.")
                );
              }
              return wrap(
                ok(
                  vertexWeightSet({
                    bone_id: args.bone_id,
                    mesh_id: args.mesh_id,
                    vertex_key: args.vertex_key,
                    weight: args.weight,
                  }),
                  { dispatch_target: "set" }
                )
              );
            case "set_batch":
              if (!args.weights || Object.keys(args.weights).length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='set_batch' requires non-empty 'weights'."
                  )
                );
              }
              return wrap(
                ok(
                  vertexWeightSetBatch({
                    bone_id: args.bone_id,
                    mesh_id: args.mesh_id,
                    weights: args.weights,
                  }),
                  {
                    dispatch_target: "set_batch",
                    count: Object.keys(args.weights).length,
                  }
                )
              );
            case "clear":
              return wrap(
                ok(
                  vertexWeightClear({
                    bone_id: args.bone_id,
                    mesh_id: args.mesh_id,
                  }),
                  { dispatch_target: "clear" }
                )
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "VERTEX_WEIGHT_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    vertexWeightOpToolDocs[0].status
  );
}
