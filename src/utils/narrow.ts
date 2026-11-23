// Narrowing helpers for values whose type is not known (caught errors,
// request bodies, decoded tokens).

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** `value.message` when there is one; what `error.message` would have given in JS. */
export const messageOf = (value: unknown): unknown => (isRecord(value) ? value.message : undefined);
