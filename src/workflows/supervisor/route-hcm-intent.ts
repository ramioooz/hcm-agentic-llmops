import type { HcmIntent } from '../../types/hcm-intent';

export function routeHcmIntent(intent: HcmIntent): 'ONBOARDING' | 'LEAVE' | 'UNSUPPORTED' {
  if (intent.intent === 'ONBOARDING_REVIEW') return 'ONBOARDING';
  return intent.intent === 'LEAVE_REQUEST' ? 'LEAVE' : 'UNSUPPORTED';
}
