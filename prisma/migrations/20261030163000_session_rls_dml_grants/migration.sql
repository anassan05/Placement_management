-- Prisma's PostgreSQL adapter uses table-level DML for model writes. RLS still
-- restricts every operation to the presented token hash in the transaction.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Session" TO campusconnect_app;
