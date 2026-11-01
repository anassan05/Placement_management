# CampusConnect

Multi-college campus placement management platform foundation.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict mode · Tailwind CSS · PostgreSQL 16 · Prisma 7 · Zod · Vitest · Playwright.

## Setup

See [Windows PowerShell setup](docs/SETUP.md). Requirements include Node.js 22.18+ and Docker Desktop for the local PostgreSQL service.

## Phase 1 and Phase 2A status

The repository includes the modular monolith, forced tenant RLS, authentication/session primitives, approval-based college onboarding, platform and college administrator sign-in, and an initial college administrator workspace. See [Phase 2A onboarding](docs/PHASE-2A-ONBOARDING.md) for bootstrap, database, invitation, and deployment procedures.

Student profile management and Phase 3A student invitation/activation are implemented in the current worktree; bulk import, private documents, and the student dashboard remain outstanding. Email delivery and email ownership verification are not implemented. Review the documented SQL/GUC and public rate-limit caveats before production exposure; do not use real student data until the remaining product and operational controls are complete.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Project structure](docs/PROJECT-STRUCTURE.md)
- [Security checklist](docs/SECURITY-CHECKLIST.md)
- [Setup](docs/SETUP.md)
- [Testing](docs/TESTING.md)
- [Phase 2A onboarding](docs/PHASE-2A-ONBOARDING.md)
