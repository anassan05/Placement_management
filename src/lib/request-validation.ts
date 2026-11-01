import { z } from "zod";
import { RequestValidationError } from "@/lib/errors";

const MAX_JSON_BODY_BYTES = 1_000_000;

export async function validateJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (!Number.isFinite(size) || size < 0 || size > MAX_JSON_BODY_BYTES) {
      throw new RequestValidationError("Request body is too large.");
    }
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new RequestValidationError("Request body must contain valid JSON.");
  }
  if (raw.length > MAX_JSON_BODY_BYTES) {
    throw new RequestValidationError("Request body is too large.");
  }
  let body: unknown;
  try {
    body = raw.length ? JSON.parse(raw) : null;
  } catch {
    throw new RequestValidationError("Request body must contain valid JSON.");
  }
  const result = await schema.safeParseAsync(body);
  if (!result.success) throw new RequestValidationError("Request payload is invalid.");
  return result.data;
}
