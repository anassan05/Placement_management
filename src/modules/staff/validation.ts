import { z } from "zod";

export const staffRoleSchema = z.enum(["PLACEMENT_OFFICER", "COORDINATOR"]);
const clean = (min: number, max: number) => z.string().trim().min(min).max(max).transform((v) => v.normalize("NFC").replace(/\s+/g, " "));
export const staffInvitationSchema = z.object({
  fullName: clean(2, 140),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  role: staffRoleSchema,
  departmentIds: z.array(z.string().uuid()).max(25).default([]),
  message: z.string().trim().max(1000).transform((v) => v || null).default("")
}).strict().superRefine((v, ctx) => {
  if (v.role === "COORDINATOR" && v.departmentIds.length === 0) ctx.addIssue({ code: "custom", path: ["departmentIds"], message: "Choose at least one department for a Coordinator." });
  if (v.role === "PLACEMENT_OFFICER" && v.departmentIds.length) ctx.addIssue({ code: "custom", path: ["departmentIds"], message: "Placement Officers are college-level staff." });
});

export const departmentSchema = z.object({
  name: clean(2, 100),
  shortCode: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).transform((v) => v || null).default("")
}).strict();

export const staffAcceptanceSchema = z.object({
  displayName: clean(2, 140),
  password: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256)
}).strict().refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
