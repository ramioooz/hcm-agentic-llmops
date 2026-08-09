export type LeaveBalanceRecord = {
  employeeCode: string;
  policyCode: 'ANNUAL';
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
};
