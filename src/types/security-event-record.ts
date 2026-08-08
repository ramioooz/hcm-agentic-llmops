export type SecurityEventRecord = {
  eventType: 'AUTHORIZATION_DENIED' | 'UNSAFE_REQUEST_REJECTED' | 'PII_REDACTION_APPLIED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details?: Record<string, unknown>;
};
