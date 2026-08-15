import { HcmAgentRoute, HcmGraphNode, HcmIntentType, HcmWorker } from '../enums/hcm-agent.enum';
import type { HcmIntent } from '../types/hcm-intent';

export function routeHcmIntent(intent: HcmIntent): HcmWorker {
  if (intent.intent === HcmIntentType.OnboardingReview) return HcmWorker.Onboarding;
  if (intent.intent === HcmIntentType.LeaveRequest) return HcmWorker.Leave;
  return HcmWorker.Unsupported;
}

export function routeAfterRequestGuard(state: {
  route: HcmAgentRoute;
}): 'intent_normalization' | 'response_audit' {
  return state.route === HcmAgentRoute.Respond ? 'response_audit' : 'intent_normalization';
}

export function routeAfterIntentNormalization(state: {
  route: HcmAgentRoute;
}): 'routing' | 'response_audit' {
  return state.route === HcmAgentRoute.Respond ? 'response_audit' : 'routing';
}

export function routeAfterSupervisor(state: {
  route: HcmAgentRoute;
}): HcmGraphNode.Onboarding | HcmGraphNode.Leave | HcmGraphNode.ResponseAudit {
  if (state.route === HcmAgentRoute.Leave) return HcmGraphNode.Leave;
  if (state.route === HcmAgentRoute.Onboarding) return HcmGraphNode.Onboarding;
  return HcmGraphNode.ResponseAudit;
}
