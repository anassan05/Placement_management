import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
    message: "DATABASE_URL must use the PostgreSQL protocol."
  }),
  APP_DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
    message: "APP_DATABASE_URL must use the PostgreSQL protocol."
  }),
  TEST_DATABASE_URL: z.string().url().optional(),
  TEST_ADMIN_DATABASE_URL: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TRUSTED_HOSTS: z.string().default("localhost,127.0.0.1"),
  STUDENT_IMPORT_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(1024 * 1024),
  STUDENT_IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(5000).default(500),
  PRIVATE_STORAGE_ROOT: z.string().min(1).default("./.private-storage"),
  STUDENT_DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(10 * 1024 * 1024)
});

export function parseEnvironment(source: Record<string, string | undefined>) {
  return environmentSchema.parse(source);
}
