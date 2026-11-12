// Runs Zod schemas against req.body / req.params before the controller.
// On success req.body is replaced by the parsed value, so controllers only
// ever see known keys with the right types. On failure: 400 + first message.
import type { RequestHandler } from "express";
import type { z } from "zod";

export interface RequestSchemas {
  params?: z.ZodType;
  body?: z.ZodType;
}

export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req, res, next) => {
    for (const key of ["params", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Invalid request.",
        });
      }
      if (key === "body") req.body = result.data;
    }
    next();
  };
