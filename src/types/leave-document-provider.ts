export interface LeaveDocumentProvider {
  generateAuthorized(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<{ id: string; pdf: Buffer } | null>;
}
