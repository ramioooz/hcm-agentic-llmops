import {
  uploadAgentEvaluationReport,
  type AgentEvaluationRun,
} from '../../src/evaluation/agent-evaluation-upload';
import type { AgentEvaluationReport } from '../../src/evaluation/onboarding-agent.evaluation';

const report: AgentEvaluationReport = {
  suite: 'onboarding-agent-v1',
  summary: { total: 1, passed: 1, failed: 0 },
  cases: [
    {
      caseId: 'safe-case',
      expectedOutcome: 'COMPLETED',
      actualOutcome: 'COMPLETED',
      passed: true,
    },
  ],
};

describe('agent evaluation upload', () => {
  it('creates one completed run whose timestamps match the measured duration', async () => {
    const runs: AgentEvaluationRun[] = [];

    await uploadAgentEvaluationReport({
      client: {
        createRun: async (run) => {
          runs.push(run);
        },
      },
      projectName: 'hcm-agentic-llmops-test',
      report,
      startTime: 500,
      endTime: 560,
    });

    expect(runs).toEqual([
      {
        name: 'onboarding-agent-v1',
        run_type: 'chain',
        project_name: 'hcm-agentic-llmops-test',
        start_time: 500,
        end_time: 560,
        inputs: { suite: 'onboarding-agent-v1' },
        outputs: { summary: report.summary, cases: report.cases },
        extra: { metadata: { evaluationMode: 'offline-fakes' } },
      },
    ]);
    expect((runs[0]?.end_time ?? 0) - (runs[0]?.start_time ?? 0)).toBe(60);
  });
});
