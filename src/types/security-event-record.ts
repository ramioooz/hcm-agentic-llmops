export type SecurityEventRecord = {
  eventType: 'AUTHORIZATION_DENIED' | 'UNSAFE_REQUEST_REJECTED' | 'PROMPT_INJECTION_DETECTED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details?: Record<string, unknown>;
};
