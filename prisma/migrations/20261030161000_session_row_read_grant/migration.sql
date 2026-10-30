-- Prisma create/update operations return the complete row by default. These
-- columns remain protected by session_token_scope, which exposes only the
-- record whose opaque token hash was set for the current transaction.
GRANT SELECT ("createdAt", "lastSeenAt") ON TABLE "Session" TO campusconnect_app;
