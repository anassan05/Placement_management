import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/rate-limit";
import { onboardingRateLimits } from "@/lib/postgres-rate-limit";
import { z } from "zod";
import { collegeApplicationSchema, normalizeCollegeName } from "./validation";

export type CollegeApplicationInput = z.infer<typeof collegeApplicationSchema>;

export async function submitCollegeApplication(input: CollegeApplicationInput): Promise<string> {
  if (input.companyWebsite) throw new Error("Application could not be accepted.");
  await enforceApplicationRateLimit(input.contactEmail);

  const normalizedCollege = normalizeCollegeName(input.collegeName);
  const submissionKey = createHash("sha256")
    .update(JSON.stringify([normalizedCollege, input.administratorEmail]))
    .digest("hex");
  const id = randomUUID();
  const reference = `CC-${randomBytes(6).toString("hex").toUpperCase()}`;
  const now = new Date();

  let inserted: number;
  try {
    inserted = await db.$executeRaw`
    INSERT INTO "CollegeApplication" (
      id, "applicationRef", "collegeName", "shortName", "websiteUrl", "contactEmail",
      "contactEmailNormalized", "contactPhone", state, district, address,
      "administratorName", "administratorEmail", "administratorEmailNormalized", message,
      "submissionKey", status, "createdAt", "updatedAt"
    ) VALUES (
      ${id}::uuid, ${reference}, ${input.collegeName}, ${input.shortName}, ${input.websiteUrl},
      ${input.contactEmail}, ${input.contactEmail}, ${input.contactPhone}, ${input.state}, ${input.district}, ${input.address},
      ${input.administratorName}, ${input.administratorEmail}, ${input.administratorEmail}, ${input.message},
      ${submissionKey}, 'PENDING', ${now}, ${now}
    )`;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("A similar application is already being reviewed.");
    throw error;
  }
  if (inserted !== 1) throw new Error("Application could not be accepted.");
  return reference;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "P2002") return true;
  if ("meta" in error && error.meta && typeof error.meta === "object" && "code" in error.meta && error.meta.code === "23505") return true;
  return "message" in error && typeof error.message === "string" && error.message.includes("23505");
}

async function enforceApplicationRateLimit(email: string): Promise<void> {
  const decision = await onboardingRateLimits.consume(`college-application:${email}`, 3, 60 * 60);
  if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds);
}
