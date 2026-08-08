import { randomUUID } from 'node:crypto';
import { assertEmployeeReadAccess, type AccessRole } from '../security/authorization';
import {
  evaluateOnboardingReview,
  type OnboardingReviewAction,
} from '../workflows/onboarding/evaluate-onboarding-review';

export type EmployeeRecord = {
  employeeCode: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  managerEmployeeCode: string | null;
  activeReviewPeriod: {
    endDate: string;
  } | null;
};

export type EmployeeReader = {
  findByEmployeeCode(employeeCode: string): Promise<EmployeeRecord | null>;
};

export type OnboardingInvocationInput = {
  query: string;
  actorEmployeeCode: string;
  actorRole: AccessRole;
  correlationId: string;
};

type InvocationBody = {
  status: string;
  message: string;
  runId: string;
  correlationId: string;
  [key: string]: unknown;
};

export type OnboardingInvocationResult = {
  httpStatus: number;
  body: InvocationBody;
};

type OnboardingRequest = {
  employeeCode: string | null;
  thresholdDays: number;
  requestedAction: OnboardingReviewAction;
  supported: boolean;
};

const supportedRequestPattern = /onboard|review period|initial review|probation/i;
const employeeCodePattern = /\bEMP-\d+\b/i;

function parseOnboardingRequest(query: string): OnboardingRequest {
  const thresholdMatch = query.match(/(?:within|next|threshold(?: of)?)\s+(\d+)\s+days?/i);
  const employeeMatch = query.match(employeeCodePattern);
  const requestedAction = /\bnotify\b|\bnotification\b|\bsend .*manager\b|\btell .*manager\b/i.test(
    query,
  )
    ? 'NOTIFY_MANAGER'
    : 'REVIEW_ONLY';

  return {
    employeeCode: employeeMatch?.[0].toUpperCase() ?? null,
    thresholdDays: thresholdMatch ? Number(thresholdMatch[1]) : 30,
    requestedAction,
    supported: supportedRequestPattern.test(query),
  };
}

function todayAsDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

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
      return this.result(200, {
        status: 'UNSUPPORTED_REQUEST',
        message: 'That request is outside the capabilities of this HCM agent.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (!request.employeeCode) {
      return this.result(200, {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        missingFields: ['employeeId'],
        runId,
        correlationId: input.correlationId,
      });
    }

    const employee = await this.dependencies.employees.findByEmployeeCode(request.employeeCode);

    if (!employee) {
      return this.result(404, {
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
      return this.result(403, {
        status: 'FAILED',
        code: 'AUTHORIZATION_DENIED',
        message: 'You are not authorized to perform this operation.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (employee.status !== 'ACTIVE') {
      return this.result(409, {
        status: 'FAILED',
        code: 'EMPLOYEE_INACTIVE',
        message: 'The employee is not active.',
        runId,
        correlationId: input.correlationId,
      });
    }

    if (!employee.activeReviewPeriod) {
      return this.result(404, {
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

    return this.result(200, {
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

  private result(httpStatus: number, body: InvocationBody): OnboardingInvocationResult {
    return { httpStatus, body };
  }
}
