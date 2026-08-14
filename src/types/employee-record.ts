import type { AccessRole } from './access-role';

export type EmployeeRecord = {
  employeeCode: string;
  fullName: string;
  accessRole: AccessRole;
  status: 'ACTIVE' | 'INACTIVE';
  managerEmployeeCode: string | null;
  activeReviewPeriod: {
    endDate: string;
  } | null;
};
