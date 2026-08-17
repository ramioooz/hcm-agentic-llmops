import type { PrismaClient } from '@prisma/client';
import { CommonErrorCode, LeaveErrorCode } from '../enums/error.enum';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import { ApplicationError } from '../errors/application.error';
import type { LeaveReader } from '../types/leave-reader';
import type { LeaveApprovalStore } from '../types/leave-approval-store';

const annualWorkWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

export class PrismaLeaveRepository implements LeaveReader, LeaveApprovalStore {
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
        employeeId: true,
        year: true,
        allocatedDays: true,
        usedDays: true,
        pendingDays: true,
        employee: { select: { employeeCode: true } },
      },
    });
    if (!balance) return null;
    return {
      employeeId: balance.employeeId,
      employeeCode: balance.employee.employeeCode,
      policyCode: 'ANNUAL' as const,
      year: balance.year,
      allocatedDays: balance.allocatedDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
    };
  }

  public async resolveEmployeeCodeById(employeeId: string): Promise<string | null> {
    const employee = await this.database.employee.findUnique({
      where: { id: employeeId },
      select: { employeeCode: true },
    });
    return employee?.employeeCode ?? null;
  }

  public async findSubmittedByThreadId(threadId: string) {
    const request = await this.database.leaveRequest.findUnique({
      where: { approvalThreadId: threadId },
      select: {
        id: true,
        status: true,
        documentTemplateVersion: true,
        employee: { select: { employeeCode: true } },
      },
    });
    if (!request || request.status !== 'SUBMITTED') return undefined;
    return {
      id: request.id,
      employeeCode: request.employee.employeeCode,
      status: 'SUBMITTED' as const,
      documentTemplateVersion: request.documentTemplateVersion as LeaveDocumentTemplateVersion,
    };
  }

  public async submitApproved(input: {
    id: string;
    approvalThreadId: string;
    employeeId: string;
    employeeCode: string;
    policyId: string;
    startDate: string;
    endDate: string;
    requestedWorkingDays: number;
    documentTemplateVersion: LeaveDocumentTemplateVersion;
  }) {
    const request = await this.database.leaveRequest.upsert({
      where: { approvalThreadId: input.approvalThreadId },
      update: {},
      create: {
        id: input.id,
        approvalThreadId: input.approvalThreadId,
        employeeId: input.employeeId,
        leavePolicyId: input.policyId,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
        endDate: new Date(`${input.endDate}T00:00:00.000Z`),
        requestedWorkingDays: input.requestedWorkingDays,
        status: 'SUBMITTED',
        documentTemplateVersion: input.documentTemplateVersion,
        submittedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        documentTemplateVersion: true,
      },
    });
    if (request.status !== 'SUBMITTED') {
      throw new ApplicationError(LeaveErrorCode.RequestPersistenceFailed);
    }
    return {
      id: request.id,
      employeeCode: input.employeeCode,
      status: 'SUBMITTED' as const,
      documentTemplateVersion: request.documentTemplateVersion as LeaveDocumentTemplateVersion,
    };
  }

  public async findAuthorizedDocument(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }) {
    const [actor, request] = await Promise.all([
      this.database.employee.findUnique({
        where: { employeeCode: input.actorEmployeeCode },
        select: { employeeCode: true, accessRole: true, status: true },
      }),
      this.database.leaveRequest.findUnique({
        where: { id: input.leaveRequestId },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          requestedWorkingDays: true,
          documentTemplateVersion: true,
          employee: { select: { employeeCode: true } },
          leavePolicy: { select: { code: true } },
        },
      }),
    ]);
    if (!actor) throw new ApplicationError(CommonErrorCode.AuthenticationRequired);
    if (!request || request.status !== 'SUBMITTED') return null;
    if (actor.status !== 'ACTIVE') throw new ApplicationError(CommonErrorCode.EmployeeInactive);
    if (actor.accessRole !== 'HR' && actor.employeeCode !== request.employee.employeeCode) {
      throw new ApplicationError(CommonErrorCode.AuthorizationDenied);
    }
    if (request.leavePolicy.code !== 'ANNUAL') {
      throw new ApplicationError(LeaveErrorCode.DocumentTemplateUnsupported);
    }
    return {
      id: request.id,
      employeeCode: request.employee.employeeCode,
      leaveType: 'ANNUAL' as const,
      startDate: request.startDate.toISOString().slice(0, 10),
      endDate: request.endDate.toISOString().slice(0, 10),
      requestedWorkingDays: request.requestedWorkingDays,
      status: 'SUBMITTED' as const,
      documentTemplateVersion: request.documentTemplateVersion as LeaveDocumentTemplateVersion,
    };
  }
}
