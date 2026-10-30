# Deployment safety

## Why deployment is gated

Migration `20261030163000_session_rls_dml_grants` grants table-level `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `Session` to `campusconnect_app`. The next migration, `20261030164000_restore_session_column_grants`, revokes those grants and reinstates the reviewed column-level grants. Forced RLS and the token-hash policy remain enabled during both migrations, but the broad DML grant increases what arbitrary SQL under the app role can do to a token-matched session row. Do not run migrations while app instances or workers can connect.

The repository has no cloud, orchestrator, load balancer, or worker control integration. The guarded runner does not stop remote infrastructure on its own. It requires provider-specific PowerShell hooks and fails before migration if they are missing. Each hook must return success only after its stated operation is confirmed by that provider.

## Required procedure

Use `npm run db:deploy` for every deployed environment, including a fresh deployment. Provide these environment variables in the deployment job:

- `CAMPUSCONNECT_MAINTENANCE_HOOK`: script that blocks incoming traffic and confirms maintenance mode.
- `CAMPUSCONNECT_STOP_WORKLOADS_HOOK`: script that stops all app instances and background workers.
- `CAMPUSCONNECT_DRAIN_HOOK`: script that waits for active requests and jobs to drain.
- `CAMPUSCONNECT_START_WORKLOADS_HOOK`: script that starts app instances and workers after database verification.
- `CAMPUSCONNECT_RESTORE_TRAFFIC_HOOK`: script that restores incoming traffic only after health passes.
- `CAMPUSCONNECT_HEALTHCHECK_URL`: deployed application health endpoint.
- `DATABASE_URL`: privileged migration connection from the deployment secret store.
- `APP_DATABASE_URL`: runtime connection from the deployment secret store.

The onboarding migrations add forced RLS to `User` and four onboarding tables. The `User` runtime role has no table-level grants; its column allowlist includes authentication-only password-hash lookup, identity columns, and the limited invited-user INSERT columns. The deployment guard verifies that exact allowlist and the transaction-context User policies. `passwordHash` must never be returned by a route, logged, or exposed to browser code.

The runner requires Node.js 22.18.0 or newer and valid hook files before taking action. It then:

1. Verifies the migration connection is not `campusconnect_app` and can manage the runtime role, inspect activity, and terminate its backends.
2. Enters maintenance mode, stops workloads, and drains requests through provider hooks.
3. Sets `campusconnect_app` to `NOLOGIN`, terminates remaining sessions for that role across databases, and confirms none remain. The guard excludes its own privileged migration connection PID.
4. Runs `prisma migrate deploy` and `prisma migrate status`.
5. Checks User and Session grants, application-role ownership, forced RLS on both authentication tables, the User auth-context policies, and the Session token-hash policy.
6. Re-enables app-role login, starts workloads, checks the health endpoint, and only then calls the traffic-restore hook.

Any failure stops the sequence. Traffic is not restored automatically. If a failure occurs after the login fence, the runtime role may remain `NOLOGIN`; an operator must inspect the database and deployment before recovery.

Migration execution is separate from `npm run start`. Do not run raw `prisma migrate deploy` in a deployed environment. Local development uses `npm run db:migrate` before starting the local app; that is not the deployment procedure.

## Node.js on Windows

The normal Windows installation must report at least `v22.18.0` in a new PowerShell session. Upgrade with `winget upgrade --id OpenJS.NodeJS.LTS --exact` when WinGet is available, or install a current Node.js Windows MSI from the [official Node.js downloads](https://nodejs.org/en/download/). Run the installer with administrator rights if required, open a new PowerShell session, and verify `node --version` and `npm --version`. A bundled or project-local runtime does not change the normal system installation.
