import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function dateOnlyFromToday(offsetDays: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

async function main(): Promise<void> {
  await prisma.$transaction([
    prisma.processedEvent.deleteMany(),
    prisma.securityEvent.deleteMany(),
    prisma.agentRunStep.deleteMany(),
    prisma.agentRun.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.leavePolicy.deleteMany(),
    prisma.knowledgeDocument.deleteMany(),
    prisma.onboardingReviewPeriod.deleteMany(),
    prisma.employee.deleteMany(),
  ]);

  const hr = await prisma.employee.create({
    data: {
      employeeCode: 'EMP-100',
      fullName: 'Nadia Rahman',
      email: 'nadia.rahman@example.test',
      department: 'People Operations',
      jobTitle: 'HR Partner',
      accessRole: 'HR',
    },
  });

  const manager = await prisma.employee.create({
    data: {
      employeeCode: 'EMP-200',
      fullName: 'Omar Malik',
      email: 'omar.malik@example.test',
      department: 'Engineering',
      jobTitle: 'Engineering Manager',
      accessRole: 'MANAGER',
      managerId: hr.id,
    },
  });

  const nearEnd = await prisma.employee.create({
    data: {
      employeeCode: 'EMP-201',
      fullName: 'Samira Noor',
      email: 'samira.noor@example.test',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      managerId: manager.id,
    },
  });

  const outsideThreshold = await prisma.employee.create({
    data: {
      employeeCode: 'EMP-202',
      fullName: 'Yousef Haddad',
      email: 'yousef.haddad@example.test',
      department: 'Engineering',
      jobTitle: 'QA Engineer',
      managerId: manager.id,
    },
  });

  const completed = await prisma.employee.create({
    data: {
      employeeCode: 'EMP-300',
      fullName: 'Lina Faris',
      email: 'lina.faris@example.test',
      department: 'Finance',
      jobTitle: 'Accountant',
      managerId: hr.id,
    },
  });

  await prisma.onboardingReviewPeriod.createMany({
    data: [
      {
        employeeId: nearEnd.id,
        startDate: dateOnlyFromToday(-76),
        endDate: dateOnlyFromToday(14),
        status: 'ACTIVE',
      },
      {
        employeeId: outsideThreshold.id,
        startDate: dateOnlyFromToday(-45),
        endDate: dateOnlyFromToday(45),
        status: 'ACTIVE',
      },
      {
        employeeId: completed.id,
        startDate: dateOnlyFromToday(-210),
        endDate: dateOnlyFromToday(-30),
        status: 'COMPLETED',
      },
    ],
  });

  const annualPolicy = await prisma.leavePolicy.create({
    data: {
      code: 'ANNUAL',
      name: 'Annual Leave',
      annualAllowanceDays: 20,
      workingDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
      minimumNoticeWorkingDays: 3,
      maximumConsecutiveWorkingDays: 10,
      excludesHolidays: true,
    },
  });

  const year = new Date().getUTCFullYear();
  await prisma.leaveBalance.createMany({
    data: [year, year + 1].flatMap((balanceYear) => [
      {
        employeeId: nearEnd.id,
        leavePolicyId: annualPolicy.id,
        year: balanceYear,
        allocatedDays: 20,
        usedDays: 4,
        pendingDays: 2,
      },
      {
        employeeId: outsideThreshold.id,
        leavePolicyId: annualPolicy.id,
        year: balanceYear,
        allocatedDays: 20,
        usedDays: 10,
        pendingDays: 0,
      },
      {
        employeeId: manager.id,
        leavePolicyId: annualPolicy.id,
        year: balanceYear,
        allocatedDays: 20,
        usedDays: 5,
        pendingDays: 0,
      },
    ]),
  });

  console.log(
    `Seeded ${hr.employeeCode}, ${manager.employeeCode}, ${nearEnd.employeeCode}, ${outsideThreshold.employeeCode}, and ${completed.employeeCode}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
