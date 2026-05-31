/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  meshSchema,
  textureIdOptionalSchema,
  groupIdOptionalSchema,
  vector3Schema,
} from "@/lib/zodObjects";
import {
  meshPlace,
  meshCreateSphere,
  meshCreateCylinder,
} from "../mesh";
import { ok, err, wrap } from "./_response";

export const meshPrimitiveOpParameters = z.object({
  action: z
    .enum(["place_mesh", "sphere", "cylinder"])
    .describe(
      "Primitive type. place_mesh: generic mesh from explicit vertices. sphere: spherical mesh from diameter/sides. cylinder: cylindrical mesh with optional caps."
    ),
  elements: z
    .array(z.any())
    .min(1)
    .describe(
      "Per-primitive parameters. For place_mesh: meshSchema[]; sphere: { name, position, diameter, sides, rotation?, align_edges? }[]; cylinder: { name, position, height, diameter, sides, rotation?, capped? }[]."
    ),
  texture: textureIdOptionalSchema.describe(
    "Texture ID or name to apply."
  ),
  group: groupIdOptionalSchema.describe(
    "Group/bone to which the primitives belong."
  ),
});

export const meshPrimitiveOpToolDocs: ToolSpec[] = [
  {
    name: "mesh_primitive_op",
    description:
      "Mesh primitive creation (place_mesh/sphere/cylinder) collapsed into a single tool. The 'elements' shape changes per action — see action description for required fields. Returns { ok, data, error?, meta? }. Replaces legacy place_mesh / create_sphere / create_cylinder.",
    annotations: {
      title: "Mesh Primitive Op",
      destructiveHint: true,
    },
    parameters: meshPrimitiveOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

const sphereElementSchema = z.object({
  name: z.string(),
  position: vector3Schema,
  diameter: z.number().min(1).max(64).default(16),
  sides: z.number().min(3).max(48).default(12),
  rotation: vector3Schema.optional(),
  align_edges: z.boolean().optional(),
});

const cylinderElementSchema = z.object({
  name: z.string(),
  position: vector3Schema,
  height: z.number().min(1).max(64).default(16),
  diameter: z.number().min(1).max(64).default(16),
  sides: z.number().min(3).max(64).default(12),
  rotation: vector3Schema.optional(),
  capped: z.boolean().optional(),
});

export function registerMeshPrimitiveOpTool() {
  createTool(
    meshPrimitiveOpToolDocs[0].name,
    {
      ...meshPrimitiveOpToolDocs[0],
      async execute(args) {
        try {
          switch (args.action) {
            case "place_mesh": {
              const parsed = z.array(meshSchema).min(1).safeParse(args.elements);
              if (!parsed.success) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    `action='place_mesh' requires meshSchema[] elements: ${parsed.error.message}`
                  )
                );
              }
              return wrap(
                ok(
                  meshPlace({
                    elements: parsed.data as unknown as Array<{
                      name: string;
                      vertices: ArrayVector3[];
                    }>,
                    texture: args.texture,
                    group: args.group,
                  }),
                  { dispatch_target: "place_mesh", count: parsed.data.length }
                )
              );
            }
            case "sphere": {
              const parsed = z
                .array(sphereElementSchema)
                .min(1)
                .safeParse(args.elements);
              if (!parsed.success) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    `action='sphere' requires sphere element[]: ${parsed.error.message}`
                  )
                );
              }
              return wrap(
                ok(
                  meshCreateSphere({
                    elements: parsed.data,
                    texture: args.texture,
                    group: args.group,
                  }),
                  { dispatch_target: "sphere", count: parsed.data.length }
                )
              );
            }
            case "cylinder": {
              const parsed = z
                .array(cylinderElementSchema)
                .min(1)
                .safeParse(args.elements);
              if (!parsed.success) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    `action='cylinder' requires cylinder element[]: ${parsed.error.message}`
                  )
                );
              }
              return wrap(
                ok(
                  meshCreateCylinder({
                    elements: parsed.data,
                    texture: args.texture,
                    group: args.group,
                  }),
                  { dispatch_target: "cylinder", count: parsed.data.length }
                )
              );
            }
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "MESH_PRIMITIVE_OP_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        }
      },
    },
    meshPrimitiveOpToolDocs[0].status
  );
}
