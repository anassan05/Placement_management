import { TextDecoder } from "node:util";
import { env } from "@/lib/env";
import { AuthorizationError } from "@/lib/errors";
import { MembershipRole } from "@/generated/prisma/enums";
import type { Principal } from "@/modules/authorization/permissions";
import { requirePermission } from "@/modules/authorization/permissions";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { createStudentInvitations, type StudentInvitationInput } from "./student-invitation.service";
import { studentInvitationSchema } from "./validation";

const requiredHeaders = ["fullName", "email", "registerNumber", "department", "batchYear"] as const;
const optionalHeaders = ["cgpa", "tenthPercentage", "twelfthPercentage", "standingArrears", "historyOfArrears"] as const;
const allHeaders = new Set<string>([...requiredHeaders, ...optionalHeaders]);

export type StudentImportError = { row: number; field: string; message: string; value?: string };
export type StudentImportSummary = {
  created: number;
  rejected: number;
  duplicate: number;
  failed: number;
  errors: StudentImportError[];
  invitationUrls: string[];
};
type ParsedRow = { row: number; values: Record<string, string> };

function canBulkImport(principal: Principal): asserts principal is Extract<Principal, { kind: "membership" }> {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:write");
  if (principal.role !== MembershipRole.COLLEGE_ADMIN && principal.role !== MembershipRole.PLACEMENT_OFFICER) {
    throw new AuthorizationError("Only College Administrators and Placement Officers can import students.");
  }
}

function parseCsvText(text: string): { headers: string[]; rows: ParsedRow[]; errors: StudentImportError[] } {
  const errors: StudentImportError[] = [];
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") { field += "\""; index += 1; }
        else quoted = false;
      } else field += character;
    } else if (character === "\"") {
      if (field.length > 0) errors.push({ row: records.length + 1, field: "csv", message: "Unexpected quote in an unquoted field." });
      quoted = true;
    } else if (character === ",") {
      record.push(field); field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field); records.push(record); record = []; field = "";
    } else field += character;
  }
  if (quoted) errors.push({ row: records.length + 1, field: "csv", message: "Unclosed quoted field." });
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  const nonEmpty = records.filter((row) => row.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [], errors: [{ row: 1, field: "csv", message: "The CSV is empty." }] };
  const headers = nonEmpty[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const normalized = headers.map((header) => header.replace(/\s+/g, "").replace(/-/g, "").toLowerCase());
  const aliases = new Map([...allHeaders].map((header) => [header.toLowerCase(), header]));
  const canonicalHeaders = normalized.map((header) => aliases.get(header) ?? header);
  const seen = new Set<string>();
  canonicalHeaders.forEach((header, index) => {
    if (!allHeaders.has(header)) errors.push({ row: 1, field: headers[index] || `column ${index + 1}`, message: "Unsupported column." });
    else if (seen.has(header)) errors.push({ row: 1, field: header, message: "Duplicate column." });
    seen.add(header);
  });
  requiredHeaders.forEach((header) => {
    if (!canonicalHeaders.includes(header)) errors.push({ row: 1, field: header, message: "Required column is missing." });
  });
  const rows = nonEmpty.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== canonicalHeaders.length) errors.push({ row: rowNumber, field: "csv", message: "Column count does not match the header." });
    return { row: rowNumber, values: Object.fromEntries(canonicalHeaders.map((header, column) => [header, values[column] ?? ""])) };
  });
  if (rows.length > env.STUDENT_IMPORT_MAX_ROWS) errors.push({ row: env.STUDENT_IMPORT_MAX_ROWS + 2, field: "csv", message: `The file exceeds the ${env.STUDENT_IMPORT_MAX_ROWS}-row limit.` });
  return { headers: canonicalHeaders, rows: rows.slice(0, env.STUDENT_IMPORT_MAX_ROWS), errors };
}

export function parseStudentCsv(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > env.STUDENT_IMPORT_MAX_BYTES) {
    return { headers: [], rows: [], errors: [{ row: 1, field: "csv", message: `The file exceeds the ${env.STUDENT_IMPORT_MAX_BYTES}-byte limit.` }] satisfies StudentImportError[] };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseCsvText(text);
  } catch {
    return { headers: [], rows: [], errors: [{ row: 1, field: "csv", message: "The file must be valid UTF-8 CSV." }] };
  }
}

function value(row: ParsedRow, field: string): string | null {
  const result = row.values[field]?.trim() ?? "";
  return result || null;
}

function safeBoolean(raw: string | null): string | null {
  if (raw === null) return null;
  if (["true", "yes", "1"].includes(raw.toLowerCase())) return "true";
  if (["false", "no", "0"].includes(raw.toLowerCase())) return "false";
  return raw;
}

