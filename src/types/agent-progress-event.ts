import type { InvocationBody } from './invocation-body';

export type AgentProgressEvent =
  | {
      event: 'run';
      data: { threadId: string; runId: string; correlationId: string; status: 'started' };
    }
  | {
      event: 'intent';
      data: {
        runId: string;
        status: 'normalized';
        intent: 'ONBOARDING_REVIEW' | 'UNSUPPORTED';
        requestedAction: 'REVIEW_ONLY' | 'NOTIFY_MANAGER' | null;
      };
    }
  | {
      event: 'node';
      data: {
        runId: string;
        status: 'completed' | 'failed' | 'rejected';
        node: string;
        outcomeCode: string;
      };
    }
  | {
      event: 'tool';
      data: {
        runId: string;
        status: 'completed' | 'failed' | 'skipped';
        tool: 'employee_lookup' | 'onboarding_calculation' | 'manager_notification';
        outcomeCode: string;
      };
    }
  | {
      event: 'response';
      data: {
        runId: string;
        status: 'completed';
        httpStatus: number;
        body: InvocationBody;
      };
    };
