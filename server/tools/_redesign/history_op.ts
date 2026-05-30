/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL } from "@/lib/constants";
import {
  historyUndo,
  historyRedo,
  historySaveCheckpoint,
} from "../history";
import { ok, err, wrap } from "./_response";

export const historyOpParameters = z.object({
  action: z
    .enum(["undo", "redo", "save_checkpoint"])
    .describe(
      "Operation. undo/redo: traverse the Undo stack. save_checkpoint: insert a named marker. Use inspect(target='history') to list entries."
    ),
  steps: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(1)
    .describe("Number of steps for undo/redo. Defaults to 1."),
  name: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      "Checkpoint name (action='save_checkpoint' only). Shown in undo history so agents can navigate back to this point."
    ),
});

export const historyOpToolDocs: ToolSpec[] = [
  {
    name: "history_op",
    description:
      "Undo history operations (undo/redo/save_checkpoint) collapsed into a single tool. Returns { ok, data, error?, meta? }. Replaces legacy undo / redo / save_checkpoint. Inspect the stack with inspect(target='history').",
    annotations: {
      title: "History Op",
      destructiveHint: true,
    },
    parameters: historyOpParameters,
    status: STATUS_EXPERIMENTAL,
  },
];

export function registerHistoryOpTool() {
  createTool(
    historyOpToolDocs[0].name,
    {
      ...historyOpToolDocs[0],
      async execute({ action, steps, name }) {
        try {
          switch (action) {
            case "undo":
              return wrap(
                ok(historyUndo(steps), { dispatch_target: "undo" })
              );
            case "redo":
              return wrap(
                ok(historyRedo(steps), { dispatch_target: "redo" })
              );
            case "save_checkpoint":
              if (!name) {
                return wrap(
                  err(
                    "INVALID_INPUT",
                    "action='save_checkpoint' requires 'name'."
                  )
                );
              }
              return wrap(
                ok(historySaveCheckpoint(name), {
                  dispatch_target: "save_checkpoint",
                })
              );
          }
        } catch (error) {
          const e = error as Error;
          return wrap(
            err("HISTORY_OP_ERROR", e?.message ?? String(error), e?.stack)
          );
        }
      },
    },
    historyOpToolDocs[0].status
  );
}
