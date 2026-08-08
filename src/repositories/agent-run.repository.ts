import type { PrismaClient } from '@prisma/client';
import { redactSensitiveData } from '../security/pii-redaction';
import type { AgentInvocationRecord } from '../types/agent-invocation-record';
import type { AgentRunRecorder } from '../types/agent-run-recorder';

function encodeRedacted(value: Record<string, unknown> | undefined): string | undefined {
  return value ? JSON.stringify(redactSensitiveData(value)) : undefined;
}

export class PrismaAgentRunRepository implements AgentRunRecorder {
  public constructor(private readonly database: PrismaClient) {}

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
