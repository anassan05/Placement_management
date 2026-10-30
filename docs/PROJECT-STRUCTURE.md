# Project structure

```text
campusconnect/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── PROJECT-STRUCTURE.md
│   ├── SECURITY-CHECKLIST.md
│   └── SETUP.md
│   └── TESTING.md
├── e2e/
│   └── home.spec.ts
├── prisma/
│   └── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/health/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   └── shared/
│   ├── generated/
│   │   └── prisma/              # generated; do not hand-edit
│   ├── lib/
│   │   ├── db.ts
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── request-validation.ts
│   │   └── rate-limit.ts
│   └── modules/
│       ├── authentication/
│       ├── authorization/
│       ├── tenancy/
│       ├── colleges/
│       ├── students/
│       ├── companies/
│       ├── drives/
│       ├── registrations/
│       ├── extraction/
│       ├── notifications/
│       ├── audit/
│       └── reporting/
├── .env.example
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── prisma.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

## Module convention

As each module is implemented, use this internal pattern:

```text
module-name/
├── module-name.schema.ts       # Zod request/domain schemas
├── module-name.service.ts      # business rules and transactions
├── module-name.repository.ts   # Prisma access, tenant scoped
├── module-name.routes.ts       # route handlers or route adapters
├── module-name.permissions.ts  # permission requirements
└── module-name.test.ts         # unit/integration tests
```

Do not create empty abstractions before a module needs them. Keep route handlers thin,
put business rules in services, and keep database access tenant-scoped.
