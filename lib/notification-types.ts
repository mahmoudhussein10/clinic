export type NotificationType =
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_UPDATED"
  | "APPOINTMENT_REMINDER"
  | "PATIENT_CREATED"
  | "PATIENT_ARRIVED"
  | "SYSTEM";

export type NotificationPriority = "normal" | "high" | "urgent";

export type ClinicNotification = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  isRead: boolean;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPreferences = {
  newBookings: boolean;
  cancellations: boolean;
  appointmentUpdates: boolean;
  patientArrivals: boolean;
  appointmentReminders: boolean;
  reminderMinutes: 15 | 30 | 60;
  pushEnabled: boolean;
  inAppEnabled: boolean;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceName?: string;
};
