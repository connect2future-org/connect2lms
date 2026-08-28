# Scratch Manual QA

## Pass 1: public entry and institution login

The public landing page loaded at `/` with working links for institution login, account-access guidance, and dedicated Platform owner sign-in. The landing copy correctly states that public registration is disabled.

The institution login at `/login` loaded correctly with role selectors for Institution Admin, Teacher, and Student, plus institution code, username/USN/roll number, password, and secure sign-in controls. Direct navigation from `/` to `/login` worked. The browser preview footer indicates Preview mode and that the page is not publicly shareable until published; this is managed preview chrome, not an application defect.

No application edge case was observed in these first two routes. The automated browser annotation overlay and managed preview warnings are not part of the application UI.

## Pass 2: controlled signup and owner login

The `/signup` route loaded as guidance-only. It has no public account-creation form and clearly explains that Admin accounts are issued by the platform owner, Teachers by an institution Admin, and Students by a Teacher. The issued-credentials link returned to `/login` correctly.

The `/super-admin/login` route loaded directly and contains only owner email and owner password fields plus an owner-only registry action. Its copy explicitly rejects institution Admin, Teacher, and Student credentials and gives the eight-character minimum. No Google/OAuth sign-in control or public owner registration control was present.

No application edge case was observed in these routes. The browser annotation overlay is test instrumentation and not application content.

## Pass 3: protected route boundaries

Direct `/super-admin` navigation resolved to a dedicated **SESSION REQUIRED** boundary with a **Sign in as Super Admin** action; it did not expose registry content anonymously. Direct `/admin` navigation resolved to a **SESSION REQUIRED** boundary with a return-to-sign-in action and did not expose institution data. Both routes preserved their intended path instead of falling back to a 404 or public content.

The owner route’s dedicated action is distinct from the institution return link, which preserves the role boundary. No application edge case was observed in these anonymous protected-route checks.

## Pass 4: Teacher and Student protected routes

Direct `/teacher` navigation from a clean browser state resolved to the intended **SESSION REQUIRED** boundary and exposed no roster or assessment data. Direct `/student` navigation resolved to the Student assessment console route rather than a 404 or home page, but its records panel displayed **Loading secure assessment records…** without an authenticated Student session. Because the Student route did not show a session-required boundary consistently, this is a candidate edge case for review: the shell should avoid presenting a role workspace while `auth.me` is unresolved or unauthenticated.

## Pass 5: protected-route gating repair

After wrapping the Student dashboard and Teacher import page in `BlueprintShell`, direct `/student` navigation now resolves to **SESSION REQUIRED** and no longer starts protected assessment queries anonymously. Direct `/teacher/import` also resolves to **SESSION REQUIRED** and does not expose the roster import panel or mutation controls without a Teacher session.

The Student assessment-taking component was also wrapped in the Student shell so a guessed `/student/assessment/:assessmentId` URL cannot expose the access gateway or attempt mutations before authentication is confirmed. TypeScript validation passed after these changes.

## Pass 6: assessment URL protection and invalid routes

Direct `/student/assessment/1` navigation now resolves to **SESSION REQUIRED**, confirming that the access-code gateway and attempt mutations are not exposed to anonymous users. An invalid path such as `/does-not-exist` resolves to a clear 404 page with a working **Go Home** action. No edge case was observed in these route checks.

## Pass 7: recovery action

The 404 page's **Go Home** action returned to the public landing page and restored the expected login, account-guidance, and owner-sign-in links. No navigation dead end was observed.

The main reproducible edge case found during the scratch pass was inconsistent authentication gating on `/student`, `/teacher/import`, and `/student/assessment/:assessmentId`. Those routes have now been wrapped in the correct shared role shell and were rechecked anonymously; each resolves to **SESSION REQUIRED** before protected queries or mutations run.

## Pass 8: protected-route edge-case repair

The scratch pass found that `/student`, `/teacher/import`, and `/student/assessment/:assessmentId` could render loading or protected workflow content before `auth.me` finished resolving because those pages bypassed the shared shell. The pages now use `BlueprintShell` with the correct role, so anonymous direct navigation stops at **SESSION REQUIRED** before assessment queries, roster mutations, or attempt mutations run.

The final non-credentialed QA pass covered public landing, login, controlled signup, dedicated owner login, all direct protected role paths, direct assessment URLs, invalid-route 404 recovery, and the repaired Teacher import route. Recent application logs showed successful anonymous `auth.me` null responses and no application exception; the observed `BadRequestError: request aborted` corresponded to a browser navigation being canceled, not a persisted server defect.

After the repair, `pnpm check`, `pnpm test`, and `pnpm build` passed: 19 test files, 57 passing assertions, 3 intentionally skipped live-Atlas assertions, and a successful production bundle. Authenticated workflow acceptance still requires the user’s connected browser session.

## Pass 9: password visibility controls

