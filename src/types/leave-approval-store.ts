import type { LeaveDocumentTemplateVersion } from '../enums/leave.enum';

export type SubmittedLeaveRequest = {
  id: string;
  employeeCode: string;
  status: 'SUBMITTED';
  documentTemplateVersion: LeaveDocumentTemplateVersion;
};

export interface LeaveApprovalStore {
  resolveEmployeeCodeById(employeeId: string): Promise<string | null>;
  findSubmittedByThreadId(threadId: string): Promise<SubmittedLeaveRequest | undefined>;
  submitApproved(input: {
    id: string;
    approvalThreadId: string;
    employeeId: string;
    employeeCode: string;
    policyId: string;
    startDate: string;
    endDate: string;
    requestedWorkingDays: number;
    documentTemplateVersion: LeaveDocumentTemplateVersion;
  }): Promise<SubmittedLeaveRequest>;
}
