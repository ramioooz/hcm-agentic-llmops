import { MemorySaver } from '@langchain/langgraph';
import { OnboardingAgentService } from '../../src/services/onboarding-agent.service';
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

const employee: EmployeeRecord = {
  employeeCode: 'EMP-201',
  fullName: 'Samira Noor',
  accessRole: 'EMPLOYEE',
  status: 'ACTIVE',
  managerEmployeeCode: 'EMP-200',
  activeReviewPeriod: { endDate: '2026-08-21' },
};

function createConversationService(checkpointer: MemorySaver) {
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
      if (employeeCode === manager.employeeCode) return manager;
      if (employeeCode === employee.employeeCode) return employee;
      return null;
    }),
  };
  const recorder: AgentRunRecorder = {
    recordInvocation: jest.fn().mockResolvedValue(undefined),
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
  };

  return {
    employees,
    normalize,
    recorder,
    service: new OnboardingAgentService(dependencies),
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

  it('denies a different employee identity before resuming protected state', async () => {
    const { service, normalize, employees, recorder } = createConversationService(
      new MemorySaver(),
    );
    await service.invoke(invocation('Review the onboarding status', firstRunId));
    normalize.mockClear();
    (employees.findByEmployeeCode as jest.Mock).mockClear();

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
    const missingCheckpoint = await checkpointer.getTuple({
      configurable: { thread_id: threadId },
    });
    const missingSerialized = JSON.stringify(missingCheckpoint?.checkpoint.channel_values);
    expect(missingSerialized).toContain('employeeId');
    expect(missingSerialized).not.toContain(rawQuery);
    expect(missingSerialized).not.toContain(firstRunId);

    await service.invoke(invocation('EMP-201', secondRunId));

    const checkpoint = await checkpointer.getTuple({ configurable: { thread_id: threadId } });
    const serialized = JSON.stringify(checkpoint?.checkpoint.channel_values);
    expect(serialized).toContain('ownerEmployeeCode');
    expect(serialized).toContain('EMP-200');
    expect(serialized).toContain('ONBOARDING_REVIEW');
    expect(serialized).not.toContain(rawQuery);
    expect(serialized).not.toContain('Samira Noor');
    expect(serialized).not.toContain('samira@example.com');
    expect(serialized).not.toContain(secondRunId);
    expect(serialized).not.toContain('lastNode');
    expect(serialized).not.toContain('outcomeCode');
  });
});
