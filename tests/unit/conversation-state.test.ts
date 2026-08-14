import { MemorySaver } from '@langchain/langgraph';
import { HcmAgentService } from '../../src/services/hcm-agent.service';
import type { AgentRunRecorder } from '../../src/types/agent-run-recorder';
import type { EmployeeReader } from '../../src/types/employee-reader';
import type { EmployeeRecord } from '../../src/types/employee-record';
import type { HcmIntent } from '../../src/types/hcm-intent';

const threadId = '8b8a6d62-bf1c-4abf-9968-84b8e23b58cb';
const firstRunId = 'b4b012a7-740a-49c0-9ca5-f83485db7b86';
const secondRunId = '1ea9fcad-8a7a-472e-a4b8-119d3980df2e';

const manager: EmployeeRecord = {
  employeeCode: 'EMP-200',
  fullName: 'Omar Malik',
  accessRole: 'MANAGER',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-100',
  activeReviewPeriod: null,
};

const hr: EmployeeRecord = {
  employeeCode: 'EMP-100',
  fullName: 'Nadia Rahman',
  accessRole: 'HR',
  status: 'ACTIVE',
  managerEmployeeCode: null,
  activeReviewPeriod: null,
};

const employee: EmployeeRecord = {
  employeeCode: 'EMP-201',
  fullName: 'Samira Noor',
  accessRole: 'EMPLOYEE',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-200',
  activeReviewPeriod: { endDate: '2026-08-21' },
};

function createConversationService(
  checkpointer: MemorySaver,
  options: { auditOwners?: Map<string, string> } = {},
) {
  const auditOwners = options.auditOwners ?? new Map<string, string>();
  const normalize = jest.fn<Promise<HcmIntent>, [string]>(async (query) => {
    if (query === 'Review the onboarding status') {
      return {
        intent: 'ONBOARDING_REVIEW',
        employeeCode: null,
        thresholdDays: 30,
        requestedAction: 'REVIEW_ONLY',
        missingFields: ['employeeId'],
      };
    }

    return {
      intent: 'UNSUPPORTED',
      employeeCode: null,
      thresholdDays: null,
      requestedAction: null,
      missingFields: [],
    };
  });
  const employees: EmployeeReader = {
    findByEmployeeCode: jest.fn(async (employeeCode: string) => {
      if (employeeCode === hr.employeeCode) return hr;
      if (employeeCode === manager.employeeCode) return manager;
      if (employeeCode === employee.employeeCode) return employee;
      return null;
    }),
  };
  const recorder: AgentRunRecorder = {
    recordInvocation: jest.fn(async (record) => {
      if (record.actorEmployeeCode && !auditOwners.has(record.threadId)) {
        auditOwners.set(record.threadId, record.actorEmployeeCode);
      }
    }),
  };
  const threadOwnership = {
    findOwnerEmployeeCodeByThreadId: jest.fn(async (candidateThreadId: string) =>
      auditOwners.get(candidateThreadId),
    ),
    resolveCanonicalOwner: jest.fn(async (employeeCode: string) => {
      const canonical = [hr, manager, employee].find(
        (candidate) => candidate.employeeCode === employeeCode,
      );
      return canonical
        ? {
            employeeCode: canonical.employeeCode,
            bindingId: `internal-owner-${canonical.employeeCode.slice('EMP-'.length)}`,
          }
        : null;
    }),
  };
  const dependencies = {
    employees,
    clock: { today: () => '2026-08-07' },
    recorder,
    normalizer: { normalize },
    notifications: {
      send: jest.fn().mockResolvedValue({ notificationId: 'unused' }),
    },
    checkpointer,
    threadOwnership,
  };

  return {
    employees,
    normalize,
    recorder,
    threadOwnership,
    service: new HcmAgentService(dependencies),
  };
}

function invocation(query: string, runId: string, actorEmployeeCode = 'EMP-200') {
  return {
    query,
    actorEmployeeCode,
    correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    threadId,
    runId,
  };
}

