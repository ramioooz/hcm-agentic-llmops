import type { PrismaClient } from '@prisma/client';
import type { LeaveReader } from '../types/leave-reader';

const annualWorkWeek = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

export class PrismaLeaveRepository implements LeaveReader {
  public constructor(private readonly database: PrismaClient) {}

  public async findAnnualPolicy() {
    const policy = await this.database.leavePolicy.findUnique({ where: { code: 'ANNUAL' } });
    if (!policy) return null;
    return {
      id: policy.id,
      code: 'ANNUAL' as const,
      name: policy.name,
      annualAllowanceDays: policy.annualAllowanceDays,
      minimumNoticeWorkingDays: policy.minimumNoticeWorkingDays,
      maximumConsecutiveWorkingDays: policy.maximumConsecutiveWorkingDays,
      workWeek: annualWorkWeek,
      excludesHolidays: policy.excludesHolidays,
    };
  }

  public async findAnnualBalance(employeeCode: string, year: number) {
    const balance = await this.database.leaveBalance.findFirst({
      where: {
        year,
        employee: { employeeCode },
        leavePolicy: { code: 'ANNUAL' },
      },
      select: {
        year: true,
        allocatedDays: true,
        usedDays: true,
        pendingDays: true,
        employee: { select: { employeeCode: true } },
      },
    });
    if (!balance) return null;
    return {
      employeeCode: balance.employee.employeeCode,
      policyCode: 'ANNUAL' as const,
      year: balance.year,
      allocatedDays: balance.allocatedDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
    };
  }
}
