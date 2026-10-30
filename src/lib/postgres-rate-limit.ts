import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { RateLimitDecision, RateLimitStore } from "@/lib/rate-limit";

/** PostgreSQL-backed fixed-window limiter shared by app processes. Only key digests are stored. */
export class PostgresRateLimitStore implements RateLimitStore {
  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const keyHash = createHash("sha256").update(key).digest("hex");
    return db.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('app.current_rate_limit_hash', ${keyHash}, true)`;
      const rows = await transaction.$queryRaw<Array<{ attempts: number; windowStartedAt: Date }>>`
        INSERT INTO "RateLimitBucket" ("keyHash", "windowStartedAt", attempts)
        VALUES (${keyHash}, now(), 1)
        ON CONFLICT ("keyHash") DO UPDATE SET
          "windowStartedAt" = CASE
            WHEN "RateLimitBucket"."windowStartedAt" <= now() - make_interval(secs => ${windowSeconds})
            THEN now() ELSE "RateLimitBucket"."windowStartedAt" END,
          attempts = CASE
            WHEN "RateLimitBucket"."windowStartedAt" <= now() - make_interval(secs => ${windowSeconds})
            THEN 1 ELSE "RateLimitBucket".attempts + 1 END
        RETURNING attempts, "windowStartedAt"`;
      const bucket = rows[0];
      if (!bucket) throw new Error("Rate-limit storage did not return a decision.");

      if (Math.random() < 1 / 64) {
        await transaction.$executeRaw`SELECT set_config('app.rate_limit_sweep', 'true', true)`;
        await transaction.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "windowStartedAt" < now() - interval '48 hours'`;
      }

      const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds - (Date.now() - bucket.windowStartedAt.getTime()) / 1000));
      return {
        allowed: bucket.attempts <= limit,
        remaining: Math.max(0, limit - bucket.attempts),
        retryAfterSeconds
      };
    });
  }
}

export const onboardingRateLimits = new PostgresRateLimitStore();
