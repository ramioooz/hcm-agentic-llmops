import { LeaveDocumentTemplateVersion } from '../../src/enums/leave.enum';
import { LeaveDocumentService } from '../../src/services/leave-document.service';

describe('LeaveDocumentService', () => {
  it('renders an authorized submitted request through its stored template version', async () => {
    const approvals = {
      resolveEmployeeCodeById: jest.fn(),
      findSubmittedByThreadId: jest.fn(),
      submitApproved: jest.fn(),
      findAuthorizedDocument: jest.fn().mockResolvedValue({
        id: 'lr_123',
        employeeCode: 'EMP-201',
        leaveType: 'ANNUAL' as const,
        startDate: '2026-08-24',
        endDate: '2026-08-28',
        requestedWorkingDays: 5,
        status: 'SUBMITTED' as const,
        documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
      }),
    };
    const service = new LeaveDocumentService(approvals);

    const result = await service.generateAuthorized({
      leaveRequestId: 'lr_123',
      actorEmployeeCode: 'EMP-201',
    });

    expect(result?.id).toBe('lr_123');
    expect(result?.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result?.pdf.toString('ascii')).toContain('Employee: EMP-201');
    expect(approvals.findAuthorizedDocument).toHaveBeenCalledWith({
      leaveRequestId: 'lr_123',
      actorEmployeeCode: 'EMP-201',
    });
  });
});
