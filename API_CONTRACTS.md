# API Contracts

The application exposes typed Express-hosted procedures under `/api/trpc`. MongoDB Atlas stores tenant-bound records; the server derives the actor, role, institution scope, and ownership from the session rather than accepting these values from the browser.

## Authentication and commercial onboarding

| Procedure | Access | Required input | Result | Key rule |
|---|---|---|---|---|
| `auth.login` | Public, provisioned users only | `role`, `institutionCode`, `identifier`, `password` | Signed session and public user profile | Only `ADMIN`, `TEACHER`, and `STUDENT` are accepted. No account is created. |
| `auth.ownerLogin` | Public, owner credentials only | `email`, `password` | Signed Super Admin session and owner profile | Dedicated managed email/password; institution credentials cannot use this entry point. |
| `auth.me` | Public | None | Current session profile or `null` | Resolves the signed Super Admin or institution credential session. |
| `auth.logout` | Public | None | Success acknowledgement | Clears only the signed application session. |
| `platform.schools.create` | `SUPER_ADMIN` | Institution profile and initial Admin identity | New institution, generated code, and public Admin profile | The temporary password is hashed and never returned. |
| `platform.schools.setStatus` | `SUPER_ADMIN` | `schoolId`, status | Updated status | Institution state is enforced at the credential lookup boundary. |

## Institution people and roster management

| Procedure | Access | Required input | Result | Scope guarantee |
|---|---|---|---|---|
| `people.admin.createTeacher` | `ADMIN` | Teacher profile and temporary password | Public Teacher profile | The Teacher belongs to the caller's institution. |
| `people.teacher.createStudent` | `TEACHER` | Student identity, academic profile, temporary password | Public Student profile | The Student belongs to the caller's institution and teacher. |
| `imports.preview` | `TEACHER` | Parsed CSV/XLSX rows and source name | Batch ID, column mapping, validity summary, row errors | Preview makes no student-record change. |
| `imports.confirm` | `TEACHER` | `batchId`, default temporary password | Created, updated, duplicate, invalid counters | Batch ownership and student scope are rechecked on the server. |

## Assessment, assignment, and results

| Procedure | Access | Required input | Result | Key rule |
|---|---|---|---|---|
| `assessments.create` | `TEACHER` | Schedule, policy, and validated MCQ list | Draft assessment | Test code is generated or validated when code access is enabled. |
| `assessments.publish` / `setLifecycle` | Owning `TEACHER` | Assessment ID and action | Lifecycle state | An assessment must contain question content before publication. |
| `assessments.assign` | Owning `TEACHER` | Assessment ID and student IDs | Created and existing assignment counters | Each Student must be active and teacher-owned. |
| `attempts.start` | Assigned `STUDENT` | Assessment ID and test code when required | Attempt ID and server expiry | Checks account, assignment, schedule, code, max attempts, and active attempt state. |
| `attempts.questions` / `saveAnswer` | Attempt-owning `STUDENT` | Attempt ID and, for saves, validated question/option choice | Student-safe questions or autosave time | Correct answer keys are never included in Student responses. |
| `attempts.recordViolation` / `submit` | Attempt-owning `STUDENT` | Attempt ID and allowed integrity event, or no event for submit | Violation state or scored result | Time, score, violation count, and auto-submit decision are server authority. |
| `attempts.myResults` / `assessments.teacherResults` | Student / owning Teacher | None | Role-safe result history | Results remain tenant and relationship scoped. |

## Security-relevant errors

The procedures use typed error codes. High-value client states include `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `NOT_FOUND`, `PRECONDITION_FAILED`, `INVALID_ACCESS_CODE`, `NOT_ASSIGNED_TO_TEST`, `ATTEMPT_ALREADY_IN_PROGRESS`, `MAX_ATTEMPTS_REACHED`, and `ATTEMPT_EXPIRED`. Clients should display a safe message and never infer data about another institution from an error response.
