import type { LeaveBalanceRecord } from './leave-balance-record';
import type { LeavePolicyRecord } from './leave-policy-record';

export interface LeaveReader {
  findAnnualPolicy(): Promise<LeavePolicyRecord | null>;
  findAnnualBalance(employeeCode: string, year: number): Promise<LeaveBalanceRecord | null>;
}
