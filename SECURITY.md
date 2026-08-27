# Security Model

## Security principle

> Identity, role, school scope, resource ownership, time, scoring, and integrity outcomes are server authority. The client may request a state transition but cannot establish its own permissions or result.

| Control | Implementation approach |
|---|---|
| Authentication | Owner-only Super Admin access plus signed, pre-provisioned credential sessions for institution Admins, Teachers, and Students. Passwords use bcrypt hashing; plaintext passwords are never stored. |
| Role authorization | Every restricted procedure calls shared role guards. UI routes are not the authorization boundary. |
| Tenant isolation | School IDs are derived from the authenticated actor and included in server-side record predicates. Client-supplied school scope is ignored. |
| Ownership | Teachers must own a student, assessment, assignment, or result before a protected action succeeds. Admins are limited to their own school. |
| Assessment eligibility | The server verifies assignment, user status, publication state, schedule, code, prior attempts, and concurrent attempt state before creating an attempt. |
| Question confidentiality | Student question responses exclude correct answers. The score is computed only from question records fetched by the server. |
| Timing | The server creates `startedAt` and `expiresAt`, evaluates expiry at each state transition, and scores expired saved answers before closure. |
| Randomization | Question and option order are generated server-side at attempt creation and persisted on the attempt for a consistent reviewable sequence. |
| Attempt concurrency | A partial compound unique index on `{ assessmentId, studentId, status }`, applied only when `status = IN_PROGRESS`, permits one active attempt per student-assessment pair while retaining submitted, expired, and auto-submitted attempt history. The transition that closes an attempt removes it from the partial index before another attempt can begin. |
| Credential uniqueness | Partial compound indexes on `{ schoolId, username }` and `{ schoolId, email }` prevent duplicate issued credentials inside one institution while allowing the same identifier to exist safely at a different institution. |
| Import safety | Preview data is validated before mutation, detects duplicates, sanitizes formula-like cells, and must be confirmed with server-derived teacher scope. |
| Integrity tracking | Browser events are recorded only against the authenticated student's active attempt. The server calculates the violation count and applies auto-submit policy. |
| Auditability | Protected provisioning, assessment, assignment, attempt, and integrity actions write tenant-scoped audit events. |

## Operational checklist

Before production use, provision least-privilege users, use strong temporary passwords, require password rotation in institutional policy, review audit activity regularly, and keep database backups according to the organization's retention policy. Restrict access to production environment variables and apply database migrations through reviewed change control.

The browser signals integrity events; it does not guarantee prevention of all misconduct. Organizations should configure threshold policy, apply human review to violations, and publish a clear assessment integrity policy to students.
