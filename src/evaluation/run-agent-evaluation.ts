import 'dotenv/config';
import { Client } from 'langsmith';
import { runOfflineAgentEvaluation } from './onboarding-agent.evaluation';

async function main(): Promise<void> {
  const report = await runOfflineAgentEvaluation();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (process.env.LANGSMITH_EVALUATION_UPLOAD === 'true') {
    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error('LANGSMITH_API_KEY is required when LANGSMITH_EVALUATION_UPLOAD=true');
    }
    const client = new Client({
      apiKey,
      autoBatchTracing: false,
      omitTracedRuntimeInfo: true,
    });
    await client.createRun({
      name: report.suite,
      run_type: 'chain',
      project_name: process.env.LANGSMITH_PROJECT ?? 'hcm-agentic-api',
      inputs: { suite: report.suite },
      outputs: { summary: report.summary, cases: report.cases },
      extra: { metadata: { evaluationMode: 'offline-fakes' } },
    });
  }

  if (report.summary.failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'AGENT_EVALUATION_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
