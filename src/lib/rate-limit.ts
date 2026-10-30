export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Back this interface with a shared store (for example Redis) before exposing auth routes. */
export interface RateLimitStore {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}

export class RateLimitError extends Error {
  readonly statusCode = 429;

  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests.");
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(
  store: RateLimitStore,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const decision = await store.consume(key, limit, windowSeconds);
  if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds);
}
