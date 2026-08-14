import { HcmAgentRoute } from '../enums/hcm-agent.enum';
import { OnboardingGraphNode } from '../enums/onboarding.enum';

export function routeAfterEmployeeLookup(state: {
  route: HcmAgentRoute;
}): OnboardingGraphNode.Calculation | '__end__' {
  return state.route === HcmAgentRoute.Calculate ? OnboardingGraphNode.Calculation : '__end__';
}

export function routeAfterOnboardingCalculation(state: {
  route: HcmAgentRoute;
}): OnboardingGraphNode.ManagerNotification | '__end__' {
  return state.route === HcmAgentRoute.Notify ? OnboardingGraphNode.ManagerNotification : '__end__';
}
