import { randomUUID } from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
import { createOfflineAgentDependencies } from '../evaluation/onboarding-agent.evaluation';
import { HcmIntentType } from '../enums/hcm-agent.enum';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import { OnboardingReviewAction } from '../enums/onboarding.enum';
import type { HcmAgentGraphDependencies } from '../types/hcm-agent-graph-dependencies';
import type { HcmAgentExecutionContext } from '../types/hcm-agent-execution-context';
import type { HcmIntent } from '../types/hcm-intent';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';

export type StudioScenario = 'review' | 'notification' | 'leave';

export type StudioGraphDefinition = {
  dependencies: HcmAgentGraphDependencies;
  input: OnboardingInvocationInput & { threadId: string };
  intent: HcmIntent;
  runId: string;
};

const supportedIntent: Extract<HcmIntent, { intent: HcmIntentType.OnboardingReview }> = {
  intent: HcmIntentType.OnboardingReview,
  employeeCode: 'EMP-201',
  thresholdDays: 30,
  requestedAction: OnboardingReviewAction.ReviewOnly,
  missingFields: [],
};

function scenarioInput(scenario: StudioScenario): {
  query: string;
  actorEmployeeCode: string;
  intent: HcmIntent;
} {
  switch (scenario) {
    case 'notification':
      return {
        query: 'Review EMP-201 onboarding status and notify the manager.',
        actorEmployeeCode: 'EMP-200',
        intent: {
          ...supportedIntent,
          requestedAction: OnboardingReviewAction.NotifyManager,
        },
      };
    case 'review':
      return {
        query: 'Review EMP-201 onboarding status.',
        actorEmployeeCode: 'EMP-200',
        intent: supportedIntent,
      };
    case 'leave':
      return {
        query: 'Request annual leave for me from 2026-08-17 to 2026-08-21.',
        actorEmployeeCode: 'EMP-201',
        intent: {
          intent: HcmIntentType.LeaveRequest,
          employeeCode: 'EMP-201',
          thresholdDays: null,
          requestedAction: null,
          leaveStartDate: '2026-08-17',
          leaveEndDate: '2026-08-21',
          missingFields: [],
        },
      };
  }
}

export function createStudioScenario(scenario: StudioScenario): StudioGraphDefinition {
  const selected = scenarioInput(scenario);
  const threadId = randomUUID();
  const runId = randomUUID();
  const dependencies: HcmAgentGraphDependencies = {
    ...createOfflineAgentDependencies(selected.intent),
    leaves: {
      findAnnualPolicy: async () => ({
        id: 'studio-annual-policy',
        code: 'ANNUAL',
        name: 'Annual Leave',
        annualAllowanceDays: 20,
        minimumNoticeWorkingDays: 3,
        maximumConsecutiveWorkingDays: 10,
        workWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        excludesHolidays: false,
      }),
      findAnnualBalance: async (employeeCode, year) => ({
        employeeId: 'studio-employee-201',
        employeeCode,
        policyCode: 'ANNUAL',
        year,
        allocatedDays: 20,
        usedDays: 2,
        pendingDays: 0,
      }),
    },
    leaveApprovals: {
      resolveEmployeeCodeById: async () => 'EMP-201',
      findSubmittedByThreadId: async () => undefined,
      submit: async (input) => ({
        status: 'SUBMITTED',
        proposal: {
          leaveType: 'ANNUAL',
          startDate: input.pending.startDate,
          endDate: input.pending.endDate,
          requestedWorkingDays: input.pending.requestedWorkingDays,
          noticeWorkingDays: 3,
          availableDays: 18,
          eligible: true,
          reasons: [],
        },
        request: {
          id: 'studio-leave-request',
          employeeCode: input.employeeCode,
          status: 'SUBMITTED',
          documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
        },
      }),
    },
    checkpointer: new MemorySaver(),
    threadOwnership: {
      resolveCanonicalOwner: async (employeeCode) => ({
        employeeCode,
        bindingId: `studio-${employeeCode}`,
      }),
      findOwnerEmployeeCodeByThreadId: async () => undefined,
    },
  };

  return {
    dependencies,
    runId,
    intent: selected.intent,
    input: {
      kind: 'USER_QUERY',
      query: selected.query,
      actorEmployeeCode: selected.actorEmployeeCode,
      threadId,
      correlationId: randomUUID(),
      runId,
      triggerType: 'HTTP',
    },
  };
}

export function createStudioExecutionContext(
  definition: StudioGraphDefinition,
): HcmAgentExecutionContext {
  return {
    input: definition.input,
    runId: definition.runId,
    intent: definition.intent,
    actionPerformed: false,
    steps: [],
    securityEvents: [],
  };
}
