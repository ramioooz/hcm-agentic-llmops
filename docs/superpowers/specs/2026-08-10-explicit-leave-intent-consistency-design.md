# Explicit Leave Intent Consistency Design

## Problem

The model can return a valid structured `UNSUPPORTED` result for a request that is clearly within the leave workflow. The supervisor then correctly routes that normalized value to the unsupported response. The reported request contains an explicit annual-leave action and exactly two ISO dates, but no deterministic consistency rule currently challenges a false `UNSUPPORTED` classification.

## Approved Behavior

When all of the following are true, the consistency boundary converts the normalized result to `LEAVE_REQUEST`:

- The model returned `UNSUPPORTED`.
- The query contains the affirmative phrase `request annual leave`.
- The query contains exactly two `YYYY-MM-DD` date values.

The two dates become `leaveStartDate` and `leaveEndDate` in their query order. `employeeCode`, `thresholdDays`, and `requestedAction` remain `null`, and `missingFields` is empty. The authenticated employee therefore remains the target through the existing leave workflow.

The rule does not run when the model selects onboarding or leave, when the request lacks the explicit phrase, or when the request contains fewer or more than two ISO dates. Unrelated unsupported requests remain unsupported.

## Implementation Boundary

Modify only `enforceIntentConsistency()` in `src/security/intent-consistency.ts`. Add one regression case to `tests/unit/intent-consistency.test.ts` using the exact reported query and a literal unsupported model result.

Do not change the prompt, model configuration, schema, graph, tools, policy calculation, authorization, approval behavior, API contracts, persistence, or environment configuration.

## Verification

- Watch the new regression test fail against the existing code.
- Add the minimal consistency rule and watch the test pass.
- Run the complete quality suite.
- Repeat the reported API call and confirm it reaches the leave workflow rather than the unsupported route.

## Delivery

The change belongs to task #57 under Story #6. One pull request targets `release` and closes only #57 when the change later reaches the default branch.
