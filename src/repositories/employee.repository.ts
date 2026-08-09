import type { PrismaClient } from '@prisma/client';
import type { EmployeeReader } from '../types/employee-reader';
import type { EmployeeRecord } from '../types/employee-record';
import type { OnboardingReviewCandidateReader } from '../types/onboarding-review-candidate-reader';

export class PrismaEmployeeRepository implements EmployeeReader, OnboardingReviewCandidateReader {
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

  public async findDueOnboardingReviewEmployeeCodes(input: {
    today: string;
    thresholdDays: number;
  }): Promise<string[]> {
    const start = new Date(`${input.today}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + input.thresholdDays);
    const employees = await this.database.employee.findMany({
      where: {
        status: 'ACTIVE',
        reviewPeriods: {
          some: {
            status: 'ACTIVE',
            endDate: { gte: start, lte: end },
          },
        },
      },
      orderBy: { employeeCode: 'asc' },
      select: { employeeCode: true },
    });
    return employees.map((employee) => employee.employeeCode);
  }
}
