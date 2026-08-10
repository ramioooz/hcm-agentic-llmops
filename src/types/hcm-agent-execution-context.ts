import type { AgentRunStepRecord } from './agent-run-step-record';
import type { AuthorizedEmployeeLookup } from './authorized-employee-lookup';
import type { HcmIntent } from './hcm-intent';
import type { LeaveApprovalProposal } from './leave-approval-proposal';
import type { LeaveBalanceRecord } from './leave-balance-record';
import type { LeavePolicyRecord } from './leave-policy-record';
import type { OnboardingInvocationInput } from './onboarding-invocation-input';
import type { OnboardingInvocationResult } from './onboarding-invocation-result';
import type { OnboardingReviewAction } from './onboarding-review-action';
import type { OnboardingReviewResult } from './onboarding-review-result';
import type { SecurityEventRecord } from './security-event-record';

export type HcmAgentExecutionContext = {
  input: OnboardingInvocationInput & { threadId: string };
  runId: string;
  intent?: HcmIntent;
  lookup?: AuthorizedEmployeeLookup;
  review?: OnboardingReviewResult & { action: OnboardingReviewAction };
  leavePolicy?: LeavePolicyRecord;
  leaveBalance?: LeaveBalanceRecord;
  leaveApproval?: LeaveApprovalProposal;
  actionPerformed: boolean;
  actionReason?: string;
  result?: OnboardingInvocationResult;
  steps: AgentRunStepRecord[];
  securityEvents: SecurityEventRecord[];
};
