export enum HcmIntentType {
  OnboardingReview = 'ONBOARDING_REVIEW',
  LeaveRequest = 'LEAVE_REQUEST',
  Unsupported = 'UNSUPPORTED',
}

export enum HcmWorker {
  Onboarding = 'ONBOARDING',
  Leave = 'LEAVE',
  Unsupported = 'UNSUPPORTED',
}

export enum HcmAgentRoute {
  Continue = 'CONTINUE',
  Respond = 'RESPOND',
  Onboarding = 'ONBOARDING',
  Leave = 'LEAVE',
  Calculate = 'CALCULATE',
  Notify = 'NOTIFY',
  Approval = 'APPROVAL',
}

export enum HcmGraphNode {
  RequestGuard = 'request_guard',
  IntentNormalization = 'intent_normalization',
  Routing = 'routing',
  Onboarding = 'onboarding',
  Leave = 'leave',
  ResponseAudit = 'response_audit',
}
