import type { AgentEvaluationReport } from './onboarding-agent.evaluation';

export type AgentEvaluationRun = {
  name: string;
  run_type: 'chain';
  project_name: string;
  start_time: number;
  end_time: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  extra: { metadata: Record<string, unknown> };
};

type AgentEvaluationRunClient = {
  createRun(run: AgentEvaluationRun): Promise<void>;
};

export async function uploadAgentEvaluationReport(input: {
  client: AgentEvaluationRunClient;
  projectName: string;
  report: AgentEvaluationReport;
  startTime: number;
  endTime: number;
}): Promise<void> {
  await input.client.createRun({
    name: input.report.suite,
    run_type: 'chain',
    project_name: input.projectName,
    start_time: input.startTime,
    end_time: Math.max(input.startTime, input.endTime),
    inputs: { suite: input.report.suite },
    outputs: { summary: input.report.summary, cases: input.report.cases },
    extra: { metadata: { evaluationMode: 'offline-fakes' } },
  });
}
