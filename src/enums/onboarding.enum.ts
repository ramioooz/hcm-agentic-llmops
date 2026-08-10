export enum OnboardingReviewAction {
  ReviewOnly = 'REVIEW_ONLY',
  NotifyManager = 'NOTIFY_MANAGER',
}

export const ONBOARDING_REVIEW_ACTION_VALUES: readonly ['REVIEW_ONLY', 'NOTIFY_MANAGER'] = [
  OnboardingReviewAction.ReviewOnly,
  OnboardingReviewAction.NotifyManager,
];

export enum OnboardingGraphNode {
  EmployeeLookup = 'employee_lookup',
  Calculation = 'onboarding_calculation',
  ManagerNotification = 'manager_notification',
}
