export type LeaveBalanceRecord = {
  employeeId: string;
  employeeCode: string;
  policyCode: 'ANNUAL';
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
};
