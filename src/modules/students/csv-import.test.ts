import { beforeAll, describe, expect, it } from "vitest";

let escapeCsvReportCell: typeof import("./csv-import.service").escapeCsvReportCell;
let parseStudentCsv: typeof import("./csv-import.service").parseStudentCsv;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/campusconnect_test";
  process.env.APP_DATABASE_URL = "postgresql://test:test@localhost:5432/campusconnect_test";
  ({ escapeCsvReportCell, parseStudentCsv } = await import("./csv-import.service"));
});

describe("student CSV import parsing", () => {
  it("parses quoted values and optional academic fields", () => {
    const result = parseStudentCsv(
      'fullName,email,registerNumber,department,batchYear,cgpa,historyOfArrears\r\n"Doe, Jane",JANE@EXAMPLE.EDU,cs/01,CSE,2026,8.5,false\r\n'
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0].values).toMatchObject({ fullName: "Doe, Jane", email: "JANE@EXAMPLE.EDU", cgpa: "8.5" });
  });

  it("rejects missing and unsupported headers, malformed quoting, and formula cells in reports", () => {
    expect(parseStudentCsv("fullName,email\nA,a@example.edu").errors.map((error) => error.message)).toContain("Required column is missing.");
    expect(parseStudentCsv("fullName,email,registerNumber,department,batchYear,unknown\nA,a@example.edu,1,CSE,2026,x").errors.map((error) => error.message)).toContain("Unsupported column.");
    expect(parseStudentCsv('fullName,email,registerNumber,department,batchYear\n"A,a@example.edu,1,CSE,2026').errors.map((error) => error.message)).toContain("Unclosed quoted field.");
    expect(escapeCsvReportCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
  });

  it("enforces the configured byte limit before parsing", () => {
    const result = parseStudentCsv(new Uint8Array(1024 * 1024 + 1));
    expect(result.errors[0].message).toContain("byte limit");
  });
});
