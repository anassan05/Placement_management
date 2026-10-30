-- Remove the blanket runtime grants inherited from the initial RLS migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM campusconnect_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM campusconnect_app;

-- User is global because authentication and membership relations resolve before
-- tenant context exists. Expose only the identity/status columns needed by those
-- paths; password hashes and profile data are unavailable to the runtime role.
REVOKE ALL ON TABLE "User" FROM campusconnect_app;
GRANT SELECT ("id", "isActive") ON TABLE "User" TO campusconnect_app;

-- Sessions remain usable before tenant resolution, but only by a transaction
-- carrying the hash of the opaque token being resolved or mutated.
REVOKE ALL ON TABLE "Session" FROM campusconnect_app;
GRANT SELECT ("id", "userId", "activeCollegeId", "tokenHash", "expiresAt"),
      INSERT ("userId", "activeCollegeId", "tokenHash", "expiresAt"),
      UPDATE ("activeCollegeId"), DELETE
  ON TABLE "Session" TO campusconnect_app;

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
CREATE POLICY session_token_scope ON "Session"
  USING ("tokenHash" = NULLIF(current_setting('app.current_session_hash', true), ''))
  WITH CHECK ("tokenHash" = NULLIF(current_setting('app.current_session_hash', true), ''));
