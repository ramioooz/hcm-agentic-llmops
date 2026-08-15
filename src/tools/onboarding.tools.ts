import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { CommonErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import { assertEmployeeReadAccess } from '../security/authorization';
import type { AccessRole } from '../types/access-role';
import type { AuthorizedEmployeeLookup } from '../types/authorized-employee-lookup';
import type { EmployeeReader } from '../types/employee-reader';
import type { ManagerNotificationSender } from '../types/manager-notification-sender';
import { OnboardingReviewAction } from '../enums/onboarding.enum';
import { evaluateOnboardingReview } from '../services/onboarding-review.service';

const employeeCode = z.string().regex(/^EMP-\d+$/);
const reviewAction = z.enum(OnboardingReviewAction);

async function loadAuthorizedEmployee(
  employees: EmployeeReader,
  actorEmployeeCode: string,
  targetEmployeeCode: string,
): Promise<AuthorizedEmployeeLookup> {
  const actor = await employees.findByEmployeeCode(actorEmployeeCode);
  if (!actor) throw new ApplicationError(CommonErrorCode.AuthenticationRequired);
  const employee = await employees.findByEmployeeCode(targetEmployeeCode);
  if (!employee) throw new ApplicationError(CommonErrorCode.EmployeeNotFound);
  assertEmployeeReadAccess({
    actorRole: actor.accessRole,
    actorEmployeeId: actor.employeeCode,
    targetEmployeeId: employee.employeeCode,
    targetManagerEmployeeId: employee.managerEmployeeCode,
  });
  return { actor, employee };
}

function assertNotificationAccess(input: {
  actorRole: AccessRole;
  actorEmployeeCode: string;
  targetManagerEmployeeCode: string | null;
}): void {
  const allowed =
    input.actorRole === 'HR' ||
    (input.actorRole === 'MANAGER' && input.targetManagerEmployeeCode === input.actorEmployeeCode);
  if (!allowed) {
    throw new ApplicationError(CommonErrorCode.AuthorizationDenied);
  }
}

export function createEmployeeLookupTool(employees: EmployeeReader) {
  return tool(
    async ({ actorEmployeeCode, targetEmployeeCode }): Promise<AuthorizedEmployeeLookup> => {
      return loadAuthorizedEmployee(employees, actorEmployeeCode, targetEmployeeCode);
    },
    {
      name: 'employee_lookup',
      description: 'Retrieve an employee after canonical database authorization.',
      schema: z.object({ actorEmployeeCode: employeeCode, targetEmployeeCode: employeeCode }),
    },
  );
}

export function createOnboardingCalculationTool(employees: EmployeeReader) {
  return tool(
    async ({ actorEmployeeCode, targetEmployeeCode, today, thresholdDays, requestedAction }) => {
      const { employee } = await loadAuthorizedEmployee(
        employees,
        actorEmployeeCode,
        targetEmployeeCode,
      );
      if (employee.status !== 'ACTIVE') {
        throw new ApplicationError(CommonErrorCode.EmployeeInactive);
      }
      if (!employee.activeReviewPeriod) {
        throw new ApplicationError(CommonErrorCode.OnboardingReviewNotFound);
      }
      return evaluateOnboardingReview({
        reviewEndDate: employee.activeReviewPeriod.endDate,
        today,
        thresholdDays,
        requestedAction,
      });
    },
    {
      name: 'onboarding_calculation',
      description: 'Calculate onboarding review status using deterministic date rules.',
      schema: z.object({
        actorEmployeeCode: employeeCode,
        targetEmployeeCode: employeeCode,
        today: z.string(),
        thresholdDays: z.number().int().min(0),
        requestedAction: reviewAction,
      }),
    },
  );
}

export function createManagerNotificationTool(
  employees: EmployeeReader,
  sender: ManagerNotificationSender,
) {
  return tool(
    async ({ actorEmployeeCode, targetEmployeeCode, explicit, withinThreshold }) => {
      const { actor, employee } = await loadAuthorizedEmployee(
        employees,
        actorEmployeeCode,
        targetEmployeeCode,
      );
      assertNotificationAccess({
        actorRole: actor.accessRole,
        actorEmployeeCode: actor.employeeCode,
        targetManagerEmployeeCode: employee.managerEmployeeCode,
      });
      if (!explicit) return { performed: false as const, reason: 'NOT_EXPLICITLY_REQUESTED' };
      if (!withinThreshold) return { performed: false as const, reason: 'OUTSIDE_THRESHOLD' };
      if (!employee.managerEmployeeCode) {
        return { performed: false as const, reason: 'MANAGER_NOT_ASSIGNED' };
      }
      const notification = await sender.send({
        managerEmployeeCode: employee.managerEmployeeCode,
        targetEmployeeCode: employee.employeeCode,
      });
      return { performed: true as const, notificationId: notification.notificationId };
    },
    {
      name: 'manager_notification',
      description: 'Send an explicitly requested manager notification under deterministic policy.',
      schema: z.object({
        actorEmployeeCode: employeeCode,
        targetEmployeeCode: employeeCode,
        explicit: z.boolean(),
        withinThreshold: z.boolean(),
      }),
    },
  );
}
