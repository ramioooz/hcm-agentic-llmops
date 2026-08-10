import { loadLeaveContext } from '../../src/graph-nodes/leave/leave-context.node';
import { evaluateLeaveProposal } from '../../src/services/leave-proposal.service';
import type { EmployeeRecord } from '../../src/types/employee-record';
import type { HcmAgentExecutionContext } from '../../src/types/hcm-agent-execution-context';
import type { HcmAgentGraphDependencies } from '../../src/types/hcm-agent-graph-dependencies';

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
      findAnnualBalance: jest.fn(async () => {
        markBalanceStarted?.();
        await balanceBlocked;
        return {
          employeeId: 'internal-employee-201',
          employeeCode: 'EMP-201',
          policyCode: 'ANNUAL' as const,
          year: 2026,
          allocatedDays: 20,
          usedDays: 4,
          pendingDays: 2,
        };
      }),
    };

    const context: HcmAgentExecutionContext = {
      input: {
        kind: 'USER_QUERY',
        query: 'Request annual leave from 2026-08-14 to 2026-08-18',
        actorEmployeeCode: 'EMP-201',
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
        threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
      },
      runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
      actionPerformed: false,
      steps: [],
      securityEvents: [],
    };
    const dependencies = {
      employees: { findByEmployeeCode: jest.fn().mockResolvedValue(employee) },
      leaves,
    } as unknown as HcmAgentGraphDependencies;
    const execution = loadLeaveContext(
      dependencies,
      context,
      () => undefined,
      'EMP-201',
      '2026-08-14',
    );

    await Promise.all([policyStarted, balanceStarted]);
    expect(leaves.findAnnualPolicy).toHaveBeenCalledTimes(1);
    expect(leaves.findAnnualBalance).toHaveBeenCalledTimes(1);
    releasePolicy?.();
    releaseBalance?.();

    await expect(execution).resolves.toBe(true);
    expect(context.leavePolicy).toBeDefined();
    expect(context.leaveBalance).toBeDefined();
    expect(
      evaluateLeaveProposal({
        today: '2026-08-10',
        startDate: '2026-08-14',
        endDate: '2026-08-18',
        policy: context.leavePolicy!,
        balance: context.leaveBalance!,
      }),
    ).toMatchObject({
      leaveType: 'ANNUAL',
      requestedWorkingDays: 3,
      noticeWorkingDays: 3,
      availableDays: 14,
      eligible: true,
      reasons: [],
    });
  });
});
