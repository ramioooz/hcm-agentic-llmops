import { OnboardingAgentService } from '../../src/services/onboarding-agent.service';
import type { EmployeeReader } from '../../src/types/employee-reader';
import type { EmployeeRecord } from '../../src/types/employee-record';

const employee: EmployeeRecord = {
  employeeCode: 'EMP-201',
  fullName: 'Samira Noor',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-200',
  activeReviewPeriod: {
    endDate: '2026-08-21',
  },
};

function createService(record: EmployeeRecord | null = employee) {
  const reader: EmployeeReader = {
    findByEmployeeCode: jest.fn().mockResolvedValue(record),
  };

  return {
    reader,
    service: new OnboardingAgentService({
      employees: reader,
      clock: {
        today: () => '2026-08-07',
      },
    }),
  };
}

describe('OnboardingAgentService', () => {
  it('reviews a supported onboarding request for an authorized manager', async () => {
    const { service, reader } = createService();

    const result = await service.invoke({
      query: "Review EMP-201's onboarding status",
      actorEmployeeCode: 'EMP-200',
      actorRole: 'MANAGER',
      correlationId: 'corr-test-001',
    });

    expect(result).toMatchObject({
      httpStatus: 200,
      body: {
        status: 'COMPLETED',
        message: 'Employee onboarding review completed.',
        runId: expect.any(String),
        correlationId: 'corr-test-001',
        data: {
          employeeCode: 'EMP-201',
          fullName: 'Samira Noor',
          reviewEndDate: '2026-08-21',
          daysRemaining: 14,
          withinThreshold: true,
          action: 'REVIEW_ONLY',
          actionPerformed: false,
        },
      },
    });
    expect(reader.findByEmployeeCode).toHaveBeenCalledWith('EMP-201');
  });

  it('returns need-more-information when the employee ID is missing', async () => {
    const { service, reader } = createService();

    const result = await service.invoke({
      query: 'Review the onboarding status',
      actorEmployeeCode: 'EMP-200',
      actorRole: 'MANAGER',
      correlationId: 'corr-test-002',
    });

    expect(result).toMatchObject({
      httpStatus: 200,
      body: {
        status: 'NEED_MORE_INFORMATION',
        message: 'Please provide the employee ID.',
        missingFields: ['employeeId'],
        runId: expect.any(String),
        correlationId: 'corr-test-002',
      },
    });
    expect(reader.findByEmployeeCode).not.toHaveBeenCalled();
  });

  it('returns unsupported for a capability outside the onboarding domain', async () => {
    const { service } = createService();

    const result = await service.invoke({
      query: 'Book a flight to London',
      actorEmployeeCode: 'EMP-200',
      actorRole: 'MANAGER',
      correlationId: 'corr-test-003',
    });

    expect(result.body).toMatchObject({
      status: 'UNSUPPORTED_REQUEST',
      message: 'That request is outside the capabilities of this HCM agent.',
      runId: expect.any(String),
      correlationId: 'corr-test-003',
    });
  });

  it('preserves explicit notification intent without claiming a notification was sent', async () => {
    const { service } = createService();

    const result = await service.invoke({
      query: 'Review EMP-201 onboarding status and notify the manager',
      actorEmployeeCode: 'EMP-200',
      actorRole: 'MANAGER',
      correlationId: 'corr-test-004',
    });

    expect(result.body).toMatchObject({
      status: 'COMPLETED',
      data: {
        action: 'NOTIFY_MANAGER',
        actionPerformed: false,
        actionReason: 'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
      },
    });
  });

  it('denies an unauthorized employee from reviewing another employee', async () => {
    const { service } = createService();

    const result = await service.invoke({
      query: 'Review EMP-201 onboarding status',
      actorEmployeeCode: 'EMP-300',
      actorRole: 'EMPLOYEE',
      correlationId: 'corr-test-005',
    });

    expect(result).toMatchObject({
      httpStatus: 403,
      body: {
        status: 'FAILED',
        code: 'AUTHORIZATION_DENIED',
        message: 'You are not authorized to perform this operation.',
        runId: expect.any(String),
        correlationId: 'corr-test-005',
      },
    });
  });
});
