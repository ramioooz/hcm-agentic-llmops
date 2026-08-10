import type { SecurityEventRecord } from './security-event-record';

export interface SecurityEventRecorder {
  recordSecurityEvent(input: {
    correlationId: string;
    actorEmployeeCode?: string;
    event: SecurityEventRecord;
  }): Promise<void>;
}
