import { randomUUID } from 'node:crypto';
import type { ManagerNotificationSender } from '../types/manager-notification-sender';

export class DevelopmentManagerNotification implements ManagerNotificationSender {
  public async send(): Promise<{ notificationId: string }> {
    return { notificationId: `dev-${randomUUID()}` };
  }
}
