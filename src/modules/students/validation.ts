import { z } from "zod";

const cleanText = (min: number, max: number) => z.string().trim().min(min).max(max)
  .transform((value) => value.normalize("NFC").replace(/\s+/g, " "));

export const studentInvitationSchema = z.object({
  fullName: cleanText(2, 140),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  registerNumber: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).transform((value) => value.toUpperCase()),
  departmentId: z.string().uuid(),
  batchYear: z.coerce.number().int().min(2000).max(2200),
  cgpa: z.coerce.number().min(0).max(10).nullable().optional().default(null),
  tenthPercentage: z.coerce.number().min(0).max(100).nullable().optional().default(null),
  twelfthPercentage: z.coerce.number().min(0).max(100).nullable().optional().default(null),
  standingArrears: z.coerce.number().int().min(0).max(100).nullable().optional().default(null),
  historyOfArrears: z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).nullable().optional().default(null)
}).strict();

export const studentAcceptanceSchema = z.object({
  password: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256)
}).strict().refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"], message: "Passwords do not match."
});

const clean = (min: number, max: number) => z.string().trim().min(min).max(max);

export const studentProfileSchema = z.object({
  fullName: clean(2, 140),
  registerNumber: z.string().trim().min(2).max(60),
  departmentCode: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  batchYear: z.coerce.number().int().min(2000).max(2100),
  phone: z.string().trim().max(40).transform((v) => v || null).default(null),
  dateOfBirth: z.string().trim().max(40).transform((v) => (v ? new Date(v) : null)).default(null)
}).strict();

export const academicRecordSchema = z.object({
  cgpa: z.coerce.number().min(0).max(10).nullable().optional(),
  tenthPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  twelfthPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  standingArrears: z.coerce.number().int().min(0).max(100).nullable().optional(),
  historyOfArrears: z.boolean().nullable().optional()
}).strict();
