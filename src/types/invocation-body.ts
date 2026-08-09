export type InvocationBody = {
  status: string;
  message: string;
  runId: string;
  threadId: string;
  correlationId: string;
  [key: string]: unknown;
};
