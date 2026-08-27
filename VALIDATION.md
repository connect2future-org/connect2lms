# Validation Record

## Automated checks

The final local validation completed with the following commands.

| Command | Result |
|---|---|
| `pnpm check` | Passed with TypeScript compilation checks. |
| `pnpm test` | Passed: 13 test files and 31 assertions, with 3 live-Atlas integration assertions intentionally skipped in the regular unit run. |
| `RUN_MONGO_INTEGRATION=true pnpm vitest run server/mongo.constraints.integration.test.ts` | Passed: live Atlas verification of institution-scoped credential uniqueness and partial active-attempt uniqueness, with temporary test collections cleaned up afterward. |
| `pnpm build` | Passed: React client and Node server bundles were produced. |

## Covered critical behaviors

| Workflow | Coverage |
|---|---|
| Role and tenant boundaries | Shared authorization guard tests and route-level people-management success/rejection cases. |
| Student import | Client Excel title-row/header detection, common alias parsing, column normalization, formula neutralization, and duplicate-detection tests. |
| Assessment administration | Concise MCQ prompt validation, four-option Teacher authoring, publish validation, automatic active-student assignment, draft update, archive, unpublish, and access-code enable/disable/revoke/regenerate cases. |
| Assessment outcomes | Positive/negative marking, server expiry calculation, and score calculation tests. |
| Attempt safety | Assignment eligibility, access-code validation, duplicate active-attempt rejection, expiry closure, and persisted scoring. |
| Integrity enforcement | Threshold policy and the `recordViolation` mutation's threshold-triggered auto-submit path. |

## Visual checks

The public/authenticated entry view, secure assessment gateway, teacher import page, Super Admin command center, role-access boundary view, and Student dashboard were captured at desktop and mobile dimensions. The new public **institution entry**, **role-selecting login**, and **controlled account-creation guidance** pages were also reviewed at desktop and mobile dimensions. The interface uses the requested deep-blue technical grid, CAD-like frames, high-contrast type, and responsive tabular fallback.

Direct browser navigation to the protected Super Admin route without a session produced the intended **session-required** response. The managed preview's authenticated owner context rendered the Super Admin command center, while automated procedure tests exercised role-sensitive success and rejection paths without requiring test accounts to be inserted into the production-connected database.

## Remaining acceptance step

The managed workspace contained an authenticated Super Admin owner session for visual inspection. A production administrator should still perform a manual acceptance pass with separately provisioned Admin, Teacher, and Student accounts. This verifies real account switching, file selection, import confirmation, assignment delivery, assessment completion, result export, and audit visibility with production policy settings.

## Teacher workflow repair validation

The Teacher authoring flow now accepts concise non-empty question text, renders and submits four required MCQ options, and allows A–D as the correct answer. Publishing automatically creates institution- and teacher-scoped assignments for active students already managed by that Teacher; the existing explicit assignment action remains available for students added later. Excel parsing now detects the actual header row, preserves typed cell values as strings, and supports common roster aliases including email ID, registration number, department, and separate first/last-name columns.

The latest automated run passed `pnpm check`, all regular tests (12 files, 30 assertions), and `pnpm build`. The credential-session context tests also confirm that a Teacher/Admin/Student session is preferred over a Super Admin fallback and that a missing credential session does not silently authorize the owner. The live browser acceptance step remains: refresh the preview, sign in with an issued Teacher account, create/publish a test, and confirm it appears in the assigned Student account; upload an Excel roster and confirm its preview rows before confirmation.

## Super Admin recovery validation

The role boundary now provides a dedicated **Switch to Super Admin sign-in** action when an institution session is active on the Super Admin route. It clears the institution-session mode and preview bearer token before starting the owner-only OAuth flow. This prevents a stale Admin or Teacher identity from blocking the owner workspace while preserving server-side role checks.

The latest validation passed `pnpm check`, `pnpm test` with 13 test files and 31 assertions (3 live-Atlas assertions intentionally skipped), and `pnpm build`.

## Dedicated Super Admin authentication and routing

Super Admin access now uses the managed `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` secrets through `/super-admin/login`; the Google/OAuth owner fallback is no longer used by the application request context. A successful owner login issues the same signed application session format, but only with the `SUPER_ADMIN` role. Institution credentials cannot call the owner procedure. Direct navigation to `/super-admin/login`, `/super-admin`, `/admin`, `/teacher`, and `/student` is registered in the client router, and the public home page includes a dedicated **Platform owner sign in** entry point.

The dedicated owner secret health check, owner-login session round trip, role-context checks, all regular tests (14 files, 33 assertions), TypeScript check, and production build passed. Actual owner credential submission in the browser remains a manual acceptance action because it requires the private managed secret.

## Owner password compatibility correction

The dedicated owner form and `auth.ownerLogin` procedure now accept the configured nine-character owner secret while retaining an eight-character minimum. The Super Admin dashboard separately gates its registry and metrics queries until `auth.me` confirms `SUPER_ADMIN`, preventing transient 403 requests while a session is loading or belongs to an institution role. The full validation run passed with 14 test files, 33 assertions, TypeScript checks, and a production build.

## Final owner-login blocker resolution

The reported nine-character owner password is now accepted by both the browser form and server procedure with an eight-character minimum. The Super Admin registry metrics, institution list, and audit trail queries are disabled until the current identity is confirmed as `SUPER_ADMIN`, removing premature role-permission requests during authentication resolution. A dedicated regression now also verifies that institution credentials are rejected by `auth.ownerLogin`.

Final automated validation passed: `pnpm check`; `pnpm test` with 14 test files, 34 passing assertions, and 3 intentionally skipped live-Atlas assertions; and `pnpm build`. Direct route rendering was verified for the owner login and protected workspace paths. Manual owner credential submission remains the final acceptance step because the private password is not available to the browser verification process.
