export type SecurityEventRecord = {
  eventType: 'AUTHORIZATION_DENIED' | 'UNSAFE_REQUEST_REJECTED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details?: Record<string, unknown>;
};
