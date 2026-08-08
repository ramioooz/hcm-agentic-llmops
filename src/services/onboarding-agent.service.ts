import { randomUUID } from 'node:crypto';
import {
  buildInvocationResult,
  parseOnboardingRequest,
  todayAsDateOnly,
} from '../helpers/onboarding-agent.helpers';
import { assertEmployeeReadAccess } from '../security/authorization';
import type { EmployeeReader } from '../types/employee-reader';
import type { OnboardingInvocationInput } from '../types/onboarding-invocation-input';
import type { OnboardingInvocationResult } from '../types/onboarding-invocation-result';
import { evaluateOnboardingReview } from '../workflows/onboarding/evaluate-onboarding-review';

export class OnboardingAgentService {
  private readonly createRunId: () => string;
  private readonly today: () => string;

  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      createRunId?: () => string;
      today?: () => string;
    },
  ) {
    this.createRunId = dependencies.createRunId ?? randomUUID;
    this.today = dependencies.today ?? todayAsDateOnly;
  }

  public async invoke(input: OnboardingInvocationInput): Promise<OnboardingInvocationResult> {
    const runId = this.createRunId();
    const request = parseOnboardingRequest(input.query);

    if (!request.supported) {
      return buildInvocationResult(200, {
        status: 'UNSUPPORTED_REQUEST',
        message: 'That request is outside the capabilities of this HCM agent.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (!request.employeeCode) {
      return buildInvocationResult(200, {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        missingFields: ['employeeId'],
        runId,
        correlationId: input.correlationId,
      });
    }

    const employee = await this.dependencies.employees.findByEmployeeCode(request.employeeCode);

    if (!employee) {
      return buildInvocationResult(404, {
        status: 'FAILED',
        code: 'EMPLOYEE_NOT_FOUND',
        message: `Employee ${request.employeeCode} was not found.`,
        runId,
        correlationId: input.correlationId,
      });
    }

    try {
      assertEmployeeReadAccess({
        actorRole: input.actorRole,
        actorEmployeeId: input.actorEmployeeCode,
        targetEmployeeId: employee.employeeCode,
        targetManagerEmployeeId: employee.managerEmployeeCode,
      });
    } catch {
      return buildInvocationResult(403, {
        status: 'FAILED',
        code: 'AUTHORIZATION_DENIED',
        message: 'You are not authorized to perform this operation.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (employee.status !== 'ACTIVE') {
      return buildInvocationResult(409, {
        status: 'FAILED',
        code: 'EMPLOYEE_INACTIVE',
        message: 'The employee is not active.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (!employee.activeReviewPeriod) {
      return buildInvocationResult(404, {
        status: 'FAILED',
        code: 'ONBOARDING_REVIEW_NOT_FOUND',
        message: 'The employee does not have an active onboarding review period.',
        runId,
        correlationId: input.correlationId,
      });
    }

    const review = evaluateOnboardingReview({
      reviewEndDate: employee.activeReviewPeriod.endDate,
      today: this.today(),
      thresholdDays: request.thresholdDays,
      requestedAction: request.requestedAction,
    });

    return buildInvocationResult(200, {
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
    });
  }
}
