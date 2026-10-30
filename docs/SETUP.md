# Local setup (Windows PowerShell)

## Requirements

- Node.js **22.18.0 or newer** (this repository declares `>=22.18.0`)
- npm 10 or newer
- Docker Desktop with Compose v2

PostgreSQL 16 is provided by Compose. `docker` and `psql` are not required on the host when Docker Desktop is available.

## Install and configure

```powershell
node --version
npm --version
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Review `.env` and set your local values. The example separates the privileged migration connection from the non-owner app connection. Never replace an existing `.env` or commit it.

```powershell
docker compose up -d db
docker compose ps
npm run db:generate
npm run db:migrate -- --name init
```

Run development migrations before starting `npm run dev`. `db:migrate` is for local development only; production and fresh deployed environments must use `npm run db:deploy` and the guarded procedure in [Deployment safety](DEPLOYMENT-SAFETY.md).

Compose creates a local runtime role and an empty `campusconnect_test` database on the first initialization of its volume. These bootstrap scripts only run for a fresh PostgreSQL data volume. The local-only password in the example must be changed outside development.

## Run the app

```powershell
npm run dev
```

Open <http://localhost:3000> and <http://localhost:3000/api/health>.

## Checks and tests

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Install Playwright's Chromium once if needed:

```powershell
npx playwright install chromium
```

Database integration tests are real PostgreSQL tests and are skipped unless both `DATABASE_URL` (owner/admin connection) and `TEST_DATABASE_URL` (non-owner app role connected to `campusconnect_test`) are present. Create and migrate the test schema with the owner connection:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/campusconnect_test?schema=public"
npx prisma migrate deploy
$env:TEST_ADMIN_DATABASE_URL = $env:DATABASE_URL
$env:TEST_DATABASE_URL = "postgresql://campusconnect_app:campusconnect_local_only@localhost:5432/campusconnect_test?schema=public"
npm test
```

Restore the normal `.env` process values in a fresh PowerShell window after the test setup. For production, provide the two URLs from a secret manager and provision the runtime role without table ownership, superuser, or `BYPASSRLS` privileges. `DATABASE_URL` is the privileged migration connection and `APP_DATABASE_URL` is the runtime connection; production migrations must use the guarded `npm run db:deploy` procedure.
