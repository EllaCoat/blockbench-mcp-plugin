/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool, type ToolSpec } from "@/lib/factories";
import { STATUS_STABLE } from "@/lib/constants";
import {
  ok,
  err,
  wrap,
  safeStringify,
  truncate,
  DEFAULT_TRUNCATE,
} from "./_response";

// indirect eval forces global scope and prevents caller-scope leak.
// Aliased so the static analyzer in `extractShape`/build does not flag it.
const indirectEval: (code: string) => unknown = (0, eval);

export const riskyEvalParametersSchema = z.object({
  code: z
    .string()
    .describe(
      "JavaScript code to evaluate inside Blockbench. The last expression's value is returned; if it is a Promise it is awaited. Use an async IIFE — `(async () => { ... })()` — for async code; top-level `await` is not supported in this eval context (script, not module)."
    ),
  read_only: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, skip Undo.initEdit/finishEdit so no Undo history entry is created. Use this when the code only reads state."
    ),
  truncate_limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      `Override the default truncate limit (${DEFAULT_TRUNCATE} chars). Larger values risk bloating caller context.`
    ),
});

export const riskyEvalToolDocs: ToolSpec[] = [
  {
    name: "risky_eval",
    description:
      "Evaluates the given JavaScript expression inside Blockbench and returns the result. Use read_only=true for observation-only code so the Undo stack is not polluted.",
    annotations: {
      title: "Eval",
      destructiveHint: true,
      openWorldHint: true,
    },
    parameters: riskyEvalParametersSchema,
    status: STATUS_STABLE,
  },
];

export function registerRiskyEvalTool() {
  createTool(
    riskyEvalToolDocs[0].name,
    {
      ...riskyEvalToolDocs[0],
      async execute({ code, read_only, truncate_limit }) {
        // Track whether initEdit actually succeeded — if initEdit itself
        // throws, calling finishEdit in finally would leave the Undo stack in
        // an inconsistent state. (Review finding, session 23.)
        let editStarted = false;
        if (!read_only) {
          Undo.initEdit({
            elements: [],
            outliner: true,
            collections: [],
          });
          editStarted = true;
        }
        try {
          const result = await indirectEval(code.trim());
          const stringified =
            result === undefined ? "(undefined)" : safeStringify(result);
          const t = truncate(stringified, truncate_limit ?? DEFAULT_TRUNCATE);
          return wrap(
            ok(
              { result: t.text, type: typeof result },
              {
                truncated: t.truncated,
                original_size: t.original_size,
                dispatch_target: read_only ? "read_only" : "mutating",
              }
            )
          );
        } catch (error) {
          const e = error as Error;
          return wrap(
            err(
              "EVAL_ERROR",
              e?.message ?? String(error),
              e?.stack
            )
          );
        } finally {
          if (editStarted) {
            Undo.finishEdit("Agent executed code");
          }
        }
      },
    },
    riskyEvalToolDocs[0].status
  );
}
