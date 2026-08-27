# Northstar Institution Assessment SaaS

Northstar is a **commercial multi-tenant assessment platform** for schools and colleges. It combines a React client with an Express-compatible typed server API and a MongoDB Atlas persistence layer. The platform owner is the sole Super Admin; each institution receives a separate data boundary, a generated institution code, and a pre-created institution Admin account.

## Commercial access model

| Actor | Account provisioner | Login requirements | Server-enforced scope |
|---|---|---|---|
| Super Admin | Platform owner only | Owner-authenticated session; no public sign-up | All provisioned institutions |
| Institution Admin | Super Admin | Institution code, issued email/username, password | One school or college |
| Teacher | Institution Admin | Institution code, issued email/username, password | Own institution, own roster, own assessments |
| Student | Teacher, manually or by import | Institution code, issued username, USN, or roll number, plus password | Own assigned assessments and attempts |

> **No public self-registration is available.** This is intentional: all accounts are issued by the appropriate upstream role to protect institutional and student data boundaries.

## Included capabilities

| Area | Included implementation |
|---|---|
| Tenancy and roles | `SUPER_ADMIN`, `ADMIN`, `TEACHER`, and `STUDENT` roles, server-derived school scope, ownership checks, and audit records. |
| Institution onboarding | Super Admin provisions an institution, a unique institution code, and its initial Admin username/password. The code and username are revealed once; the temporary password is never re-shown. |
| Roster management | Admins create Teachers. Teachers create, update, deactivate, reset credentials for, or safely import Students. |
| Imports | Two-stage CSV/XLSX preview with field mapping, validation, duplicate handling, spreadsheet-formula neutralization, and explicit confirmation. |
| Assessments | Validated MCQs, schedules, draft/publish/unpublish/archive lifecycle, unique test-code controls, randomization, negative marking, assignments, and maximum-attempt policies. |
| Attempts and integrity | Server-calculated expiry, autosave, immutable question/option order, backend scoring, integrity-event records, and threshold-based auto-submit. |
| Operations | Responsive role dashboards, filters, audit logs, reporting, and scoped CSV result export. |

## MongoDB Atlas setup

The application requires a secure MongoDB Atlas URI configured as `MONGODB_URI` through the deployment environment's secret manager. Do not commit a `.env` file or a connection string. The Atlas user should have only the privileges needed by the target database, and the Atlas Network Access list must permit the deployed application environment.

After setting the secret, install dependencies and create or upgrade the required indexes:

```bash
pnpm install
pnpm tsx server/mongoIndexes.ts
pnpm dev
```

The index command is idempotent. It maintains the following commercial data guarantees:

| Constraint | MongoDB Atlas index strategy |
|---|---|
| Unique institution code | Unique `schools.code` index |
| Issued credential uniqueness | Partial compound unique indexes on `{ schoolId, username }` and `{ schoolId, email }` |
| Student identifier uniqueness | Partial compound unique indexes on `{ schoolId, usn }` and `{ schoolId, studentId }` |
| Assessment code uniqueness | Partial compound unique index on `{ schoolId, accessCode }` |
| One active attempt | Partial compound unique index on `{ assessmentId, studentId, status }` where `status` is `IN_PROGRESS` |

## Development and validation

The project expects Node.js 22+ and `pnpm` 10+.

```bash
pnpm check
pnpm test
pnpm build
```

The regular unit suite covers role guards, tenant constraints, import handling, scoring, expiry, and integrity policy. Run the live Atlas checks separately because they create then remove isolated test collections:

```bash
RUN_MONGO_INTEGRATION=true pnpm vitest run server/mongo.secret.test.ts
RUN_MONGO_INTEGRATION=true pnpm vitest run server/mongo.constraints.integration.test.ts
```

## First institution onboarding

The first production sequence is intentionally controlled. The platform owner signs in through the managed owner session and opens the Super Admin command center. There, create the institution and its first Admin account. Securely transmit the generated institution code, issued username, and temporary password to the institution Admin through an out-of-band channel. That Admin creates Teacher accounts, and each Teacher creates or imports Student accounts.

Before production use, perform a manual acceptance pass using distinct Admin, Teacher, and Student accounts. Confirm credential provisioning, institution-code login, XLSX/CSV selection, import confirmation, assessment assignment, test-code entry, assessment completion, result export, and audit visibility.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [API_CONTRACTS.md](./API_CONTRACTS.md), [SECURITY.md](./SECURITY.md), and [VALIDATION.md](./VALIDATION.md) for architecture, endpoint contracts, security controls, and validation evidence.
