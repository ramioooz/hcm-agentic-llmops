import { randomUUID } from 'node:crypto';
import { buildInvocationResult } from '../helpers/onboarding-agent.helpers';
import { assertEmployeeReadAccess } from '../security/authorization';
import { enforceIntentConsistency } from '../security/intent-consistency';
import { redactSensitiveData } from '../security/pii-redaction';
import { evaluateRequestSafety } from '../security/request-safety';
import type { AgentInvocationRecord } from '../types/agent-invocation-record';
import type { AgentRunRecorder } from '../types/agent-run-recorder';
import type { AgentRunStepRecord } from '../types/agent-run-step-record';
import type { Clock } from '../types/clock';
import type { EmployeeReader } from '../types/employee-reader';
import type { HcmIntent } from '../types/hcm-intent';
import type { HcmIntentNormalizer } from '../types/hcm-intent-normalizer';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import type { SecurityEventRecord } from '../types/security-event-record';
import { evaluateOnboardingReview } from '../workflows/onboarding/evaluate-onboarding-review';

export class OnboardingAgentService {
  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      clock: Clock;
      recorder: AgentRunRecorder;
      normalizer: HcmIntentNormalizer;
    },
  ) {}

  public async invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult> {
    const runId = randomUUID();
    const safety = evaluateRequestSafety(input.query);

    if (!safety.isSafe) {
      return this.completeInvocation(
        input,
        runId,
        undefined,
        [
          {
            stepName: 'request_guard',
            status: 'REJECTED',
            outcomeCode: 'UNSAFE_REQUEST_REJECTED',
            inputData: { reasonCode: safety.reasonCode },
          },
        ],
        [
          {
            eventType: 'UNSAFE_REQUEST_REJECTED',
            severity: 'HIGH',
            details: { reasonCode: safety.reasonCode },
          },
        ],
        buildInvocationResult(403, {
          status: 'FAILED',
          code: 'UNSAFE_REQUEST_REJECTED',
          message: 'The request was rejected because it contains unsafe instructions.',
          runId,
          correlationId: input.correlationId,
        }),
        safety.reasonCode,
      );
    }

    let request: HcmIntent;
    try {
      request = await this.dependencies.normalizer.normalize(input.query);
    } catch {
      return this.completeInvocation(
        input,
        runId,
        undefined,
        [
          {
            stepName: 'intent_normalization',
            status: 'FAILED',
            outcomeCode: 'MODEL_UNAVAILABLE',
          },
        ],
        [],
        buildInvocationResult(503, {
          status: 'FAILED',
          code: 'MODEL_UNAVAILABLE',
          message: 'The request could not be interpreted at this time.',
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    request = enforceIntentConsistency(input.query, request);

    const requestStep: AgentRunStepRecord = {
      stepName: 'intent_normalization',
      status: request.intent === 'ONBOARDING_REVIEW' ? 'COMPLETED' : 'REJECTED',
      outcomeCode:
        request.intent === 'ONBOARDING_REVIEW' ? 'INTENT_NORMALIZED' : 'UNSUPPORTED_REQUEST',
      inputData: {
        intent: request.intent,
        employeeCode: request.employeeCode,
        thresholdDays: request.thresholdDays,
        requestedAction: request.requestedAction,
        missingFields: request.missingFields,
      },
    };
    const steps: AgentRunStepRecord[] = [requestStep];
    const securityEvents: SecurityEventRecord[] = [];

    if (request.intent === 'UNSUPPORTED') {
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(200, {
          status: 'UNSUPPORTED_REQUEST',
          message: 'That request is outside the capabilities of this HCM agent.',
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    if (!request.employeeCode) {
      requestStep.outcomeCode = 'EMPLOYEE_ID_REQUIRED';
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(200, {
          status: 'NEED_MORE_INFORMATION',
          message: 'Please provide the employee ID.',
          missingFields: ['employeeId'],
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    const employee = await this.dependencies.employees.findByEmployeeCode(request.employeeCode);
    steps.push({
      stepName: 'employee_lookup',
      status: employee ? 'COMPLETED' : 'FAILED',
      outcomeCode: employee ? 'EMPLOYEE_FOUND' : 'EMPLOYEE_NOT_FOUND',
      inputData: { employeeCode: request.employeeCode },
    });

    if (!employee) {
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(404, {
          status: 'FAILED',
          code: 'EMPLOYEE_NOT_FOUND',
          message: `Employee ${request.employeeCode} was not found.`,
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    try {
      assertEmployeeReadAccess({
        actorRole: input.actorRole,
        actorEmployeeId: input.actorEmployeeCode,
        targetEmployeeId: employee.employeeCode,
        targetManagerEmployeeId: employee.managerEmployeeCode,
      });
      steps.push({
        stepName: 'authorization',
        status: 'COMPLETED',
        outcomeCode: 'AUTHORIZED',
        inputData: {
          actorRole: input.actorRole,
          targetEmployeeCode: employee.employeeCode,
        },
      });
    } catch {
      steps.push({
        stepName: 'authorization',
        status: 'FAILED',
        outcomeCode: 'AUTHORIZATION_DENIED',
      });
      securityEvents.push({
        eventType: 'AUTHORIZATION_DENIED',
        severity: 'MEDIUM',
        details: {
          actorRole: input.actorRole,
          targetEmployeeCode: employee.employeeCode,
        },
      });
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(403, {
          status: 'FAILED',
          code: 'AUTHORIZATION_DENIED',
          message: 'You are not authorized to perform this operation.',
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    if (employee.status !== 'ACTIVE') {
      steps.push({
        stepName: 'employee_state_validation',
        status: 'FAILED',
        outcomeCode: 'EMPLOYEE_INACTIVE',
      });
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(409, {
          status: 'FAILED',
          code: 'EMPLOYEE_INACTIVE',
          message: 'The employee is not active.',
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    if (!employee.activeReviewPeriod) {
      steps.push({
        stepName: 'employee_state_validation',
        status: 'FAILED',
        outcomeCode: 'ONBOARDING_REVIEW_NOT_FOUND',
      });
      return this.completeInvocation(
        input,
        runId,
        request,
        steps,
        securityEvents,
        buildInvocationResult(404, {
          status: 'FAILED',
          code: 'ONBOARDING_REVIEW_NOT_FOUND',
          message: 'The employee does not have an active onboarding review period.',
          runId,
          correlationId: input.correlationId,
        }),
      );
    }

    const review = evaluateOnboardingReview({
      reviewEndDate: employee.activeReviewPeriod.endDate,
      today: this.dependencies.clock.today(),
      thresholdDays: request.thresholdDays ?? 30,
      requestedAction: request.requestedAction ?? 'REVIEW_ONLY',
    });

    steps.push({
      stepName: 'onboarding_review',
      status: 'COMPLETED',
      outcomeCode: 'REVIEW_EVALUATED',
      inputData: {
        employeeCode: employee.employeeCode,
        reviewEndDate: employee.activeReviewPeriod.endDate,
        thresholdDays: request.thresholdDays,
        requestedAction: request.requestedAction,
      },
      outputData: review,
    });

    return this.completeInvocation(
      input,
      runId,
      request,
      steps,
      securityEvents,
      buildInvocationResult(200, {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        runId,
        correlationId: input.correlationId,
        data: {
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          reviewEndDate: employee.activeReviewPeriod.endDate,
          daysRemaining: review.daysRemaining,
          withinThreshold: review.withinThreshold,
          action: review.action,
          actionPerformed: false,
          ...(review.action === 'NOTIFY_MANAGER'
            ? { actionReason: 'NOTIFICATION_PROVIDER_NOT_CONFIGURED' }
            : {}),
        },
      }),
    );
  }

  private async completeInvocation(
    input: OnboardingInvocationInput,
    runId: string,
    request: HcmIntent | undefined,
    steps: AgentRunStepRecord[],
    securityEvents: SecurityEventRecord[],
    result: OnboardingInvocationResult,
    rejectedReasonCode?: string,
  ): Promise<OnboardingInvocationResult> {
    const record: AgentInvocationRecord = {
      runId,
      correlationId: input.correlationId,
      triggerType: 'HTTP',
      actorEmployeeCode: input.actorEmployeeCode,
      intent: request?.intent === 'ONBOARDING_REVIEW' ? 'ONBOARDING_REVIEW' : undefined,
      requestSummary: request
        ? redactSensitiveData({
            intent: request.intent,
            employeeCode: request.employeeCode,
            thresholdDays: request.thresholdDays,
            requestedAction: request.requestedAction,
            missingFields: request.missingFields,
          })
        : { rejectedReasonCode },
      status: this.toRunStatus(result),
      resultSummary: redactSensitiveData(result.body),
      steps: steps.map((step) => ({
        ...step,
        inputData: step.inputData ? redactSensitiveData(step.inputData) : undefined,
        outputData: step.outputData ? redactSensitiveData(step.outputData) : undefined,
      })),
      securityEvents: securityEvents.map((event) => ({
        ...event,
        details: event.details ? redactSensitiveData(event.details) : undefined,
      })),
    };

    try {
      await this.dependencies.recorder.recordInvocation(record);
      return result;
    } catch {
      return buildInvocationResult(500, {
        status: 'FAILED',
        code: 'INTERNAL_ERROR',
        message: 'The workflow could not be completed.',
        runId,
        correlationId: input.correlationId,
      });
    }
  }

  private toRunStatus(result: OnboardingInvocationResult): AgentInvocationRecord['status'] {
    if (result.body.status === 'COMPLETED') {
      return 'SUCCEEDED';
    }

    if (
      result.body.status === 'UNSUPPORTED_REQUEST' ||
      result.body.status === 'NEED_MORE_INFORMATION' ||
      result.body.code === 'UNSAFE_REQUEST_REJECTED'
    ) {
      return 'REJECTED';
    }

    return 'FAILED';
  }
}
