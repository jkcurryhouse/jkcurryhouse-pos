import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";
import { resolveClientIp } from "@/lib/clientIp";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, m, "bad_request");
export const unauthorized = (m = "Not signed in") => new ApiError(401, m, "unauthorized");
export const forbidden = (m = "You don't have permission to do that") =>
  new ApiError(403, m, "forbidden");
export const notFound = (m = "Not found") => new ApiError(404, m, "not_found");
export const conflict = (m: string) => new ApiError(409, m, "conflict");

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

type Ctx = { params: Record<string, string> };

/** Wraps a route handler with uniform error handling. */
export function handler(fn: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return json(
      { error: "Invalid request", code: "validation", issues: err.issues },
      { status: 400 }
    );
  }
  console.error("[api] unhandled error", err);
  return json({ error: "Something went wrong on the server", code: "internal" }, { status: 500 });
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(body);
}

export function clientIp(req: NextRequest): string {
  return resolveClientIp(req.headers, req.ip ?? "unknown");
}

export const toPence = (gbp: number) => Math.round(gbp * 100);
export const toGbp = (pence: number) => pence / 100;

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
