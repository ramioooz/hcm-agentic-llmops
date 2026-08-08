import type { PrismaClient } from '@prisma/client';
import { PrismaAgentRunRepository } from '../../src/repositories/agent-run.repository';

describe('PrismaAgentRunRepository', () => {
  it('persists one run with redacted summaries, steps, and security events', async () => {
    const transaction = {
      agentRun: {
        create: jest.fn().mockResolvedValue({ id: 'database-run-001' }),
      },
      agentRunStep: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      securityEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const database = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaAgentRunRepository(database);

    await repository.recordInvocation({
      runId: 'run-test-001',
      correlationId: 'corr-test-001',
      triggerType: 'HTTP',
      actorEmployeeCode: 'EMP-200',
      intent: 'ONBOARDING_REVIEW',
      requestSummary: { employeeCode: 'EMP-201', thresholdDays: 30 },
      status: 'SUCCEEDED',
      resultSummary: { fullName: 'Samira Noor', employeeCode: 'EMP-201' },
      steps: [
        {
          stepName: 'onboarding_review',
          status: 'COMPLETED',
          inputData: { employeeCode: 'EMP-201' },
          outputData: { daysRemaining: 14 },
        },
      ],
      securityEvents: [
        {
          eventType: 'AUTHORIZATION_DENIED',
          severity: 'MEDIUM',
          details: { targetEmployeeCode: 'EMP-201' },
        },
      ],
    });

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run-test-001',
          status: 'SUCCEEDED',
          requestSummary: expect.not.stringContaining('EMP-201'),
        }),
      }),
    );
    expect(transaction.agentRunStep.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          agentRunId: 'database-run-001',
          inputData: expect.not.stringContaining('EMP-201'),
        }),
      ],
    });
    expect(transaction.securityEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          agentRunId: 'database-run-001',
          details: expect.not.stringContaining('EMP-201'),
        }),
      ],
    });
  });
});
