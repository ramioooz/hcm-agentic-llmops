import type { LeaveDocumentSnapshot } from './leave-document-snapshot';

export interface LeaveDocumentReader {
  findDocumentSnapshotById(leaveRequestId: string): Promise<LeaveDocumentSnapshot | null>;
}
