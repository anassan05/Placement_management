import { RateLimitError } from "@/lib/rate-limit";

export class AuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}
export class AuthenticationError extends Error {
  readonly statusCode = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RequestValidationError extends Error {
  readonly statusCode = 400;

  constructor(message = "Invalid request payload") {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function toErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError || error instanceof RequestValidationError || error instanceof RateLimitError) {
    return { status: error.statusCode, message: error.message };
  }
  return { status: 500, message: "An unexpected error occurred." };
}
