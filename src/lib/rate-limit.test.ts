import { describe, expect, it } from "vitest";
import { enforceRateLimit, RateLimitError, type RateLimitStore } from "./rate-limit";

describe("rate limit integration seam", () => {
  const blockedStore: RateLimitStore = {
    async consume() { return { allowed: false, remaining: 0, retryAfterSeconds: 60 }; }
  };

  it("surfaces a safe throttling error from the configured shared store", async () => {
    await expect(enforceRateLimit(blockedStore, "login:ip-hash", 5, 60)).rejects.toBeInstanceOf(RateLimitError);
  });
});