Added a reusable, masked-by-default `PasswordInput` with an accessible eye button, `aria-label`, `aria-pressed`, tooltip title, keyboard focus ring, and sufficient right padding so the control does not obscure entered text. The control is now used by the institution Admin/Teacher/Student login, dedicated Super Admin login, Super Admin institution provisioning, Admin teacher provisioning, Teacher manual student provisioning, and roster-import confirmation fields.

Desktop preview screenshots confirmed the eye control is visible and aligned on `/login` and `/super-admin/login`. `pnpm check`, `pnpm test`, and `pnpm build` pass after the change: 19 test files, 57 passing assertions, 3 intentionally skipped live-Atlas assertions, and a successful production bundle.

## Pass 10: reported missing anti-cheat warnings — investigation started

The Student assessment page currently reports accepted browser events through `createIntegrityReporter`, then calls `attempts.recordViolation` with an `onSuccess` callback that invokes `toast.warning(integrityWarningMessage(...))` for non-threshold events and `toast.error(...)` for threshold auto-submit. The global Toaster is mounted in `App`, including on the assessment route, so the warning host is present.

The client regression tests currently cover deduplication and message formatting but do not exercise the assessment page’s mutation-success callback. The server helper tests cover policy mapping and threshold calculation but do not exercise the full `recordViolation` contract. The next diagnostic step is to validate the live mutation response shape and event dispatch path, then make the warning visible in the assessment UI itself rather than relying only on transient toast feedback if necessary.

## Pass 10: anti-cheat warning repair

The reported warning gap was reproducible at the UI design level: the server accepted `attempts.recordViolation` requests with HTTP 200 responses and returned `violationCount` and `autoSubmitted`, while the Student assessment page relied only on transient Sonner toasts. The current preview session is now anonymous, so the live assessment route correctly stops at **SESSION REQUIRED** and cannot be used for a connected Student retest without browser takeover.

The Student attempt page now stores the latest accepted violation in state and renders a persistent `role="alert"` / `aria-live="assertive"` banner directly above the questions, including the violation type, current count, configured threshold, and auto-submit outcome. The same banner is retained on the auto-submission result view. Toast feedback remains as an additional immediate signal.

## Pass 11: authenticated anti-cheat acceptance — user confirmed

The user retested the Student assessment anti-cheat flow in the authenticated preview after the persistent banner repair and confirmed: **“the feature is working.”** This closes the targeted anti-cheat warning acceptance step. The implementation now provides both immediate toast feedback and a persistent in-test warning banner with event type, violation count, threshold, and auto-submit state; the threshold state remains visible on the result screen.

The broader authenticated acceptance items for Admin/Teacher/Student login, assessment lifecycle, roster import, and destructive actions remain separately tracked until the user confirms those flows.

## Teacher enhancement request — initial inspection

The current Teacher workspace combines manual student provisioning, the MCQ draft builder, the assessment register, and results in one page. Roster import is a separate protected route/component and currently accepts generic CSV/XLSX/XLS headers through the existing alias parser. Assessment creation currently publishes to all active teacher-owned students through the existing assignment mutation, while the dashboard only exposes an `Assign active` action and has no selection model. The upcoming enhancement will keep these concerns separated into compact template/import panels and a publish-target flow rather than adding more fields to every question card.

## Teacher enhancement request — server contract findings

The current assessment API already has a tenant-scoped `assign` mutation accepting a deduplicated list of active student IDs owned by the Teacher, and it rejects inactive or out-of-scope IDs. Publication itself currently changes the assessment to `PUBLISHED` and automatically assigns every active student owned by that Teacher. The existing `manageAccessCode` mutation already supports `REGENERATE`, `REVOKE`, `ENABLE`, and `DISABLE` with institution-scoped collision checks.

The roster import API accepts normalized rows with name, email, generated username, Student ID, USN, branch, semester, section, and class fields. The import parser currently supports broad aliases; the new reference template can use the canonical headers while retaining backward-compatible aliases unless the user explicitly chooses strict-template mode. Question extraction should use a separate canonical worksheet format and feed the same `toAssessmentQuestions` payload used by manual authoring.

## Teacher enhancement request — client parser findings

The client already has SheetJS and Papa Parse available. Roster XLS/XLSX parsing uses a title-row detector and the existing canonicalized alias set, while CSV parsing uses headers directly. The existing assessment transformer converts manual question drafts into four-option MCQs with A–D option IDs and one mark. The question worksheet loader can therefore normalize canonical headers such as `Question`, `Option A`, `Option B`, `Option C`, and `Correct Option` into the exact same draft shape, allowing extracted rows to fill the existing question boxes without introducing a second authoring model.

## Teacher enhancement request — student-source and publishing model

Student profiles currently contain academic identity fields but no import provenance. To enforce “publish only to students present in the Excel sheet” without relying on a UI-only filter, imported profiles will carry the confirmed import-batch ID; manually created profiles will remain unmarked. The Teacher overview will expose that provenance and the imported-student subset. The publish mutation will accept an explicit target mode and selected IDs, verify that every selected student is active, teacher-owned, institution-scoped, and imported, then create assignments only for that set. The existing all-active behavior will remain available only as an explicit target mode and will be labeled clearly in the UI.
