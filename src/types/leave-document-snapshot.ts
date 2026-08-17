import type { LeaveDocumentTemplateVersion } from '../enums/leave.enum';

export type LeaveDocumentSnapshot = {
  id: string;
  employeeCode: string;
  leaveType: 'ANNUAL';
  startDate: string;
  endDate: string;
  requestedWorkingDays: number;
  status: 'SUBMITTED';
  documentTemplateVersion: LeaveDocumentTemplateVersion;
};
