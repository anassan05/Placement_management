-- Remove the temporary table-level DML grant from the preceding compatibility
-- migration. Keep only the columns required by the session store; row access is
-- still additionally constrained by forced token-hash RLS.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "Session" FROM campusconnect_app;
GRANT SELECT ("id", "userId", "activeCollegeId", "tokenHash", "expiresAt", "createdAt", "lastSeenAt"),
      INSERT ("id", "userId", "activeCollegeId", "tokenHash", "expiresAt"),
      UPDATE ("activeCollegeId"), DELETE
  ON TABLE "Session" TO campusconnect_app;
