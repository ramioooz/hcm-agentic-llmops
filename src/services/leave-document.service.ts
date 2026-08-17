import { generateLeaveRequestPdf } from '../documents/leave-request-pdf';
import { LeaveErrorCode } from '../enums/error.enum';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import { ApplicationError } from '../errors/application.error';
import type { LeaveApprovalStore } from '../types/leave-approval-store';
import type { LeaveDocumentProvider } from '../types/leave-document-provider';

export class LeaveDocumentService implements LeaveDocumentProvider {
  public constructor(private readonly approvals: LeaveApprovalStore) {}

  public async generateAuthorized(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<{ id: string; pdf: Buffer } | null> {
    const snapshot = await this.approvals.findAuthorizedDocument(input);
    if (!snapshot) return null;
    if (snapshot.documentTemplateVersion !== LeaveDocumentTemplateVersion.V1) {
      throw new ApplicationError(LeaveErrorCode.DocumentTemplateUnsupported);
    }
    return {
      id: snapshot.id,
      pdf: generateLeaveRequestPdf({
        leaveRequestId: snapshot.id,
        employeeCode: snapshot.employeeCode,
        leaveType: snapshot.leaveType,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        requestedWorkingDays: snapshot.requestedWorkingDays,
      }),
    };
  }
}
