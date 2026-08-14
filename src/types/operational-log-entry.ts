export type OperationalLogEntry = {
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
    | 'knowledge.trace.failed';
  correlationId: string;
  runId?: string;
  status?: string;
  code?: string;
  httpStatus?: number;
  query?: string;
  details?: Record<string, unknown>;
};
