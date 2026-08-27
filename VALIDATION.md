# Validation Record

## Automated checks

The final local validation completed with the following commands.

| Command | Result |
|---|---|
| `pnpm check` | Passed with TypeScript compilation checks. |
| `pnpm test` | Passed: 9 test files and 25 assertions, with 3 live-Atlas integration assertions intentionally skipped in the regular unit run. |
| `RUN_MONGO_INTEGRATION=true pnpm vitest run server/mongo.constraints.integration.test.ts` | Passed: live Atlas verification of institution-scoped credential uniqueness and partial active-attempt uniqueness, with temporary test collections cleaned up afterward. |
| `pnpm build` | Passed: React client and Node server bundles were produced. |

## Covered critical behaviors

| Workflow | Coverage |
|---|---|
| Role and tenant boundaries | Shared authorization guard tests and route-level people-management success/rejection cases. |
| Student import | Column normalization, formula neutralization, and duplicate-detection tests. |
| Assessment administration | Publish validation, draft update, archive, unpublish, and access-code enable/disable/revoke/regenerate cases. |
| Assessment outcomes | Positive/negative marking, server expiry calculation, and score calculation tests. |
| Attempt safety | Assignment eligibility, access-code validation, duplicate active-attempt rejection, expiry closure, and persisted scoring. |
| Integrity enforcement | Threshold policy and the `recordViolation` mutation's threshold-triggered auto-submit path. |

## Visual checks

The public/authenticated entry view, secure assessment gateway, teacher import page, Super Admin command center, role-access boundary view, and Student dashboard were captured at desktop and mobile dimensions. The new public **institution entry**, **role-selecting login**, and **controlled account-creation guidance** pages were also reviewed at desktop and mobile dimensions. The interface uses the requested deep-blue technical grid, CAD-like frames, high-contrast type, and responsive tabular fallback.

Direct browser navigation to the protected Super Admin route without a session produced the intended **session-required** response. The managed preview's authenticated owner context rendered the Super Admin command center, while automated procedure tests exercised role-sensitive success and rejection paths without requiring test accounts to be inserted into the production-connected database.

## Remaining acceptance step

The managed workspace contained an authenticated Super Admin owner session for visual inspection. A production administrator should still perform a manual acceptance pass with separately provisioned Admin, Teacher, and Student accounts. This verifies real account switching, file selection, import confirmation, assignment delivery, assessment completion, result export, and audit visibility with production policy settings.
