import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { AgentRunRecorder } from './agent-run-recorder';
import type { AgentTraceRecorder } from './agent-trace-recorder';
import type { Clock } from './clock';
import type { EmployeeReader } from './employee-reader';
import type { HcmIntentNormalizer } from './hcm-intent-normalizer';
import type { LeaveApprovalWorkflow } from './leave-approval-workflow';
import type { LeaveReader } from './leave-reader';
import type { ManagerNotificationSender } from './manager-notification-sender';
import type { ThreadOwnershipReader } from './thread-ownership-reader';

export type HcmAgentGraphDependencies = {
  employees: EmployeeReader;
  clock: Clock;
  recorder: AgentRunRecorder;
  normalizer: HcmIntentNormalizer;
  notifications: ManagerNotificationSender;
  checkpointer: BaseCheckpointSaver;
  threadOwnership: ThreadOwnershipReader;
  traceRecorder?: AgentTraceRecorder;
  configuredModel?: string;
  leaves?: LeaveReader;
  leaveApprovals?: LeaveApprovalWorkflow;
};
