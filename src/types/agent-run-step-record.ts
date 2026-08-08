export type AgentRunStepRecord = {
  stepName: string;
  status: 'COMPLETED' | 'REJECTED' | 'FAILED';
  outcomeCode?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
};
