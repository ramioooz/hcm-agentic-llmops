import { Client } from 'langsmith';
import { convertToDottedOrderFormat } from 'langsmith/run_trees';
import type { RagTrace } from '../types/rag-trace';
import type { RagTraceRecorder } from '../types/rag-trace-recorder';

type LangSmithRagRun = {
  id: string;
  name: string;
  run_type: 'chain';
  project_name: string;
  start_time: number;
  end_time: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  extra: { metadata: Record<string, unknown> };
  parent_run_id?: string;
  trace_id?: string;
  dotted_order?: string;
};

type LangSmithRagClient = {
  createRun(run: LangSmithRagRun): Promise<void>;
};

export class LangSmithRagTraceRecorder implements RagTraceRecorder {
  public constructor(
    private readonly client: LangSmithRagClient,
    private readonly projectName: string,
  ) {}

  public async record(trace: RagTrace): Promise<void> {
    const rootDottedOrder = convertToDottedOrderFormat(
      trace.startedAtMs,
      trace.traceId,
    ).dottedOrder;
    await this.client.createRun({
      id: trace.traceId,
      name: 'hcm-rag-query',
      run_type: 'chain',
      project_name: this.projectName,
      start_time: trace.startedAtMs,
      end_time: trace.endedAtMs,
      inputs: {
        question: trace.question,
        correlationId: trace.correlationId,
        actorEmployeeCode: trace.actorEmployeeCode,
        source: trace.source,
        documentId: trace.documentId,
        candidateLimit: trace.candidateLimit,
        minimumSimilarity: trace.minimumSimilarity,
        evidenceLimit: trace.evidenceLimit,
      },
      outputs: {
        answer: trace.answer,
        resultStatus: trace.resultStatus,
        retrievedChunks: trace.retrievedChunks,
        citations: trace.citations,
        totalLatencyMs: trace.endedAtMs - trace.startedAtMs,
        failureCode: trace.failureCode,
      },
      extra: {
        metadata: {
          embeddingModel: trace.embeddingModel,
          answerModel: trace.answerModel,
        },
      },
      trace_id: trace.traceId,
      dotted_order: rootDottedOrder,
    });

    for (const [index, stage] of trace.stages.entries()) {
      const stageDottedOrder = convertToDottedOrderFormat(
        stage.startedAtMs,
        stage.id,
        index + 1,
      ).dottedOrder;
      await this.client.createRun({
        id: stage.id,
        name: stage.name,
        run_type: 'chain',
        project_name: this.projectName,
        start_time: stage.startedAtMs,
        end_time: stage.endedAtMs,
        inputs: stage.inputs,
        outputs: stage.outputs,
        extra: {
          metadata: {
            status: stage.status,
            latencyMs: stage.endedAtMs - stage.startedAtMs,
            failureCode: stage.failureCode,
          },
        },
        parent_run_id: trace.traceId,
        trace_id: trace.traceId,
        dotted_order: `${rootDottedOrder}.${stageDottedOrder}`,
      });
    }
  }
}

export function createLangSmithRagTraceRecorder(input: {
  apiKey: string;
  projectName: string;
}): RagTraceRecorder {
  return new LangSmithRagTraceRecorder(
    new Client({
      apiKey: input.apiKey,
      autoBatchTracing: false,
      omitTracedRuntimeInfo: true,
    }),
    input.projectName,
  );
}
