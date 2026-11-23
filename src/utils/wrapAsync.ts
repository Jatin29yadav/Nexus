// Unused: controllers catch their own errors. Kept for reference.
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const wrapAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
