export type OperationalLogEntry = {
  event:
    | 'agent.invoke.started'
    | 'agent.invoke.rejected'
    | 'agent.invoke.completed'
    | 'agent.invoke.failed';
  correlationId: string;
  runId?: string;
  status?: string;
  code?: string;
  httpStatus?: number;
  query?: string;
  details?: Record<string, unknown>;
};
