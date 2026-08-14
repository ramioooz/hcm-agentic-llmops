export type SubmittedLeaveRequest = {
  id: string;
  employeeCode: string;
  status: 'SUBMITTED';
  documentPdf: Buffer;
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
    documentPdf: Buffer;
  }): Promise<SubmittedLeaveRequest>;
  findAuthorizedDocument(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<SubmittedLeaveRequest | null>;
}