describe('durable conversation state', () => {
  it('continues a missing-employee request on the same thread with a new run', async () => {
    const { service } = createConversationService(new MemorySaver());

    const first = await service.invoke(invocation('Review the onboarding status', firstRunId));
    const second = await service.invoke(invocation('EMP-201', secondRunId));

    expect(first.body).toMatchObject({
      status: 'NEED_MORE_INFORMATION',
      threadId,
      runId: firstRunId,
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
    });
    expect(second.body).toMatchObject({
      status: 'COMPLETED',
      threadId,
      runId: secondRunId,
      correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      data: { employeeCode: 'EMP-201' },
    });
    expect(first.body.runId).not.toBe(second.body.runId);
  });

  it('denies a known audit-owner mismatch before loading protected checkpoint state', async () => {
    const checkpointer = new MemorySaver();
    const checkpointRead = jest
      .spyOn(checkpointer, 'getTuple')
      .mockRejectedValue(new Error('PROTECTED_CHECKPOINT_SHOULD_NOT_LOAD'));
    const { service, normalize, employees, recorder } = createConversationService(checkpointer, {
      auditOwners: new Map([[threadId, 'EMP-200']]),
    });

    const result = await service.invoke(invocation('EMP-201', secondRunId, 'EMP-100'));

    expect(result).toEqual({
      httpStatus: 403,
      body: {
        status: 'FAILED',
        code: 'THREAD_IDENTITY_MISMATCH',
        message: 'This conversation belongs to a different employee identity.',
        threadId,
        runId: secondRunId,
        correlationId: '4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0',
      },
    });
    expect(normalize).not.toHaveBeenCalled();
    expect(employees.findByEmployeeCode).not.toHaveBeenCalled();
    expect(checkpointRead).not.toHaveBeenCalled();
    expect(recorder.recordInvocation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadId,
        runId: secondRunId,
        status: 'REJECTED',
        steps: [
          expect.objectContaining({
            stepName: 'thread_identity_check',
            outcomeCode: 'THREAD_IDENTITY_MISMATCH',
          }),
        ],
        securityEvents: [expect.objectContaining({ eventType: 'AUTHORIZATION_DENIED' })],
      }),
    );
  });

  it('checkpoints normalized continuation fields without transient request or employee data', async () => {
    const checkpointer = new MemorySaver();
    const { service } = createConversationService(checkpointer);
    const rawQuery = 'Review the onboarding status';

    await service.invoke(invocation(rawQuery, firstRunId));
    await service.invoke(invocation('EMP-201', secondRunId));

    const historicalCheckpoints = [];
    for await (const checkpoint of checkpointer.list({
      configurable: { thread_id: threadId },
    })) {
      historicalCheckpoints.push(checkpoint.checkpoint.channel_values);
    }
    const serialized = JSON.stringify(historicalCheckpoints);
    expect(serialized).toContain('ownerBindingId');
    expect(serialized).toContain('internal-owner-200');
    expect(serialized).toContain('pendingIntent');
    expect(serialized).toContain('employeeId');
    expect(serialized).not.toMatch(/EMP-\d+/);
    expect(serialized).not.toContain(rawQuery);
    expect(serialized).not.toContain('Samira Noor');
    expect(serialized).not.toContain('samira@example.com');
    expect(serialized).not.toContain(secondRunId);
    expect(serialized).not.toContain('lastNode');
    expect(serialized).not.toContain('outcomeCode');
  });

  it('serializes concurrent first claims so the completed audit owner decides the second request', async () => {
    const checkpointer = new MemorySaver();
    const originalGetTuple = checkpointer.getTuple.bind(checkpointer);
    let releaseFirstRead: (() => void) | undefined;
    let markFirstReadStarted: (() => void) | undefined;
    const firstReadStarted = new Promise<void>((resolve) => {
      markFirstReadStarted = resolve;
    });
    const holdFirstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const checkpointRead = jest
      .spyOn(checkpointer, 'getTuple')
      .mockImplementation(async (config) => {
        if (checkpointRead.mock.calls.length === 1) {
          markFirstReadStarted?.();
          await holdFirstRead;
        }
        return originalGetTuple(config);
      });
    const { service, normalize } = createConversationService(checkpointer);

    const firstRequest = service.invoke(
      invocation('Review the onboarding status', firstRunId, 'EMP-200'),
    );
    await firstReadStarted;
    const secondRequest = service.invoke(invocation('EMP-201', secondRunId, 'EMP-100'));

    expect(checkpointRead).toHaveBeenCalledTimes(1);
    releaseFirstRead?.();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first.body.status).toBe('NEED_MORE_INFORMATION');
    expect(second.body).toMatchObject({
      status: 'FAILED',
      code: 'THREAD_IDENTITY_MISMATCH',
    });
    expect(normalize).toHaveBeenCalledTimes(1);
  });
});
