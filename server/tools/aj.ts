/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";

/**
 * Animated Java augments the active Blockbench project with an `animated_java`
 * object holding all Blueprint Settings as a flat record. Only AJ Blueprint
 * projects carry it, so its presence is used to gate these tools.
 */
interface AJBlueprintProject {
  animated_java?: Record<string, unknown>;
  saved?: boolean;
}

type SettingValue = string | number | boolean | number[];

const AJ_FORMAT_ID = "animated_java:format/blueprint";

function getAJSettings(): Record<string, unknown> {
  if (!Project) {
    throw new Error(
      "No project is open. Open or create an Animated Java Blueprint first."
    );
  }

  const settings = (Project as unknown as AJBlueprintProject).animated_java;
  if (!settings) {
    const formatId = (Format as { id?: string } | undefined)?.id ?? "unknown";
    throw new Error(
      `The active project is not an Animated Java Blueprint (format: ${formatId}). ` +
        `These tools require a project of format "${AJ_FORMAT_ID}".`
    );
  }

  return settings;
}

export const blueprintSettingsGetParameters = z.object({});

export const blueprintSettingsSetParameters = z.object({
  key: z
    .string()
    .describe(
      "Blueprint Setting key to update (e.g. `tsb_optimized_export`, " +
        "`tsb_quantization_digits_default`, `interpolation_duration`). " +
        "Call aj_blueprint_settings_get to discover valid keys and their current types."
    ),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.number())])
    .describe(
      "New value. Its type must match the existing value's type " +
        "(boolean/number/string, or a number array for vector settings like render_box)."
    ),
});

export const ajToolDocs: ToolSpec[] = [
  {
    name: "aj_blueprint_settings_get",
    description:
      "Returns all Animated Java Blueprint Settings for the active project as a JSON object " +
      "(blueprint_id, export modes, TSB Optimized Export options, interpolation durations, etc.). " +
      "Requires an Animated Java Blueprint project to be open. Use this before " +
      "aj_blueprint_settings_set to discover valid keys and their value types.",
    annotations: {
      title: "AJ: Get Blueprint Settings",
      readOnlyHint: true,
    },
    parameters: blueprintSettingsGetParameters,
    status: STATUS_EXPERIMENTAL,
  },
  {
    name: "aj_blueprint_settings_set",
    description:
      "Sets a single Animated Java Blueprint Setting on the active project. Takes a `key` and a " +
      "`value` whose type must match the setting's current type. Validates that the key exists and " +
      "rejects type mismatches. Marks the project as having unsaved changes. Requires an Animated " +
      "Java Blueprint project to be open.",
    annotations: {
      title: "AJ: Set Blueprint Setting",
    },
    parameters: blueprintSettingsSetParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

function typeName(value: unknown): string {
  return Array.isArray(value) ? "array" : typeof value;
}

export function registerAJTools() {
  createTool(
    ajToolDocs[0].name,
    {
      ...ajToolDocs[0],
      async execute() {
        const settings = getAJSettings();
        return JSON.stringify(settings, null, 2);
      },
    },
    ajToolDocs[0].status
  );

  createTool(
    ajToolDocs[1].name,
    {
      ...ajToolDocs[1],
      async execute({ key, value }: { key: string; value: SettingValue }) {
        const settings = getAJSettings();

        if (!(key in settings)) {
          throw new Error(
            `Unknown Blueprint Setting "${key}". ` +
              `Call aj_blueprint_settings_get to see available keys.`
          );
        }

        const current = settings[key];
        const expected = typeName(current);
        const actual = typeName(value);
        if (expected !== actual) {
          throw new Error(
            `Type mismatch for "${key}": expected ${expected}, got ${actual}.`
          );
        }

        settings[key] = value;
        (Project as unknown as AJBlueprintProject).saved = false;

        return `Set "${key}" from ${JSON.stringify(current)} to ${JSON.stringify(value)}.`;
      },
    },
    ajToolDocs[1].status
  );
}
