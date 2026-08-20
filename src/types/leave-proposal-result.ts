export type LeaveProposalResult = {
  leaveType: 'ANNUAL';
  startDate: string;
  endDate: string;
  requestedWorkingDays: number;
  noticeWorkingDays: number;
  availableDays: number;
  eligible: boolean;
  reasons: string[];
};
