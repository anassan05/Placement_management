-- Prisma UPDATE/RETURNING must be able to see the invitation's application.
-- The capability is bound to the application ID from a previously locked,
-- token-authorized invitation and is transaction-local.
CREATE POLICY college_application_invitation_activation_read ON "CollegeApplication" FOR SELECT USING (
  "id" = NULLIF(current_setting('app.invitation_application_id', true), '')::uuid
  AND "status" = 'APPROVED'
  AND "onboardingState" IN ('INVITATION_PENDING', 'ADMIN_ACTIVATED')
);
