import { generateLeaveRequestPdf } from '../documents/leave-request-pdf';
import { CommonErrorCode, LeaveErrorCode } from '../enums/error.enum';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import { ApplicationError } from '../errors/application.error';
import type { LeaveDocumentProvider } from '../types/leave-document-provider';
import type { LeaveDocumentReader } from '../types/leave-document-reader';
import type { EmployeeReader } from '../types/employee-reader';

export class LeaveDocumentService implements LeaveDocumentProvider {
  public constructor(
    private readonly dependencies: {
      employees: EmployeeReader;
      documents: LeaveDocumentReader;
    },
  ) {}

  public async generateAuthorized(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<{ id: string; pdf: Buffer } | null> {
    const actor = await this.dependencies.employees.findByEmployeeCode(input.actorEmployeeCode);
    if (!actor) throw new ApplicationError(CommonErrorCode.AuthenticationRequired);
    if (actor.status !== 'ACTIVE') throw new ApplicationError(CommonErrorCode.EmployeeInactive);

    const snapshot = await this.dependencies.documents.findDocumentSnapshotById(
      input.leaveRequestId,
    );
    if (!snapshot) return null;
    if (actor.accessRole !== 'HR' && actor.employeeCode !== snapshot.employeeCode) {
      throw new ApplicationError(CommonErrorCode.AuthorizationDenied);
    }
    if (snapshot.leaveType !== 'ANNUAL') {
      throw new ApplicationError(LeaveErrorCode.DocumentTemplateUnsupported);
    }
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
