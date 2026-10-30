# Phase 2A college onboarding and authentication

## Flows

- `GET /apply-college` accepts a validated application. It creates only a pending application; it creates no college, user, or membership.
- Platform administrators sign in at `/platform/login`. Bootstrap the first platform administrator with `npm run bootstrap:platform-admin` from an interactive PowerShell terminal. Supply `BOOTSTRAP_DATABASE_URL` from the secret store to a privileged connection. The command refuses non-interactive use and refuses to run once any platform administrator exists. Password input is not echoed or accepted on the command line.
- Platform routes under `/platform` require a persisted active platform-admin session. Approval locks the pending application, then creates the inactive college, invitation, lifecycle transition, and platform audit entry in one transaction. Rejection is recorded with an optional reason.
- The approval response displays a single copyable invitation URL. It is not emailed. Deliver the link to the intended administrator through an approved out-of-band channel. The link is a bearer secret; do not put it in tickets, logs, analytics, or shared screenshots.
- `/accept-invitation/[token]` accepts a seven-day, one-use invitation. The submitted address must match the invited address. Existing accounts must also prove the account password. For a new account, possession of the invitation and matching form address are required. This does **not** verify ownership of the email address; no email provider or verification flow is implemented.
- After acceptance, the account, active `COLLEGE_ADMIN` membership, college activation, application lifecycle update, tenant audit event, and session are committed atomically. Subsequent College Admin logins use `/college/login`; accounts with multiple active College Admin memberships select a workspace at `/college/select-college`.

## Database security

The forward migrations are `20261030170000_college_onboarding_auth` and `20261030171000_invitation_activation_select_policy`. The first adds lifecycle/application/invitation/audit/rate-limit structures, forced RLS for User and onboarding tables, and narrowly scoped runtime column grants. The second allows an invite-token-authorized transaction to see only its approved application while applying the activation update. Existing migrations are not edited.

User reads are limited by forced RLS to a transaction-local authenticated email, current user, or presented session hash. Password hashes are available to the authentication service through a column grant so it can verify passwords; no route returns them. New users can only be inserted with a transaction-local matching email and `isPlatformAdmin=false`. Session rows remain forced-RLS scoped to the presented token hash. Platform operations revalidate the persisted platform flag inside the privileged transaction. College tenant operations continue to use the validated session membership and transaction-local `app.current_tenant_id`.

PostgreSQL custom GUC values are not secrets or an unforgeable privilege boundary. Arbitrary SQL execution under `campusconnect_app` could set a custom GUC and thereby weaken these RLS predicates. RLS contains ordinary application queries and tenant-context mistakes; it does not protect against arbitrary SQL execution or a full application-role compromise. Parameterized SQL, reviewed transaction helpers, and least-privilege grants remain required.

## Testing and isolated database use

The normal browser and integration commands target `campusconnect_test`, not the development database:

```powershell
npm run db:test:status
npm run db:test:deploy
npm run test:integration
npm run test:e2e
```

The helper derives test connection URLs from `DATABASE_URL` and `APP_DATABASE_URL` when `TEST_ADMIN_DATABASE_URL` and `TEST_DATABASE_URL` are not set. It only permits the database named `campusconnect_test`. E2E creates a synthetic platform account and removes its applications, memberships, college, sessions, audit entries, rate-limit rows, and temporary credential file during teardown.

The public form uses a shared PostgreSQL fixed-window limiter keyed by normalized email and rejects repeated pending submissions with a generic response. Because no trusted edge/IP limiter is integrated, this does not fully prevent distributed abuse using many email addresses; deploy an upstream rate limit before public production exposure.

## Deployment

Every deployed environment, including fresh deployments, must use `npm run db:deploy` and the provider hooks in [Deployment Safety](./DEPLOYMENT-SAFETY.md). The runner must put the environment in maintenance, stop and drain workloads, fence the runtime role, apply migrations, verify RLS and grants, restart and health-check, then restore traffic. No deployment provider integration is present in this repository, so the required hooks must be configured by the environment operator.
