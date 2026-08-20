const clientConstructor = jest.fn();

jest.mock('langsmith', () => ({
  Client: clientConstructor,
}));

import { createLangSmithAgentTraceRecorder } from '../../src/observability/langsmith-agent-trace-recorder';
import { createLangSmithRagTraceRecorder } from '../../src/observability/langsmith-rag-trace-recorder';

describe('LangSmith trace-recorder factories', () => {
  it('passes the configured regional endpoint to both LangSmith clients', () => {
    const endpoint = 'https://aws.api.smith.langchain.com';
    const options = {
      apiKey: 'unit-test-langsmith-key',
      endpoint,
      projectName: 'hcm-agentic-llmops-test',
    };

    createLangSmithAgentTraceRecorder(options);
    createLangSmithRagTraceRecorder(options);

    expect(clientConstructor).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ apiUrl: endpoint }),
    );
    expect(clientConstructor).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ apiUrl: endpoint }),
    );
  });
});
