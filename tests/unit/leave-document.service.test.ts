import { LeaveDocumentTemplateVersion } from '../../src/enums/leave.enum';
import { LeaveDocumentService } from '../../src/services/leave-document.service';

describe('LeaveDocumentService', () => {
  it('authorizes the actor before rendering a submitted request snapshot', async () => {
    const employees = {
      findByEmployeeCode: jest.fn().mockResolvedValue({
        employeeCode: 'EMP-201',
        fullName: 'Samira Noor',
        accessRole: 'EMPLOYEE' as const,
        status: 'ACTIVE' as const,
        managerEmployeeCode: 'EMP-200',
        activeReviewPeriod: null,
      }),
    };
    const documents = {
      findDocumentSnapshotById: jest.fn().mockResolvedValue({
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
    const service = new LeaveDocumentService({ employees, documents });

    const result = await service.generateAuthorized({
      leaveRequestId: 'lr_123',
      actorEmployeeCode: 'EMP-201',
    });

    expect(result?.id).toBe('lr_123');
    expect(result?.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result?.pdf.toString('ascii')).toContain('Employee: EMP-201');
    expect(employees.findByEmployeeCode).toHaveBeenCalledWith('EMP-201');
    expect(documents.findDocumentSnapshotById).toHaveBeenCalledWith('lr_123');
  });

  it('returns not found before evaluating an inactive actor for a missing document', async () => {
    const service = new LeaveDocumentService({
      employees: {
        findByEmployeeCode: jest.fn().mockResolvedValue({
          employeeCode: 'EMP-201',
          fullName: 'Samira Noor',
          accessRole: 'EMPLOYEE' as const,
          status: 'INACTIVE' as const,
          managerEmployeeCode: 'EMP-200',
          activeReviewPeriod: null,
        }),
      },
      documents: { findDocumentSnapshotById: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.generateAuthorized({
        leaveRequestId: 'missing-request',
        actorEmployeeCode: 'EMP-201',
      }),
    ).resolves.toBeNull();
  });
});
