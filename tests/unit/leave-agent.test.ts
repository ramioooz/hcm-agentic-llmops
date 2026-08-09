import { runLeaveWorkerGraph } from '../../src/workflows/leave/leave.graph';
import type { EmployeeRecord } from '../../src/types/employee-record';

const employee: EmployeeRecord = {
  employeeCode: 'EMP-201',
  fullName: 'Samira Noor',
  accessRole: 'EMPLOYEE',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-200',
  activeReviewPeriod: null,
};

describe('leave agent', () => {
  it('runs authorized policy and balance reads in parallel and returns a weekday-only proposal without creating a request', async () => {
    let releasePolicy: (() => void) | undefined;
    let releaseBalance: (() => void) | undefined;
    let markPolicyStarted: (() => void) | undefined;
    let markBalanceStarted: (() => void) | undefined;
    const policyStarted = new Promise<void>((resolve) => {
      markPolicyStarted = resolve;
    });
    const balanceStarted = new Promise<void>((resolve) => {
      markBalanceStarted = resolve;
    });
    const policyBlocked = new Promise<void>((resolve) => {
      releasePolicy = resolve;
    });
    const balanceBlocked = new Promise<void>((resolve) => {
      releaseBalance = resolve;
    });
    const leaves = {
      findAnnualPolicy: jest.fn(async () => {
        markPolicyStarted?.();
        await policyBlocked;
        return {
          id: 'policy-annual',
          code: 'ANNUAL' as const,
          name: 'Annual Leave',
          annualAllowanceDays: 20,
          minimumNoticeWorkingDays: 3,
          maximumConsecutiveWorkingDays: 10,
          workWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const,
          excludesHolidays: true,
        };
      }),
      findAnnualBalance: jest.fn(async (_employeeCode: string, _year: number) => {
        markBalanceStarted?.();
        await balanceBlocked;
        return {
          employeeCode: 'EMP-201',
          policyCode: 'ANNUAL' as const,
          year: 2026,
          allocatedDays: 20,
          usedDays: 4,
          pendingDays: 2,
        };
      }),
    };

    const execution = runLeaveWorkerGraph(
      {
        employees: { findByEmployeeCode: jest.fn().mockResolvedValue(employee) },
        leaves,
      },
      {
        actorEmployeeCode: 'EMP-201',
        targetEmployeeCode: 'EMP-201',
        startDate: '2026-08-14',
        endDate: '2026-08-18',
        today: '2026-08-10',
        threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
        runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      },
    );

    await Promise.all([policyStarted, balanceStarted]);
    expect(leaves.findAnnualPolicy).toHaveBeenCalledTimes(1);
    expect(leaves.findAnnualBalance).toHaveBeenCalledTimes(1);
    releasePolicy?.();
    releaseBalance?.();

    await expect(execution).resolves.toMatchObject({
      result: {
        httpStatus: 200,
        body: {
          status: 'COMPLETED',
          message: 'Leave request proposal prepared; no request was created.',
          data: {
            requestCreated: false,
            proposal: {
              leaveType: 'ANNUAL',
              requestedWorkingDays: 3,
              noticeWorkingDays: 3,
              availableDays: 14,
              eligible: true,
              reasons: [],
            },
          },
        },
      },
    });
  });
});
