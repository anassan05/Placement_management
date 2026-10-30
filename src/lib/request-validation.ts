import { z } from "zod";
import { RequestValidationError } from "@/lib/errors";

export async function validateJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError("Request body must contain valid JSON.");
  }
  const result = await schema.safeParseAsync(body);
  if (!result.success) throw new RequestValidationError("Request payload is invalid.");
  return result.data;
}
