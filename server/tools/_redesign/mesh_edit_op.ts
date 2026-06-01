/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  meshExtrude,
  meshSubdivide,
  meshSelectElements,
  meshMoveVertices,
  meshDeleteElements,
  meshMergeVertices,
  meshCreateFace,
  meshKnife,
} from "../mesh";
import { ok, err, wrap } from "./_response";

export const meshEditOpParameters = z.object({
  action: z
    .enum([
      "extrude",
      "subdivide",
      "select_elements",
      "move_vertices",
      "delete_elements",
      "merge_vertices",
      "create_face",
      "knife",
    ])
    .describe(
      "Mesh editing operation. extrude/subdivide/delete_elements/knife use Blockbench's built-in mesh tools; the rest mutate vertices/faces directly."
    ),
  mesh_id: z
    .string()
    .optional()
    .describe(
      "Mesh uuid or name. Required for select_elements/merge_vertices/knife. Optional for the others (defaults to the selected mesh)."
    ),
  distance: z.number().optional().describe("extrude: distance in units."),
  mode: z
    .string()
    .optional()
    .describe(
      "extrude: extrusion mode ('faces' etc., kept as label). select_elements: 'vertex'|'edge'|'face'. delete_elements: 'vertex'|'edge'|'face' (label)."
    ),
  cuts: z.number().int().optional().describe("subdivide: number of cuts."),
  elements: z
    .array(z.string())
    .optional()
    .describe(
      "select_elements: list of vertex keys, face keys, or edge keys ('vkeyA-vkeyB'). Empty = select all of the chosen mode."
    ),
  selection_action: z
    .enum(["select", "add", "remove", "toggle"])
    .optional()
    .describe(
      "select_elements: how to combine with existing selection. Defaults to 'select' (clears then sets)."
    ),
  offset: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("move_vertices: per-axis offset."),
  vertices: z
    .array(z.string())
    .optional()
    .describe(
      "move_vertices: vertex keys to move (defaults to currently selected vertices). create_face: vertex keys to use as the face's corners (in order)."
    ),
  keep_vertices: z
    .boolean()
    .optional()
    .describe("delete_elements: keep vertices when deleting faces/edges."),
  threshold: z
    .number()
    .optional()
    .describe("merge_vertices: distance threshold for merging."),
  selected_only: z
    .boolean()
    .optional()
    .describe("merge_vertices: limit merge candidates to the current selection."),
  texture: z
    .string()
    .optional()
    .describe("create_face: texture uuid/name/id to apply to the new face."),
  points: z
    .array(
      z.object({
        position: z.tuple([z.number(), z.number(), z.number()]),
        face: z.string().optional(),
      })
    )
    .optional()
    .describe("knife: ordered list of cut points (3D position + optional face uuid)."),
});

export const meshEditOpToolDocs: ToolSpec[] = [
  {
    name: "mesh_edit_op",
    description:
      "Mesh-editing operations (extrude/subdivide/select_elements/move_vertices/delete_elements/merge_vertices/create_face/knife) collapsed into a single tool. Returns { ok, data, error?, meta? }. Replaces legacy extrude_mesh / subdivide_mesh / select_mesh_elements / move_mesh_vertices / delete_mesh_elements / merge_mesh_vertices / create_mesh_face / knife_tool.",
    annotations: {
      title: "Mesh Edit Op",
      destructiveHint: true,
    },
    parameters: meshEditOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerMeshEditOpTool() {
  createTool(
    meshEditOpToolDocs[0].name,
    {
      ...meshEditOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "extrude": {
              // Match legacy zod defaults: distance=1, mode='faces'.
              return wrap(
                ok(
                  meshExtrude({
                    mesh_id: args.mesh_id,
                    distance: args.distance ?? 1,
                    mode: args.mode ?? "faces",
                  }),
                  { dispatch_target: "extrude" }
                )
              );
            }
            case "subdivide": {
              // Match legacy zod default: cuts=1.
              return wrap(
                ok(
                  meshSubdivide({ mesh_id: args.mesh_id, cuts: args.cuts ?? 1 }),
                  { dispatch_target: "subdivide" }
                )
              );
            }
            case "select_elements": {
              if (!args.mesh_id) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='select_elements' requires 'mesh_id'."
                  )
                );
              }
              if (!args.mode || !["vertex", "edge", "face"].includes(args.mode)) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='select_elements' requires 'mode' = 'vertex'|'edge'|'face'."
                  )
                );
              }
              return wrap(
                ok(
                  meshSelectElements({
                    mesh_id: args.mesh_id,
                    mode: args.mode as "vertex" | "edge" | "face",
                    elements: args.elements,
                    action: args.selection_action ?? "select",
                  }),
                  { dispatch_target: "select_elements" }
                )
              );
            }
            case "move_vertices": {
              if (!args.offset) {
                return wrap(
                  err("INVALID_INPUT", "action='move_vertices' requires 'offset'.")
                );
              }
              return wrap(
                ok(
                  meshMoveVertices({
                    mesh_id: args.mesh_id,
                    offset: args.offset,
                    vertices: args.vertices,
                  }),
                  { dispatch_target: "move_vertices" }
                )
              );
            }
            case "delete_elements": {
              return wrap(
                ok(
                  meshDeleteElements({
                    mesh_id: args.mesh_id,
                    mode: args.mode ?? "face",
                    keep_vertices: args.keep_vertices,
                  }),
                  { dispatch_target: "delete_elements" }
                )
              );
            }
            case "merge_vertices": {
              if (!args.mesh_id) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='merge_vertices' requires 'mesh_id'."
                  )
                );
              }
              // Match legacy zod defaults: threshold=0.1, selected_only=true.
              return wrap(
                ok(
                  meshMergeVertices({
                    mesh_id: args.mesh_id,
                    threshold: args.threshold ?? 0.1,
                    selected_only: args.selected_only ?? true,
                  }),
                  { dispatch_target: "merge_vertices" }
                )
              );
            }
            case "create_face": {
              if (!args.vertices || args.vertices.length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='create_face' requires 'vertices' (non-empty array of vertex keys)."
                  )
                );
              }
              return wrap(
                ok(
                  meshCreateFace({
                    mesh_id: args.mesh_id,
                    vertices: args.vertices,
                    texture: args.texture,
                  }),
                  { dispatch_target: "create_face" }
                )
              );
            }
            case "knife": {
              if (!args.mesh_id) {
                return wrap(
                  err("INVALID_INPUT", "action='knife' requires 'mesh_id'.")
                );
              }
              if (!args.points || args.points.length === 0) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='knife' requires 'points' (non-empty)."
                  )
                );
              }
              return wrap(
                ok(
                  meshKnife({ mesh_id: args.mesh_id, points: args.points }),
                  { dispatch_target: "knife" }
                )
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("MESH_EDIT_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    meshEditOpToolDocs[0].status
  );
}
