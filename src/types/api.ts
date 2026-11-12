// The response envelope every endpoint uses (docs/API_CONTRACT.md):
// { success, message?, ...payload }.
import type { Request, RequestHandler } from "express";

/** Express's default params type ({ [name]: string }). */
type ParamsDictionary = Request["params"];

export interface ApiResponse {
  success: boolean;
  message?: string;
  [payload: string]: unknown;
}

/** An Express handler that answers with the envelope. */
export type ApiHandler<
  Params = ParamsDictionary,
  Body = Record<string, never>,
> = RequestHandler<Params, ApiResponse, Body>;
