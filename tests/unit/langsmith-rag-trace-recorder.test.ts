import { LangSmithRagTraceRecorder } from '../../src/observability/langsmith-rag-trace-recorder';
import type { RagTrace } from '../../src/types/rag-trace';

describe('LangSmithRagTraceRecorder', () => {
  it('creates the required ordered hierarchy for a RAG parent run and its stages', async () => {
    const batches: Array<{ runCreates: Array<Record<string, unknown>> }> = [];
    const recorder = new LangSmithRagTraceRecorder(
      {
        batchIngestRuns: async (batch) => {
          batches.push(batch);
        },
      },
      'hcm-agentic-llmops-test',
    );
    const trace: RagTrace = {
      traceId: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      actorEmployeeCode: 'EMP-201',
      source: 'HTTP',
      question: 'What is the remote-work policy?',
      answer: 'Employees may work remotely two days each week.',
      candidateLimit: 8,
      minimumSimilarity: 0.5,
      evidenceLimit: 5,
      embeddingModel: 'text-embedding-3-small',
      answerModel: 'gpt-5.4-mini',
      retrievedChunks: [],
      citations: [],
      resultStatus: 'ANSWERED',
      startedAtMs: 1_000,
      endedAtMs: 1_200,
      failureCode: null,
      stages: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'rag.query_guard',
          startedAtMs: 1_100,
          endedAtMs: 1_110,
          status: 'COMPLETED',
          inputs: { source: 'HTTP' },
          outputs: { safe: true },
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'rag.query_embedding',
          startedAtMs: 1_100,
          endedAtMs: 1_120,
          status: 'COMPLETED',
          inputs: { model: 'text-embedding-3-small' },
          outputs: { dimensions: 1_536 },
        },
      ],
    };

    await recorder.record(trace);

    expect(batches).toHaveLength(1);
    const runs = batches[0]?.runCreates ?? [];
    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({
      id: trace.traceId,
      session_name: 'hcm-agentic-llmops-test',
      trace_id: trace.traceId,
      dotted_order: '19700101T000001000001Z11111111-1111-4111-8111-111111111111',
    });
    expect(runs[1]).toMatchObject({
      id: trace.stages[0]?.id,
      session_name: 'hcm-agentic-llmops-test',
      parent_run_id: trace.traceId,
      trace_id: trace.traceId,
      dotted_order:
        '19700101T000001000001Z11111111-1111-4111-8111-111111111111.19700101T000001100001Z33333333-3333-4333-8333-333333333333',
    });
    expect(runs[2]).toMatchObject({
      id: trace.stages[1]?.id,
      session_name: 'hcm-agentic-llmops-test',
      parent_run_id: trace.traceId,
      trace_id: trace.traceId,
      dotted_order:
        '19700101T000001000001Z11111111-1111-4111-8111-111111111111.19700101T000001100002Z44444444-4444-4444-8444-444444444444',
    });
  });
});
