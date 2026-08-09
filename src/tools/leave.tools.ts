import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { EmployeeReader } from '../types/employee-reader';
import type { LeaveReader } from '../types/leave-reader';

const employeeCode = z.string().regex(/^EMP-\d+$/);

async function authorizeLeaveRead(
  employees: EmployeeReader,
  actorEmployeeCode: string,
  targetEmployeeCode: string,
): Promise<void> {
  const [actor, target] = await Promise.all([
    employees.findByEmployeeCode(actorEmployeeCode),
    employees.findByEmployeeCode(targetEmployeeCode),
  ]);
  if (!actor) throw new Error('AUTHENTICATION_REQUIRED');
  if (!target) throw new Error('EMPLOYEE_NOT_FOUND');
  if (actor.status !== 'ACTIVE' || target.status !== 'ACTIVE') {
    throw new Error('EMPLOYEE_INACTIVE');
  }
  if (actor.accessRole !== 'HR' && actor.employeeCode !== target.employeeCode) {
    throw new Error('AUTHORIZATION_DENIED');
  }
}

export function createLeavePolicyTool(employees: EmployeeReader, leaves: LeaveReader) {
  return tool(
    async ({ actorEmployeeCode, targetEmployeeCode }) => {
      await authorizeLeaveRead(employees, actorEmployeeCode, targetEmployeeCode);
      const policy = await leaves.findAnnualPolicy();
      if (!policy) throw new Error('LEAVE_POLICY_NOT_FOUND');
      return policy;
    },
    {
      name: 'leave_policy_lookup',
      description: 'Read the annual leave policy after leave-specific authorization.',
      schema: z.object({ actorEmployeeCode: employeeCode, targetEmployeeCode: employeeCode }),
    },
  );
}

export function createLeaveBalanceTool(employees: EmployeeReader, leaves: LeaveReader) {
  return tool(
    async ({ actorEmployeeCode, targetEmployeeCode, year }) => {
      await authorizeLeaveRead(employees, actorEmployeeCode, targetEmployeeCode);
      const balance = await leaves.findAnnualBalance(targetEmployeeCode, year);
      if (!balance) throw new Error('LEAVE_BALANCE_NOT_FOUND');
      return balance;
    },
    {
      name: 'leave_balance_lookup',
      description: 'Read an employee annual leave balance after leave-specific authorization.',
      schema: z.object({
        actorEmployeeCode: employeeCode,
        targetEmployeeCode: employeeCode,
        year: z.number().int(),
      }),
    },
  );
}
