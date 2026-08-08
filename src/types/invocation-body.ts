export type InvocationBody = {
  status: string;
  message: string;
  runId: string;
  correlationId: string;
  [key: string]: unknown;
};
