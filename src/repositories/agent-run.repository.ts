import type { PrismaClient } from '@prisma/client';
import { redactSensitiveData } from '../security/pii-redaction';
import type { AgentInvocationRecord } from '../types/agent-invocation-record';
import type { AgentRunRecorder } from '../types/agent-run-recorder';
import type { SecurityEventRecord } from '../types/security-event-record';
import type { SecurityEventRecorder } from '../types/security-event-recorder';
import type { ThreadOwnershipReader } from '../types/thread-ownership-reader';

function encodeRedacted(value: Record<string, unknown> | undefined): string | undefined {
  return value ? JSON.stringify(redactSensitiveData(value)) : undefined;
}

export class PrismaAgentRunRepository
  implements AgentRunRecorder, ThreadOwnershipReader, SecurityEventRecorder
{
  public constructor(private readonly database: PrismaClient) {}

  public async resolveCanonicalOwner(employeeCode: string) {
    const employee = await this.database.employee.findUnique({
      where: { employeeCode },
      select: { id: true, employeeCode: true },
    });
    return employee ? { employeeCode: employee.employeeCode, bindingId: employee.id } : null;
  }

  public async findOwnerEmployeeCodeByThreadId(threadId: string): Promise<string | undefined> {
    const run = await this.database.agentRun.findFirst({
      where: { threadId, actorEmployeeCode: { not: null } },
      orderBy: { startedAt: 'asc' },
      select: { actorEmployeeCode: true },
    });
    return run?.actorEmployeeCode ?? undefined;
  }

  public async recordSecurityEvent(input: {
    correlationId: string;
    actorEmployeeCode?: string;
    event: SecurityEventRecord;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const actorEmployeeCode = input.actorEmployeeCode
        ? (
            await transaction.employee.findUnique({
              where: { employeeCode: input.actorEmployeeCode },
              select: { employeeCode: true },
            })
          )?.employeeCode
        : undefined;

      await transaction.securityEvent.create({
        data: {
          agentRunId: undefined,
          correlationId: input.correlationId,
          actorEmployeeCode,
          eventType: input.event.eventType,
          severity: input.event.severity,
          details: encodeRedacted(input.event.details),
        },
      });
    });
  }

  public async recordInvocation(record: AgentInvocationRecord): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const actorEmployeeCode = record.actorEmployeeCode
        ? (
            await transaction.employee.findUnique({
              where: { employeeCode: record.actorEmployeeCode },
              select: { employeeCode: true },
            })
          )?.employeeCode
        : undefined;

      const agentRun = await transaction.agentRun.create({
        data: {
          runId: record.runId,
          threadId: record.threadId,
          correlationId: record.correlationId,
          triggerType: record.triggerType,
          actorEmployeeCode,
          intent: record.intent,
          status: record.status,
          requestSummary: encodeRedacted(record.requestSummary),
          resultSummary: encodeRedacted(record.resultSummary),
          completedAt: new Date(),
        },
      });

      if (record.steps.length > 0) {
        await transaction.agentRunStep.createMany({
          data: record.steps.map((step) => ({
            agentRunId: agentRun.id,
            stepName: step.stepName,
            status: step.status,
            outcomeCode: step.outcomeCode,
            inputData: encodeRedacted(step.inputData),
            outputData: encodeRedacted(step.outputData),
            completedAt: new Date(),
          })),
        });
      }

      if (record.securityEvents.length > 0) {
        await transaction.securityEvent.createMany({
          data: record.securityEvents.map((event) => ({
            agentRunId: agentRun.id,
            correlationId: record.correlationId,
            actorEmployeeCode,
            eventType: event.eventType,
            severity: event.severity,
            details: encodeRedacted(event.details),
          })),
        });
      }
    });
  }
}