export async function previewStudentImport(principal: Principal, csv: string | Uint8Array) {
  canBulkImport(principal);
  const parsed = parseStudentCsv(csv);
  const errors = [...parsed.errors];
  if (!parsed.headers.length) return { validRows: [], errors, totalRows: parsed.rows.length };
  const result = await withTenantTransaction(principal, async (tx) => {
    const departments = await tx.department.findMany({ where: { isActive: true }, select: { id: true, shortCode: true } });
    const departmentIds = new Map(departments.map((department) => [department.shortCode.toUpperCase(), department.id]));
    const profiles = await tx.studentProfile.findMany({ select: { registerNumber: true } });
    const pending = await tx.studentInvitation.findMany({ where: { acceptedAt: null, revokedAt: null }, select: { emailNormalized: true, registerNumber: true } });
    const existingRegisters = new Set([...profiles.map((profile) => profile.registerNumber.toUpperCase()), ...pending.map((invite) => invite.registerNumber.toUpperCase())]);
    const existingEmails = new Set(pending.map((invite) => invite.emailNormalized));
    const fileEmails = new Set<string>();
    const fileRegisters = new Set<string>();
    const validRows: Array<StudentInvitationInput & { row: number }> = [];
    for (const row of parsed.rows) {
      const email = value(row, "email")?.toLowerCase() ?? "";
      const registerNumber = value(row, "registerNumber")?.toUpperCase() ?? "";
      const departmentId = departmentIds.get(value(row, "department")?.toUpperCase() ?? "");
      const input = {
        fullName: value(row, "fullName") ?? "",
        email,
        registerNumber,
        departmentId: departmentId ?? "00000000-0000-4000-8000-000000000000",
        batchYear: value(row, "batchYear") ?? "",
        cgpa: value(row, "cgpa"),
        tenthPercentage: value(row, "tenthPercentage"),
        twelfthPercentage: value(row, "twelfthPercentage"),
        standingArrears: value(row, "standingArrears"),
        historyOfArrears: safeBoolean(value(row, "historyOfArrears"))
      };
      const validated = studentInvitationSchema.safeParse(input);
      if (!validated.success) {
        validated.error.issues.forEach((issue) => errors.push({ row: row.row, field: String(issue.path[0] ?? "row"), message: issue.message, value: value(row, String(issue.path[0] ?? "")) ?? undefined }));
        continue;
      }
      if (!departmentId) errors.push({ row: row.row, field: "department", message: "Department is not active in this college.", value: value(row, "department") ?? undefined });
      if (fileEmails.has(validated.data.email) || existingEmails.has(validated.data.email)) errors.push({ row: row.row, field: "email", message: "Email is duplicated or already has a pending invitation.", value: validated.data.email });
      if (fileRegisters.has(validated.data.registerNumber) || existingRegisters.has(validated.data.registerNumber)) errors.push({ row: row.row, field: "registerNumber", message: "Register number is duplicated or already enrolled.", value: validated.data.registerNumber });
      await tx.$executeRaw`SELECT set_config('app.auth_email', ${validated.data.email}, true)`;
      const user = await tx.user.findUnique({ where: { email: validated.data.email }, select: { id: true } });
      if (user) {
        const membership = await tx.membership.findUnique({ where: { collegeId_userId: { collegeId: principal.collegeId, userId: user.id } }, select: { id: true } });
        if (membership) {
          errors.push({ row: row.row, field: "email", message: "Email already belongs to an account in this college.", value: validated.data.email });
          existingEmails.add(validated.data.email);
        }
      }
      if (!departmentId || fileEmails.has(validated.data.email) || existingEmails.has(validated.data.email) || fileRegisters.has(validated.data.registerNumber) || existingRegisters.has(validated.data.registerNumber)) continue;
      fileEmails.add(validated.data.email);
      fileRegisters.add(validated.data.registerNumber);
      validRows.push({ ...validated.data, departmentId, row: row.row });
    }
    return { validRows, errors };
  });
  return { validRows: result.validRows, errors: result.errors, totalRows: parsed.rows.length };
}

export async function importStudentCsv(principal: Principal, csv: string | Uint8Array): Promise<StudentImportSummary> {
  canBulkImport(principal);
  const preview = await previewStudentImport(principal, csv);
  const rejected = new Set(preview.errors.map((error) => error.row)).size;
  if (preview.validRows.length === 0) return { created: 0, rejected, duplicate: preview.errors.filter((error) => error.message.includes("duplicated") || error.message.includes("already")).length, failed: 0, errors: preview.errors, invitationUrls: [] };
  try {
    const result = await createStudentInvitations(principal, preview.validRows.map((entry) => {
      const { row, ...input } = entry;
      void row;
      return input;
    }));
    return { created: result.created, rejected, duplicate: preview.errors.filter((error) => error.message.includes("duplicated") || error.message.includes("already")).length, failed: 0, errors: preview.errors, invitationUrls: result.invitationUrls };
  } catch {
    return { created: 0, rejected, duplicate: preview.errors.filter((error) => error.message.includes("duplicated") || error.message.includes("already")).length, failed: preview.validRows.length, errors: [...preview.errors, { row: 0, field: "transaction", message: "The transaction was rolled back; no invitations were created." }], invitationUrls: [] };
  }
}

export function escapeCsvReportCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll("\"", "\"\"")}"`;
}
