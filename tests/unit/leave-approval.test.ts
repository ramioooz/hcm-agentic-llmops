import { MemorySaver } from '@langchain/langgraph';
import { HcmAgentService } from '../../src/services/hcm-agent.service';
import type { EmployeeRecord } from '../../src/types/employee-record';

const threadId = '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb';
const employee: EmployeeRecord = {
  employeeCode: 'EMP-201',
  fullName: 'Samira Noor',
  accessRole: 'EMPLOYEE',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-200',
  activeReviewPeriod: null,
};

describe('leave approval', () => {
  it('interrupts before creation, then revalidates and submits exactly once with a deterministic PDF', async () => {
    let submitted:
      | {
          id: string;
          employeeCode: string;
          status: 'SUBMITTED';
          documentPdf: Buffer;
        }
      | undefined;
    const submitApproved = jest.fn(async (input: { documentPdf: Buffer }) => {
      submitted ??= {
        id: 'leave-request-thread-001',
        employeeCode: 'EMP-201',
        status: 'SUBMITTED' as const,
        documentPdf: input.documentPdf,
      };
      return submitted;
    });
    const policy = {
      id: 'policy-annual',
      code: 'ANNUAL' as const,
      name: 'Annual Leave',
      annualAllowanceDays: 20,
      minimumNoticeWorkingDays: 3,
      maximumConsecutiveWorkingDays: 10,
      workWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const,
      excludesHolidays: true,
    };
    const leaves = {
      findAnnualPolicy: jest.fn().mockResolvedValue(policy),
      findAnnualBalance: jest.fn().mockResolvedValue({
        employeeId: 'internal-employee-201',
        employeeCode: 'EMP-201',
        policyCode: 'ANNUAL' as const,
        year: 2026,
        allocatedDays: 20,
        usedDays: 4,
        pendingDays: 2,
      }),
    };
    const approvals = {
      resolveEmployeeCodeById: jest.fn().mockResolvedValue('EMP-201'),
      findSubmittedByThreadId: jest.fn(async () => submitted),
      submitApproved,
      findAuthorizedDocument: jest.fn(),
    };
    const service = new HcmAgentService({
      employees: { findByEmployeeCode: jest.fn().mockResolvedValue(employee) },
      leaves,
      leaveApprovals: approvals,
      clock: { today: () => '2026-08-10' },
      recorder: { recordInvocation: jest.fn().mockResolvedValue(undefined) },
      normalizer: {
        normalize: jest.fn().mockResolvedValue({
          intent: 'LEAVE_REQUEST',
          employeeCode: null,
          thresholdDays: null,
          requestedAction: null,
          leaveStartDate: '2026-08-14',
          leaveEndDate: '2026-08-18',
          missingFields: [],
        }),
      },
      notifications: { send: jest.fn() },
      checkpointer: new MemorySaver(),
    });

    const pending = await service.invoke({
      kind: 'USER_QUERY',
      query: 'Request annual leave from 2026-08-14 through 2026-08-18',
      actorEmployeeCode: 'EMP-201',
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      threadId,
      runId: 'b4b012a7-740a-49c0-9ca5-f83485db7b86',
    });

    expect(pending).toMatchObject({
      httpStatus: 202,
      body: { status: 'AWAITING_APPROVAL', threadId },
    });
    expect(submitApproved).not.toHaveBeenCalled();

    const approved = await service.resume({
      decision: 'APPROVE',
      actorEmployeeCode: 'EMP-201',
      correlationId: 'c7c8a9e8-8b91-43f1-97cc-c08a7940326c',
      threadId,
    });
    const repeated = await service.resume({
      decision: 'APPROVE',
      actorEmployeeCode: 'EMP-201',
      correlationId: 'fd39c750-e697-4474-98c7-e0c3a5713a4d',
      threadId,
    });

    expect(approved.body).toMatchObject({
      status: 'COMPLETED',
      data: { leaveRequestId: 'leave-request-thread-001', leaveRequestStatus: 'SUBMITTED' },
    });
    expect(repeated.body).toMatchObject({
      data: { leaveRequestId: 'leave-request-thread-001' },
    });
    expect(leaves.findAnnualPolicy).toHaveBeenCalledTimes(2);
    expect(leaves.findAnnualBalance).toHaveBeenCalledTimes(2);
    expect(submitApproved).toHaveBeenCalledTimes(1);
    expect(submitApproved.mock.calls[0]?.[0].documentPdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
