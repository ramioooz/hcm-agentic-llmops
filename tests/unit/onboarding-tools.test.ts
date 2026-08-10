import {
  createEmployeeLookupTool,
  createManagerNotificationTool,
  createOnboardingCalculationTool,
} from '../../src/tools/onboarding.tools';
import { OnboardingReviewAction } from '../../src/enums/onboarding.enum';
import type { EmployeeReader } from '../../src/types/employee-reader';

const employees = {
  'EMP-100': {
    employeeCode: 'EMP-100',
    fullName: 'Nadia Rahman',
    accessRole: 'HR' as const,
    status: 'ACTIVE' as const,
    managerEmployeeCode: null,
    activeReviewPeriod: null,
  },
  'EMP-200': {
    employeeCode: 'EMP-200',
    fullName: 'Omar Malik',
    accessRole: 'MANAGER' as const,
    status: 'ACTIVE' as const,
    managerEmployeeCode: 'EMP-100',
    activeReviewPeriod: null,
  },
  'EMP-201': {
    employeeCode: 'EMP-201',
    fullName: 'Samira Noor',
    accessRole: 'EMPLOYEE' as const,
    status: 'ACTIVE' as const,
    managerEmployeeCode: 'EMP-200',
    activeReviewPeriod: { endDate: '2026-08-21' },
  },
  'EMP-202': {
    employeeCode: 'EMP-202',
    fullName: 'Yousef Haddad',
    accessRole: 'EMPLOYEE' as const,
    status: 'ACTIVE' as const,
    managerEmployeeCode: 'EMP-100',
    activeReviewPeriod: { endDate: '2026-08-21' },
  },
};

const reader: EmployeeReader = {
  findByEmployeeCode: async (code) => employees[code as keyof typeof employees] ?? null,
};

describe('onboarding tools', () => {
  test('lookup derives canonical authorization context from repository records', async () => {
    const result = await createEmployeeLookupTool(reader).invoke({
      actorEmployeeCode: 'EMP-200',
      targetEmployeeCode: 'EMP-201',
    });

    expect(result).toMatchObject({
      actor: { employeeCode: 'EMP-200', accessRole: 'MANAGER' },
      employee: { employeeCode: 'EMP-201', managerEmployeeCode: 'EMP-200' },
    });
  });

  test('notification is only performed for explicit in-threshold authorized requests', async () => {
    const send = jest.fn().mockResolvedValue({ notificationId: 'dev-note-001' });
    const tool = createManagerNotificationTool(reader, { send });

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-100',
        targetEmployeeCode: 'EMP-201',
        explicit: true,
        withinThreshold: true,
      }),
    ).resolves.toEqual({ performed: true, notificationId: 'dev-note-001' });
  });

  test('calculation uses deterministic review rules behind canonical authorization', async () => {
    const tool = createOnboardingCalculationTool(reader);

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-200',
        targetEmployeeCode: 'EMP-201',
        today: '2026-08-07',
        thresholdDays: 30,
        requestedAction: OnboardingReviewAction.ReviewOnly,
      }),
    ).resolves.toEqual({ daysRemaining: 14, withinThreshold: true, action: 'REVIEW_ONLY' });
  });

  test('notification does not run without explicit intent or inside-threshold eligibility', async () => {
    const send = jest.fn().mockResolvedValue({ notificationId: 'unexpected' });
    const tool = createManagerNotificationTool(reader, { send });

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-200',
        targetEmployeeCode: 'EMP-201',
        explicit: false,
        withinThreshold: true,
      }),
    ).resolves.toEqual({ performed: false, reason: 'NOT_EXPLICITLY_REQUESTED' });
    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-200',
        targetEmployeeCode: 'EMP-201',
        explicit: true,
        withinThreshold: false,
      }),
    ).resolves.toEqual({ performed: false, reason: 'OUTSIDE_THRESHOLD' });
    expect(send).not.toHaveBeenCalled();
  });

  test('notification rejects employee actors', async () => {
    const tool = createManagerNotificationTool(reader, {
      send: jest.fn().mockResolvedValue({ notificationId: 'unexpected' }),
    });

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-201',
        targetEmployeeCode: 'EMP-201',
        explicit: true,
        withinThreshold: true,
      }),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });

  test('notification rejects a manager targeting someone outside their direct reports', async () => {
    const tool = createManagerNotificationTool(reader, {
      send: jest.fn().mockResolvedValue({ notificationId: 'unexpected' }),
    });

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-200',
        targetEmployeeCode: 'EMP-202',
        explicit: true,
        withinThreshold: true,
      }),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });

  test('notification ignores a caller-supplied role and reloads canonical authorization data', async () => {
    const tool = createManagerNotificationTool(reader, {
      send: jest.fn().mockResolvedValue({ notificationId: 'unexpected' }),
    });

    await expect(
      tool.invoke({
        actorEmployeeCode: 'EMP-201',
        targetEmployeeCode: 'EMP-201',
        explicit: true,
        withinThreshold: true,
      }),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });
});
