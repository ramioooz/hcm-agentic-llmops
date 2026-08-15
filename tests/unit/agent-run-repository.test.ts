import type { PrismaClient } from '@prisma/client';
import { SecurityEventType, SecuritySeverity } from '../../src/enums/security.enum';
import { PrismaAgentRunRepository } from '../../src/repositories/agent-run.repository';
import type { AgentInvocationRecord } from '../../src/types/agent-invocation-record';

describe('PrismaAgentRunRepository', () => {
  it('resolves a canonical employee code with an opaque internal owner binding', async () => {
    const database = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cm-owner-internal-200',
          employeeCode: 'EMP-200',
        }),
      },
    } as unknown as PrismaClient;
    const repository = new PrismaAgentRunRepository(database) as PrismaAgentRunRepository & {
      resolveCanonicalOwner(employeeCode: string): Promise<{
        employeeCode: string;
        bindingId: string;
      } | null>;
    };

    await expect(repository.resolveCanonicalOwner('EMP-200')).resolves.toEqual({
      employeeCode: 'EMP-200',
      bindingId: 'cm-owner-internal-200',
    });
    expect(database.employee.findUnique).toHaveBeenCalledWith({
      where: { employeeCode: 'EMP-200' },
      select: { id: true, employeeCode: true },
    });
  });

  it('reads the earliest verified audit owner for a thread', async () => {
    const database = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue({ actorEmployeeCode: 'EMP-200' }),
      },
    } as unknown as PrismaClient;
    const repository = new PrismaAgentRunRepository(database) as PrismaAgentRunRepository & {
      findOwnerEmployeeCodeByThreadId(threadId: string): Promise<string | undefined>;
    };

    await expect(repository.findOwnerEmployeeCodeByThreadId('thread-001')).resolves.toBe('EMP-200');
    expect(database.agentRun.findFirst).toHaveBeenCalledWith({
      where: { threadId: 'thread-001', actorEmployeeCode: { not: null } },
      orderBy: { startedAt: 'asc' },
      select: { actorEmployeeCode: true },
    });
  });

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
        create: jest.fn().mockResolvedValue({ id: 'security-event-standalone-001' }),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({ employeeCode: 'EMP-200' }),
      },
    };
    const database = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaAgentRunRepository(database);

    const record: AgentInvocationRecord & { threadId: string } = {
      runId: 'run-test-001',
      threadId: 'thread-test-001',
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
          eventType: SecurityEventType.AuthorizationDenied,
          severity: SecuritySeverity.Medium,
          details: { targetEmployeeCode: 'EMP-201' },
        },
      ],
    };

    await repository.recordInvocation(record);
    await repository.recordSecurityEvent({
      correlationId: 'corr-security-001',
      actorEmployeeCode: 'EMP-200',
      event: {
        eventType: SecurityEventType.PromptInjectionDetected,
        severity: SecuritySeverity.High,
        details: {
          source: 'RETRIEVED_EVIDENCE',
          reasonCode: 'INSTRUCTION_OVERRIDE',
          contentHash: 'sha256-safe-hash',
        },
      },
    });

    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run-test-001',
          threadId: 'thread-test-001',
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
    expect(transaction.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentRunId: undefined,
        correlationId: 'corr-security-001',
        actorEmployeeCode: 'EMP-200',
        eventType: 'PROMPT_INJECTION_DETECTED',
        severity: 'HIGH',
        details: JSON.stringify({
          source: 'RETRIEVED_EVIDENCE',
          reasonCode: 'INSTRUCTION_OVERRIDE',
          contentHash: 'sha256-safe-hash',
        }),
      }),
    });
  });

  it('does not persist an unverified actor employee code', async () => {
    const transaction = {
      agentRun: {
        create: jest.fn().mockResolvedValue({ id: 'database-run-002' }),
      },
      agentRunStep: {
        createMany: jest.fn(),
      },
      securityEvent: {
        createMany: jest.fn(),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const database = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaAgentRunRepository(database);

    await repository.recordInvocation({
      runId: 'run-test-002',
      threadId: 'thread-test-002',
      correlationId: 'corr-test-002',
      triggerType: 'HTTP',
      actorEmployeeCode: 'EMP-999',
      status: 'FAILED',
      steps: [],
      securityEvents: [],
    });

    expect(transaction.employee.findUnique).toHaveBeenCalledWith({
      where: { employeeCode: 'EMP-999' },
      select: { employeeCode: true },
    });
    expect(transaction.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorEmployeeCode: undefined }),
      }),
    );
  });
});
