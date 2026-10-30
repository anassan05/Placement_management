-- Prisma generates UUID defaults client-side for this model, so it supplies id
-- during INSERT even though the application does not choose the identifier.
GRANT INSERT ("id") ON TABLE "Session" TO campusconnect_app;
