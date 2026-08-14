export type ManagerNotificationSender = {
  send(input: {
    managerEmployeeCode: string;
    targetEmployeeCode: string;
  }): Promise<{ notificationId: string }>;
};
