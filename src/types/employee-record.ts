export type EmployeeRecord = {
  employeeCode: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  managerEmployeeCode: string | null;
  activeReviewPeriod: {
    endDate: string;
  } | null;
};
