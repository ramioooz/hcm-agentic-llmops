import type { AgentProgressEvent } from './agent-progress-event';

export type AgentEventSink = (event: AgentProgressEvent) => void;
