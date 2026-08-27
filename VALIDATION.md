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

## Excel extraction and anti-cheat verification

The roster preview now exposes the extracted name, email, generated username, student ID/USN, branch, semester, section, and class fields, so a teacher can verify the actual mapping before confirmation instead of seeing only a name and one identity column. The existing title-row/header alias parser regression remains active for XLSX workbooks.

The student attempt route captures configured visibility changes, window blur, fullscreen exit, copy/paste/cut, context-menu, and shortcut events. Client reporting now deduplicates paired `visibilitychange` and `blur` events from one browser action. The server maps each event to the configured policy and ignores disabled event types; enabled violations are persisted, counted atomically, audited, and can trigger threshold auto-submit. A visible **Enter fullscreen** control was added for browsers that reject automatic fullscreen without a user gesture.

Validation passed with 15 test files, 37 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks. The anti-cheat helper, server policy mapping, threshold behavior, and Excel parser all have regression coverage. Manual acceptance still requires a real Teacher upload and Student attempt using private institution credentials.

## Expanded import and anti-cheat regression evidence

The Excel parser now has coverage for a title row with blank rows, blank-leading columns, typed numeric identifiers, several preamble rows, alternate Forms-style aliases, and a workbook with no recognizable roster header. Normalized academic fields are passed through a shared `importAcademicFields` contract used by both existing-student updates and new-student profile creation, covering student ID, USN, branch, semester, section, and class.

Anti-cheat coverage now includes client deduplication of paired tab-hidden/window-blur events, preservation of distinct clipboard and shortcut events, server mapping from browser event types to assessment policy switches, threshold auto-submit behavior, and disabled-event suppression. The live attempt UI provides a user-gesture fullscreen control when browser policy blocks automatic fullscreen.

The full validation run passed with 15 test files, 41 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks. A real Teacher upload and Student attempt remain recommended manual acceptance checks because they require private institution credentials and a real browser event environment.

## Repeatable MCQ authoring and published-test availability

The Teacher assessment studio now maintains a repeatable question list. Teachers can add or remove question blocks, enter four options for each question, choose the correct option independently, and submit the complete list in one validated assessment payload. The server continues to enforce a maximum of 100 questions per assessment, so “as many as needed” is supported within the documented safety limit.

New assessments created from the Teacher studio now start immediately by default and remain active for 90 minutes, removing the previous hidden five-minute wait that made newly published tests appear as UPCOMING. Student status labels are centralized and tested as UPCOMING, AVAILABLE, or EXPIRED; the secure gateway remains available only for assigned, published assessments whose current time is within the configured window. Existing assessments that are already UPCOMING or EXPIRED retain those states and must be recreated or rescheduled through the Teacher workflow.

Validation passed with 16 test files, 43 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks.

## Repeatable questions and Student opening states

The Teacher authoring form now supports repeatable question blocks with add/remove controls and four answer options per question. The client transformation preserves every question in the submitted payload, while the server accepts up to 100 validated questions per assessment.

New Teacher-created assessments start immediately by default for a 90-minute active window, so a Student who is assigned the published test can open it without waiting through a hidden delay. Existing upcoming or expired records remain correctly closed. Student cards now show explicit `ASSIGNED`, `UPCOMING`, `AVAILABLE`, `EXPIRED`, and `ACCESS CODE REQUIRED` states with state-specific messaging and only render the secure-gateway link when the assessment is active.

The final validation passed with 17 test files, 45 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks.

## Completed assessment state and violation warnings

The Student dashboard now joins assigned assessments with the student’s own result records by assessment ID. Submitted, auto-submitted, and expired scored attempts are shown on the corresponding assessment card as `COMPLETED`, with explanatory text that the attempt was submitted and scored. The result-history table remains available for detailed score and integrity counts.

During a live attempt, every server-recorded integrity violation now triggers an immediate warning toast naming the event and current violation count. Reaching the configured threshold changes the feedback to an auto-submit warning and transitions the attempt to the recorded result screen. Warning formatting and deduplicated event behavior are covered by client tests; server threshold and policy enforcement remain covered by attempt tests.

The full validation passed with 17 test files, 46 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks. Manual confirmation with a real Student account and browser actions remains recommended.

## Completed state and per-violation feedback

