import type { EmployeeRecord } from './employee-record';

export type AuthorizedEmployeeLookup = {
  actor: EmployeeRecord;
  employee: EmployeeRecord;
};
