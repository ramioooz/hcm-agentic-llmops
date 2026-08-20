import { LeaveDocumentTemplateVersion } from '../../src/enums/leave.enum';
import { LeaveApprovalService } from '../../src/services/leave-approval.service';

describe('LeaveApprovalService', () => {
  it('revalidates an eligible proposal and persists one deterministic submitted request', async () => {
    const store = {
      resolveEmployeeCodeById: jest.fn().mockResolvedValue('EMP-201'),
      findSubmittedByThreadId: jest.fn(),
      submitApproved: jest.fn().mockResolvedValue({
        id: 'lr_expected',
        employeeCode: 'EMP-201',
        status: 'SUBMITTED' as const,
        documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
      }),
    };
    const service = new LeaveApprovalService({
      store,
      clock: { today: () => '2026-08-10' },
    });

    const result = await service.submit({
      threadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
      employeeCode: 'EMP-201',
      pending: {
        employeeId: 'internal-employee-201',
        policyId: 'policy-annual',
        startDate: '2026-08-14',
        endDate: '2026-08-18',
        requestedWorkingDays: 3,
      },
      policy: {
        id: 'policy-annual',
        code: 'ANNUAL',
        name: 'Annual Leave',
        annualAllowanceDays: 20,
        minimumNoticeWorkingDays: 3,
        maximumConsecutiveWorkingDays: 10,
        workWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        excludesHolidays: true,
      },
      balance: {
        employeeId: 'internal-employee-201',
        employeeCode: 'EMP-201',
        policyCode: 'ANNUAL',
        year: 2026,
        allocatedDays: 20,
        usedDays: 4,
        pendingDays: 2,
      },
    });

    expect(result).toMatchObject({ status: 'SUBMITTED', request: { id: 'lr_expected' } });
    expect(store.submitApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lr_c5ecd058265c2d6a2d1b3d21',
        approvalThreadId: '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb',
        requestedWorkingDays: 3,
        documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
      }),
    );
  });
});
