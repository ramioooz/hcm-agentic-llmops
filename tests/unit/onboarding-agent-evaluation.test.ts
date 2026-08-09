import { runOfflineAgentEvaluation } from '../../src/evaluation/onboarding-agent.evaluation';

describe('offline onboarding agent evaluation', () => {
  it('runs the bounded fake-only cases and returns a stable PII-free report', async () => {
    const report = await runOfflineAgentEvaluation();

    expect(report).toEqual({
      suite: 'onboarding-agent-v1',
      summary: { total: 7, passed: 7, failed: 0 },
      cases: [
        {
          caseId: 'intent-normalization',
          expectedOutcome: 'COMPLETED',
          actualOutcome: 'COMPLETED',
          passed: true,
        },
        {
          caseId: 'missing-data',
          expectedOutcome: 'NEED_MORE_INFORMATION',
          actualOutcome: 'NEED_MORE_INFORMATION',
          passed: true,
        },
        {
          caseId: 'unsupported-request',
          expectedOutcome: 'UNSUPPORTED_REQUEST',
          actualOutcome: 'UNSUPPORTED_REQUEST',
          passed: true,
        },
        {
          caseId: 'unsafe-request',
          expectedOutcome: 'UNSAFE_REQUEST_REJECTED',
          actualOutcome: 'UNSAFE_REQUEST_REJECTED',
          passed: true,
        },
        {
          caseId: 'authorization-denied',
          expectedOutcome: 'AUTHORIZATION_DENIED',
          actualOutcome: 'AUTHORIZATION_DENIED',
          passed: true,
        },
        {
          caseId: 'manager-notification',
          expectedOutcome: 'MANAGER_NOTIFIED',
          actualOutcome: 'MANAGER_NOTIFIED',
          passed: true,
        },
        {
          caseId: 'tool-failure',
          expectedOutcome: 'INTERNAL_ERROR',
          actualOutcome: 'INTERNAL_ERROR',
          passed: true,
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('EMP-');
    expect(JSON.stringify(report)).not.toContain('Samira');
    expect(JSON.stringify(report)).not.toContain('@');
    expect(JSON.stringify(report)).not.toContain('query');
  });
});
