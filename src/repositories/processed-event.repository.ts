import type { PrismaClient } from '@prisma/client';
import { TriggerErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';
import type {
  ProcessedEventClaim,
  ProcessedEventClaimInput,
  ProcessedEventStore,
} from '../types/processed-event-store';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export class PrismaProcessedEventRepository implements ProcessedEventStore {
  public constructor(private readonly database: PrismaClient) {}

  public async claim(input: ProcessedEventClaimInput): Promise<ProcessedEventClaim> {
    try {
      await this.database.processedEvent.create({
        data: {
          eventId: input.eventId,
          type: input.type,
          payloadHash: input.payloadHash,
          status: 'PROCESSING',
          attempt: input.attempt,
          correlationId: input.correlationId,
        },
      });
      return { status: 'CLAIMED' };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const existing = await this.database.processedEvent.findUnique({
      where: { eventId: input.eventId },
      select: { type: true, payloadHash: true, status: true },
    });
    if (!existing) {
      throw new ApplicationError(TriggerErrorCode.ProcessedEventStateUnavailable);
    }
    if (existing.type !== input.type || existing.payloadHash !== input.payloadHash) {
      return { status: 'CONFLICT' };
    }
    if (existing.status === 'COMPLETED') {
      return { status: 'DUPLICATE_COMPLETED' };
    }
    if (existing.status === 'PROCESSING') {
      return { status: 'DUPLICATE_IN_PROGRESS' };
    }

    const reclaimed = await this.database.processedEvent.updateMany({
      where: { eventId: input.eventId, status: 'FAILED' },
      data: { status: 'PROCESSING', attempt: input.attempt, errorCode: null },
    });
    return reclaimed.count === 1 ? { status: 'CLAIMED' } : { status: 'DUPLICATE_IN_PROGRESS' };
  }

  public async complete(input: {
    eventId: string;
    runId: string;
    threadId?: string;
  }): Promise<void> {
    await this.database.processedEvent.update({
      where: { eventId: input.eventId },
      data: {
        status: 'COMPLETED',
        runId: input.runId,
        threadId: input.threadId,
        errorCode: null,
        completedAt: new Date(),
      },
    });
  }

  public async fail(input: { eventId: string; errorCode: string }): Promise<void> {
    await this.database.processedEvent.update({
      where: { eventId: input.eventId },
      data: { status: 'FAILED', errorCode: input.errorCode },
    });
  }
}
