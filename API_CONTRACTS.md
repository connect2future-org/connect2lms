# LMS API Contracts

The application exposes typed, Express-hosted API procedures under `/api/trpc`. All mutations return a consistent envelope with `success`, `message`, and `data`. Restricted procedures infer `actorId`, `role`, `schoolId`, and relationship scope from the authenticated session; these fields are not accepted from clients.

## Access and administration

| Procedure | Access | Required input | Result | Notable errors |
|---|---|---|---|---|
| `platform.bootstrap` | Platform owner on first use | None | Creates or upgrades the owner as `SUPER_ADMIN`. | `FORBIDDEN` |
| `schools.create` | `SUPER_ADMIN` | Institution name, type, contact, initial admin identity | School and admin provisioning summary. | `DUPLICATE_SCHOOL_CODE`, `DUPLICATE_EMAIL` |
| `schools.list` | `SUPER_ADMIN` | Optional status, search, page | Paginated schools with server-calculated counts. | `FORBIDDEN` |
| `schools.updateStatus` | `SUPER_ADMIN` | Scoped school ID, new status | Updated school. | `SCHOOL_NOT_FOUND`, `INVALID_STATE` |
| `people.createTeacher` | `ADMIN` | Name, email, username, temporary password | Teacher identity under caller's school. | `DUPLICATE_IDENTITY`, `FORBIDDEN` |
| `people.listTeachers` | `ADMIN` | Optional search and status | Teachers within caller's school only. | `FORBIDDEN` |
| `students.create` | `TEACHER` | Student identity and academic profile | Student tied to caller's school and teacher. | `DUPLICATE_IDENTITY`, `FORBIDDEN` |
| `students.listMine` | `TEACHER` | Optional search, status, page | Caller-owned student records. | `FORBIDDEN` |

## Student import

| Procedure | Access | Required input | Result | Safety behavior |
|---|---|---|---|---|
| `imports.preview` | `TEACHER` | File payload parsed by the client into rows and detected columns | Batch ID, column mapping, row validity summary, and row-level errors. | Does not write users; rejects unrecognized/missing required fields and CSV-formula prefixes. |
| `imports.confirm` | `TEACHER` | Pending batch ID | Created, updated, duplicate, and invalid counters. | Rechecks batch ownership and validity; applies school/teacher ownership server-side. |

## Assessment lifecycle

| Procedure | Access | Required input | Result | Notable errors |
|---|---|---|---|---|
| `assessments.create` | `TEACHER` | Title, window, duration, attempts, policy, validated MCQ questions | Draft assessment. | `INVALID_QUESTION`, `INVALID_SCHEDULE` |
| `assessments.update` | Owning `TEACHER` | Assessment ID and allowed edits | Updated draft assessment. | `FORBIDDEN`, `ASSESSMENT_NOT_EDITABLE` |
| `assessments.publish` | Owning `TEACHER` | Assessment ID | Published assessment and generated code where enabled. | `INVALID_QUESTION`, `INVALID_SCHEDULE` |
| `assignments.create` | Owning `TEACHER` | Assessment ID and student IDs | Assignment summary. | `STUDENT_NOT_OWNED`, `DUPLICATE_ASSIGNMENT` |
| `assessments.studentList` | `STUDENT` | Optional status | Student-safe assessment metadata and derived availability. | `FORBIDDEN` |

## Attempt and integrity engine

| Procedure | Access | Required input | Result | Server rule |
|---|---|---|---|---|
| `attempts.start` | Assigned `STUDENT` | Assessment ID and optional access code | Attempt ID, redacted question list, and `expiresAt`. | Performs active-account, assignment, schedule, code, max-attempt, and duplicate-active-attempt checks. |
| `attempts.saveAnswer` | Attempt-owning `STUDENT` | Attempt ID, question ID, selected option ID | Save timestamp and remaining server time. | Rejects after expiry and validates question membership. |
| `attempts.recordViolation` | Attempt-owning `STUDENT` | Attempt ID and allowed event type | Updated violation count; may include a submitted result. | Count is maintained exclusively by the server. |
| `attempts.submit` | Attempt-owning `STUDENT` | Attempt ID | Server-calculated score, percentage, status, and completion time. | Re-loads question answer keys and never accepts score or timing claims. |
| `results.list` | Teacher owner, School admin, or record-owning student | Filtered role-safe query | Paginated scores and integrity information appropriate to role. | Enforces school and resource scope. |

## Standard error envelope

```json
{
  "success": false,
  "code": "NOT_ASSIGNED_TO_TEST",
  "message": "You are not assigned to this assessment."
}
```

Common assessment authorization codes are `NOT_ASSIGNED_TO_TEST`, `INVALID_ACCESS_CODE`, `ASSESSMENT_NOT_PUBLISHED`, `ASSESSMENT_NOT_STARTED`, `ASSESSMENT_EXPIRED`, `ATTEMPT_ALREADY_COMPLETED`, `ATTEMPT_ALREADY_IN_PROGRESS`, `MAX_ATTEMPTS_REACHED`, `STUDENT_INACTIVE`, and `FORBIDDEN`.
