import type { SecurityEventType, SecuritySeverity } from '../enums/security.enum';

export type SecurityEventRecord = {
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  details?: Record<string, unknown>;
};
