# Assessment Platform Architecture

## Design intent

The application is a **multi-tenant assessment platform** built as a React client and an Express-compatible, typed server API. Tenant isolation is deliberate: every school-owned record carries a `schoolId`, and every privileged operation derives its scope from the authenticated actor rather than from client supplied identifiers.

## Domain model

| Entity | Purpose | Ownership and isolation rule |
|---|---|---|
| `school` | A provisioned institution and tenant boundary. | Created and administered by `SUPER_ADMIN`. |
| `user` | Login identity for all four roles. | Non-super-admin identities always belong to exactly one school. |
| `studentProfile` | Student academic metadata and teacher relationship. | Belongs to one school and is managed only by its owning teacher or school admin. |
| `assessment` | Draft/published MCQ assessment configuration and question content. | Belongs to the creating teacher and school. |
| `assessmentAssignment` | Explicit authorization to take an assessment. | Unique per assessment and student; access code alone never grants permission. |
| `attempt` | Server-owned timer, submitted answers, score, and status. | A student may access only their own records. |
| `integrityViolation` | Immutable browser integrity events. | Valid only for the active, authenticated student attempt. |
| `importBatch` | Two-stage student import preview and confirmation record. | Belongs to a teacher; preview data remains pending until explicit confirmation. |
| `auditLog` | Security-relevant business event record. | Stores actor, tenant scope, target metadata, and safe request context without secrets. |

## Authorization matrix

| Role | Allowed scope | Principal responsibilities |
|---|---|---|
| `SUPER_ADMIN` | Platform-wide | Provision and govern schools and school administrators; view aggregate activity. |
| `ADMIN` | Authenticated admin's school only | Manage teachers and view school-level performance and activity. |
| `TEACHER` | Authenticated teacher's school and own students/assessments only | Manage students, imports, assessments, assignments, results, and reports. |
| `STUDENT` | Own profile, assigned assessments, and own attempts only | Take authorized assessments and review own results/history. |

## Security boundary

> The browser supplies intent; the server establishes identity, tenant scope, ownership, time, eligibility, score, and violation count.

Every restricted procedure follows the same sequence: authenticate the user, verify their role, derive school scope, verify ownership/relationship, load the requested resource within that scope, and then perform the requested state transition. Assessment attempts use server timestamps and a unique active-attempt invariant. Question answer keys are never included in student-safe assessment responses.

## Assessment state flow

`DRAFT → PUBLISHED → ACTIVE → COMPLETED → ARCHIVED`

An attempt can be created only after the student is authenticated, active, assigned, within the assessment window, below the maximum attempts, and has provided a valid code if code entry is required. Its expiry is calculated server-side as the earlier of the assessment end time and `startedAt + durationMinutes`.

## Import state flow

`UPLOADED → PREVIEWED → CONFIRMED` or `REJECTED`

The preview phase normalizes accepted CSV/XLSX columns and applies validation, duplicate detection, and CSV-injection safeguards without mutating student records. The confirmation phase revalidates the batch and uses tenant/teacher identity from the authenticated server context.

