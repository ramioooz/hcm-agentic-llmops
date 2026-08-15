export enum SecurityEventType {
  AuthorizationDenied = 'AUTHORIZATION_DENIED',
  UnsafeRequestRejected = 'UNSAFE_REQUEST_REJECTED',
  PromptInjectionDetected = 'PROMPT_INJECTION_DETECTED',
}

export enum SecuritySeverity {
  Low = 'LOW',
  Medium = 'MEDIUM',
  High = 'HIGH',
}
