import type { PrismaClient } from '@prisma/client';
import type { EmployeeReader } from '../types/employee-reader';
import type { EmployeeRecord } from '../types/employee-record';

export class PrismaEmployeeRepository implements EmployeeReader {
  public constructor(private readonly database: PrismaClient) {}

  public async findByEmployeeCode(employeeCode: string): Promise<EmployeeRecord | null> {
    const employee = await this.database.employee.findUnique({
      where: { employeeCode },
      include: {
        manager: { select: { employeeCode: true } },
        reviewPeriods: {
          where: { status: 'ACTIVE' },
          orderBy: { endDate: 'asc' },
          take: 1,
        },
      },
    });

    if (!employee) {
      return null;
    }

    return {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      accessRole: employee.accessRole,
      status: employee.status,
      managerEmployeeCode: employee.manager?.employeeCode ?? null,
      activeReviewPeriod: employee.reviewPeriods[0]
        ? { endDate: employee.reviewPeriods[0].endDate.toISOString().slice(0, 10) }
        : null,
    };
  }
}
