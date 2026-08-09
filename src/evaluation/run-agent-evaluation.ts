import 'dotenv/config';
import { Client } from 'langsmith';
import { assertAutomaticTracingDisabled } from '../observability/automatic-tracing-guard';
import { uploadAgentEvaluationReport } from './agent-evaluation-upload';
import { runOfflineAgentEvaluation } from './onboarding-agent.evaluation';

assertAutomaticTracingDisabled(process.env);

async function main(): Promise<void> {
  const startTime = Date.now();
  const report = await runOfflineAgentEvaluation();
  const endTime = Math.max(startTime, Date.now());
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
    await uploadAgentEvaluationReport({
      client,
      projectName: process.env.LANGSMITH_PROJECT ?? 'hcm-agentic-llmops',
      report,
      startTime,
      endTime,
    });
  }

  if (report.summary.failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'AGENT_EVALUATION_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
