type OperationalLogFields = {
  runId?: string;
  status?: string;
  code?: string;
  message?: string;
  httpStatus?: number;
  query?: string;
  details?: Record<string, unknown>;
};

type CorrelatedOperationalLogEntry = OperationalLogFields & {
  event:
    | 'agent.invoke.started'
    | 'agent.invoke.rejected'
    | 'agent.invoke.completed'
    | 'agent.invoke.failed'
    | 'mcp.request.started'
    | 'mcp.request.rejected'
    | 'mcp.request.completed'
    | 'mcp.request.failed'
    | 'agent.approval.started'
    | 'agent.approval.completed'
    | 'agent.approval.failed'
    | 'leave.document.served'
    | 'leave.document.rejected'
    | 'leave.document.failed'
    | 'knowledge.security.detected'
    | 'knowledge.trace.failed'
    | 'knowledge.trace.skipped';
  correlationId: string;
};

type StartupOperationalLogEntry = OperationalLogFields & {
  event: 'knowledge.trace.disabled';
  correlationId?: never;
};

export type OperationalLogEntry = CorrelatedOperationalLogEntry | StartupOperationalLogEntry;
