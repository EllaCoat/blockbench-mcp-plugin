/**
 * Shared response schema + stringify/truncate helpers for stage-II redesigned tools.
 *
 * - All `_redesign/` tools wrap their result in `ToolResponse<T>`:
 *     { ok: true,  data, meta? } | { ok: false, error }
 * - safeStringify absorbs circular references / BigInt / function / Map / Set / Error
 *   so we can stringify raw Blockbench objects without TypeError.
 * - truncate caps oversized payloads so a single tool call cannot blow up the
 *   caller's context. Truncation is reported via `meta.truncated` + `meta.original_size`.
 */

export type ToolError = {
  code: string;
  message: string;
  hint?: string;
};

export type ToolMeta = {
  count?: number;
  truncated?: boolean;
  original_size?: number;
  request_id?: string;
  dispatch_target?: string;
};

export type SuccessResponse<T = unknown> = {
  ok: true;
  data: T;
  meta?: ToolMeta;
};

export type ErrorResponse = {
  ok: false;
  error: ToolError;
};

export type ToolResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export const ok = <T>(data: T, meta?: ToolMeta): SuccessResponse<T> => ({
  ok: true,
  data,
  ...(meta ? { meta } : {}),
});

export const err = (
  code: string,
  message: string,
  hint?: string
): ErrorResponse => ({
  ok: false,
  error: { code, message, ...(hint ? { hint } : {}) },
});

export type WrappedToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export const wrap = <T>(response: ToolResponse<T>): WrappedToolResult => ({
  content: [{ type: "text", text: JSON.stringify(response) }],
});

export const DEFAULT_TRUNCATE = 8 * 1024;
export const INSPECT_TRUNCATE = 64 * 1024;

export type TruncateResult = {
  text: string;
  truncated: boolean;
  original_size: number;
};

export const truncate = (
  text: string,
  limit: number = DEFAULT_TRUNCATE
): TruncateResult => {
  if (text.length <= limit) {
    return { text, truncated: false, original_size: text.length };
  }
  return {
    text:
      text.slice(0, limit) +
      `\n...[truncated ${text.length - limit} chars of ${text.length}]`,
    truncated: true,
    original_size: text.length,
  };
};

export const safeStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return `${val}n`;
    if (typeof val === "function")
      return `[Function: ${(val as { name?: string }).name || "anonymous"}]`;
    if (typeof val === "symbol") return val.toString();
    if (val instanceof Map) {
      return { __type: "Map", entries: Array.from(val.entries()) };
    }
    if (val instanceof Set) {
      return { __type: "Set", values: Array.from(val.values()) };
    }
    if (val instanceof Error) {
      return {
        __type: "Error",
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }
    if (typeof val === "object" && val !== null) {
      if (seen.has(val as object)) return "[Circular]";
      seen.add(val as object);
    }
    return val;
  });
};
