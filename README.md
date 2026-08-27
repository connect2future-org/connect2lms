# Northstar LMS Assessment Platform

Northstar is a **secure, multi-tenant assessment platform** designed for Super Admins, school Admins, Teachers, and Students. The project uses a React client with an Express-compatible typed server API, Drizzle ORM, and a managed SQL database. It enforces school scope and resource ownership on the server, rather than trusting IDs or roles sent by the browser.

## Capabilities

| Area | Included implementation |
|---|---|
| Tenancy and roles | `SUPER_ADMIN`, `ADMIN`, `TEACHER`, and `STUDENT` roles with school-scoped server guards, teacher/student ownership checks, and audit events. |
| Provisioning | Super Admin school plus school-admin creation; Admin teacher creation; Teacher manual student provisioning and account controls. |
| Imports | Two-stage CSV/XLSX preview, column normalization/mapping, field validation, duplicate detection, spreadsheet formula neutralization, and confirmation before mutation. |
| Assessments | Validated MCQs, draft/publish/unpublish/archive lifecycle, schedules, access-code controls, server-generated codes, assignment, randomization, negative marking, and max-attempt policies. |
| Attempts | Server-calculated expiry, immutable question/option order per attempt, autosave, one active attempt constraint, server scoring, and result history. |
| Integrity | Configurable fullscreen/focus/clipboard/context-menu/shortcut monitoring, immutable violation records, audit events, and server-triggered threshold auto-submit. |
| Operations | Responsive role dashboards, searchable tables, tenant-safe activity trails, student/teacher results, and client-generated CSV exports for owned data. |

## Local development

The project expects Node.js 22+ and `pnpm` 10+.

```bash
pnpm install
pnpm drizzle-kit migrate
pnpm dev
```

Open the dev-server URL printed by the development command. The platform's managed environment injects database, authentication, and application variables. Do not commit `.env` files or production credentials.

## Database lifecycle

The source-of-truth schema is `drizzle/schema.ts`. Schema changes should be made using the following disciplined sequence.

```bash
pnpm drizzle-kit generate
# Review the generated SQL migration in drizzle/
pnpm drizzle-kit migrate
```

The existing migration set provisions schools, extended users, student profiles, assessments, questions, assignments, attempts, integrity violations, import batches, and audit logs. It also enforces one concurrent active attempt per student-assessment pair.

## Quality commands

```bash
pnpm check
pnpm test
pnpm build
```

The current automated suite includes authorization/scope, people-management, import validation, publication lifecycle, access-code control, assessment scoring, duplicate attempt rejection, expiry scoring, and integrity threshold coverage.

## Delivery and operations notes

The owner account is initialized as the platform-level Super Admin by the managed authentication runtime. School users are then provisioned through the role-limited workflows. For first production deployment, provision a school and its Admin, then use that Admin to create a Teacher and that Teacher to create/import Students.

> Run a final multi-account browser acceptance test before production use. The source includes automated role/scoping coverage, but this workspace presently has only the owner session available for interactive browser verification.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [API_CONTRACTS.md](./API_CONTRACTS.md), [SECURITY.md](./SECURITY.md), and [VALIDATION.md](./VALIDATION.md) for operational detail.
