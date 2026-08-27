# Assessment Platform Architecture

## Design intent

The application is a **commercial multi-tenant assessment platform** built as a React client, an Express-compatible typed server API, and MongoDB Atlas collections. Tenant isolation is deliberate: every school-owned record carries a `schoolId`, and every privileged operation derives its scope from the authenticated actor rather than from client supplied identifiers.

The platform owner is the only `SUPER_ADMIN`. The owner provisions each institution with a generated institution code and a pre-created Admin account. Institution Admins create Teachers, and Teachers create or import Students. The public entry point has no self-registration path.

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

## MongoDB persistence guarantees

| Data boundary | Atlas collection constraint |
|---|---|
| Institution identity | `schools.code` is globally unique. |
| Issued credentials | `{ schoolId, username }` and `{ schoolId, email }` are partial compound unique indexes. The same identifier can therefore exist at a different institution but not twice in one institution. |
| Student identifiers | `{ schoolId, usn }` and `{ schoolId, studentId }` are partial compound unique indexes. |
| Assessment access codes | `{ schoolId, accessCode }` is a partial compound unique index. |
| Active assessment attempt | `{ assessmentId, studentId, status }` is unique only where `status = IN_PROGRESS`, retaining submitted/expired historical attempts. |

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

`DRAFT → PUBLISHED → ARCHIVED`

An assessment is available only when its published schedule opens. An attempt can be created only after the student is authenticated, active, assigned, within the assessment window, below the maximum attempts, and has provided a valid code if code entry is required. Its expiry is calculated server-side as the earlier of the assessment end time and `startedAt + durationMinutes`.

## Attempt state flow

`IN_PROGRESS → SUBMITTED | EXPIRED | AUTO_SUBMITTED`

The partial active-attempt index permits the first state only once per student-assessment pair. A server-scored closing transition changes the status and removes the document from that partial unique index; a later eligible attempt is then permitted only if the maximum-attempt policy allows it.

## Import state flow

`UPLOADED → PREVIEWED → CONFIRMED` or `REJECTED`

The preview phase normalizes accepted CSV/XLSX columns and applies validation, duplicate detection, and CSV-injection safeguards without mutating student records. The confirmation phase revalidates the batch and uses tenant/teacher identity from the authenticated server context.
