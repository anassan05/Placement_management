import { z } from "zod";

const cleanText = (min: number, max: number) => z.string().trim().min(min).max(max)
  .transform((value) => value.normalize("NFC").replace(/\s+/g, " "));

export const collegeApplicationSchema = z.object({
  collegeName: cleanText(3, 180),
  shortName: cleanText(2, 80),
  websiteUrl: z.string().trim().max(300).transform((value) => value || null).pipe(
    z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).nullable()
  ),
  contactEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  contactPhone: z.string().trim().min(7).max(32).regex(/^[+()\d.\-\s]+$/),
  state: cleanText(2, 100),
  district: cleanText(2, 100),
  address: cleanText(8, 500),
  administratorName: cleanText(2, 140),
  administratorEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  message: z.string().trim().max(2000).transform((value) => value || null),
  companyWebsite: z.string().trim().max(200).optional().default("")
});

export const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());

export const invitationAcceptanceSchema = z.object({
  email: emailSchema,
  displayName: cleanText(2, 140),
  password: z.string().min(12).max(256)
});

export const rejectionReasonSchema = z.string().trim().max(1000).transform((value) => value || null);

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizeCollegeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function collegeSlug(value: string): string {
  const slug = normalizeCollegeName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "college";
}

export function collegeCode(value: string): string {
  const code = value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase().slice(0, 12);
  return code || "COLLEGE";
}