Student assessment cards now join assigned assessments with result records by assessment ID. A submitted, auto-submitted, or expired scored attempt is displayed as `COMPLETED` with a non-startable `View result history` state. During a live attempt, each accepted anti-cheat event immediately produces a warning naming the event and current count; reaching the configured threshold produces an auto-submit warning and transitions to the recorded result screen.

The final validation passed with 17 test files, 47 passing assertions, and 3 intentionally skipped live-Atlas assertions, plus TypeScript and production build checks. Direct regression coverage now includes the submitted-result join and completed card presentation.

## Draft editing, scoped deletion, and Teacher layout

Draft assessment rows now expose **Edit** and **Delete** actions. Edit is intentionally unavailable after publication; draft edits replace the validated question set and preserve or update access-code settings. Published assessment removal is presented as **Archive** so result and audit history are retained. Admin faculty rows, Teacher student rows, and the Super Admin institution registry now expose confirmed **Delete** actions that disable/archive records within server-enforced tenant scope.

The Teacher two-column studio uses an `items-start` grid and an independently scrollable question-editor panel with a viewport-relative maximum height. With many question blocks, the editor scrolls inside its panel instead of increasing the neighboring student-directory height. Route-level regression coverage in `server/lms/removalRouter.test.ts` verifies institution, teacher, student, and assessment removal success paths, scope rejection, and principal side effects. `server/lms/assessmentActions.test.ts` verifies draft-only editability and delete-versus-archive policy.

Validation passed `pnpm check`, 18 test files with 49 passing assertions and 3 intentionally skipped live-Atlas assertions, and `pnpm build`. The protected Teacher route requires an authenticated Teacher session for visual inspection; the anonymous capture correctly renders the session-required boundary.

## Draft editing, delete/archive controls, and responsive Teacher studio

Draft assessment rows now expose **Edit** and **Delete** actions; published rows do not expose Edit and use **Archive** for removal so scored attempts and audit history are retained. Draft edits replace the validated question set and persist access-code settings. Admin faculty rows, Teacher student rows, and the Super Admin institution registry expose confirmed destructive actions whose server procedures remain tenant-scoped.

The Teacher workspace uses an `items-start` two-column grid and an independently scrollable question-editor panel with a viewport-relative maximum height. With many questions, the editor scrolls within its panel while the adjacent student directory remains at its natural height. The protected route requires a Teacher session for visual acceptance; anonymous capture correctly shows the session boundary.

`server/lms/removalRouter.test.ts` now covers eight route-level cases: successful teacher, student, assessment, and institution removal behavior; teacher, student, and assessment scope rejection; and institution not-found rejection. `server/lms/assessmentActions.test.ts` covers draft-only editability and delete-versus-archive policy.

Final validation passed `pnpm check`, `pnpm test` with 19 test files and 57 passing assertions plus 3 intentionally skipped live-Atlas assertions, and `pnpm build`.

## Anti-cheat warning visibility repair

The Student assessment route now renders a persistent, accessible warning banner after every server-accepted integrity event. The banner is placed directly above the question set and reports the event type, current violation count, configured threshold, and whether the attempt was auto-submitted. The auto-submission result view retains the same warning context instead of relying only on a transient toast. Toast notifications remain enabled as an immediate secondary signal.

During investigation, the managed preview network log showed successful `attempts.recordViolation` responses with HTTP 200 and the expected `violationCount`, `autoSubmitted`, and `result` fields. The missing user-visible signal was therefore addressed in the client presentation layer. The anti-cheat helper regression suite remains green, and the full validation run passed with 19 test files, 57 passing assertions, 3 intentionally skipped live-Atlas assertions, TypeScript checks, and a production build. A connected Student retest is still required to verify the visible banner and threshold auto-submit in the user’s browser event environment.

## Focused anti-cheat warning-banner regression

A dedicated `client/src/pages/TakeAssessment.test.ts` regression now server-renders the warning banner for both a normal recorded violation and a threshold auto-submit. It verifies the assertive accessibility attributes, event label, human-readable warning, and count/threshold indicator, including the retained auto-submit message.

The corrected final validation passed `pnpm vitest run client/src/pages/TakeAssessment.test.ts`, `pnpm check`, `pnpm test`, and `pnpm build`: 20 test files, 59 passing assertions, 3 intentionally skipped live-Atlas assertions, and a successful production bundle. A connected Student retest remains necessary to observe the banner after a real browser event and to confirm the complete threshold flow in the user’s session.
