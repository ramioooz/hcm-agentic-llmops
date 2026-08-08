import type { EmployeeRecord } from './employee-record';

export type EmployeeReader = {
  findByEmployeeCode(employeeCode: string): Promise<EmployeeRecord | null>;
};
