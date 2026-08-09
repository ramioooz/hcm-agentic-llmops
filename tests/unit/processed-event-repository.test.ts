import type { PrismaClient } from '@prisma/client';
import { PrismaProcessedEventRepository } from '../../src/repositories/processed-event.repository';

const claimInput = {
  eventId: 'event-onboarding-001',
  type: 'onboarding.review.requested',
  payloadHash: 'a'.repeat(64),
  correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
  attempt: 1,
};

function createDatabase() {
  const processedEvent = {
    create: jest.fn().mockResolvedValue({ eventId: claimInput.eventId }),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ eventId: claimInput.eventId }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    database: { processedEvent } as unknown as PrismaClient,
    processedEvent,
  };
}

describe('PrismaProcessedEventRepository', () => {
  it('atomically claims a new event using metadata only', async () => {
    const fake = createDatabase();
    const repository = new PrismaProcessedEventRepository(fake.database);

    await expect(repository.claim(claimInput)).resolves.toEqual({ status: 'CLAIMED' });
    expect(fake.processedEvent.create).toHaveBeenCalledWith({
      data: {
        eventId: claimInput.eventId,
        type: claimInput.type,
        payloadHash: claimInput.payloadHash,
        status: 'PROCESSING',
        attempt: 1,
        correlationId: claimInput.correlationId,
      },
    });
  });

  it('returns completed duplicate without changing state', async () => {
    const fake = createDatabase();
    fake.processedEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    fake.processedEvent.findUnique.mockResolvedValueOnce({
      type: claimInput.type,
      payloadHash: claimInput.payloadHash,
      status: 'COMPLETED',
    });
    const repository = new PrismaProcessedEventRepository(fake.database);

    await expect(repository.claim(claimInput)).resolves.toEqual({
      status: 'DUPLICATE_COMPLETED',
    });
    expect(fake.processedEvent.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict when an existing event id has a different hash', async () => {
    const fake = createDatabase();
    fake.processedEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    fake.processedEvent.findUnique.mockResolvedValueOnce({
      type: claimInput.type,
      payloadHash: 'b'.repeat(64),
      status: 'COMPLETED',
    });
    const repository = new PrismaProcessedEventRepository(fake.database);

    await expect(repository.claim(claimInput)).resolves.toEqual({ status: 'CONFLICT' });
  });

  it('reclaims a failed event and advances its bounded delivery attempt', async () => {
    const fake = createDatabase();
    fake.processedEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    fake.processedEvent.findUnique.mockResolvedValueOnce({
      type: claimInput.type,
      payloadHash: claimInput.payloadHash,
      status: 'FAILED',
    });
    const repository = new PrismaProcessedEventRepository(fake.database);

    await expect(repository.claim({ ...claimInput, attempt: 2 })).resolves.toEqual({
      status: 'CLAIMED',
    });
    expect(fake.processedEvent.updateMany).toHaveBeenCalledWith({
      where: { eventId: claimInput.eventId, status: 'FAILED' },
      data: { status: 'PROCESSING', attempt: 2, errorCode: null },
    });
  });

  it('records only stable completion and failure metadata', async () => {
    const fake = createDatabase();
    const repository = new PrismaProcessedEventRepository(fake.database);

    await repository.complete({
      eventId: claimInput.eventId,
      runId: 'run-event-001',
      threadId: 'thread-event-001',
    });
    await repository.fail({ eventId: claimInput.eventId, errorCode: 'WORKFLOW_FAILED' });

    expect(fake.processedEvent.update).toHaveBeenNthCalledWith(1, {
      where: { eventId: claimInput.eventId },
      data: {
        status: 'COMPLETED',
        runId: 'run-event-001',
        threadId: 'thread-event-001',
        errorCode: null,
        completedAt: expect.any(Date),
      },
    });
    expect(fake.processedEvent.update).toHaveBeenNthCalledWith(2, {
      where: { eventId: claimInput.eventId },
      data: { status: 'FAILED', errorCode: 'WORKFLOW_FAILED' },
    });
  });
});
