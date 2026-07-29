import "server-only";

import { randomUUID } from "node:crypto";
import { ClinicError } from "./clinic-db";
import { getPrisma } from "./prisma";
import { safeInternalUrl, type ClinicContext } from "./clinic-auth";
import type { ClinicNotification, NotificationPreferences, NotificationPriority, NotificationType, PushSubscriptionInput } from "./notification-types";

type NotificationRow = { id:string; title:string; message:string; type:NotificationType; priority:NotificationPriority; is_read:boolean; action_url:string|null; entity_type:string|null; entity_id:string|null; created_at:Date|string; read_at:Date|string|null };
type PreferenceRow = { new_bookings:boolean; cancellations:boolean; appointment_updates:boolean; patient_arrivals:boolean; appointment_reminders:boolean; reminder_minutes:number; push_enabled:boolean; in_app_enabled:boolean };
export type SubscriptionRow = { id:string; endpoint:string; p256dh:string; auth:string };

const mapNotification = (row: NotificationRow): ClinicNotification => ({
  id: row.id, title: row.title, message: row.message, type: row.type, priority: row.priority,
  isRead: row.is_read, actionUrl: row.action_url, entityType: row.entity_type, entityId: row.entity_id,
  createdAt: new Date(row.created_at).toISOString(), readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
});

const mapPreferences = (row: PreferenceRow): NotificationPreferences => ({
  newBookings: row.new_bookings, cancellations: row.cancellations, appointmentUpdates: row.appointment_updates,
  patientArrivals: row.patient_arrivals, appointmentReminders: row.appointment_reminders,
  reminderMinutes: ([15,30,60].includes(Number(row.reminder_minutes)) ? Number(row.reminder_minutes) : 30) as 15|30|60,
  pushEnabled: row.push_enabled, inAppEnabled: row.in_app_enabled,
});

export async function listNotifications(context: ClinicContext, options: { page?:number; pageSize?:number; type?:string; read?:string } = {}) {
  const page = Math.max(1, Number(options.page)||1), pageSize = Math.min(50, Math.max(1, Number(options.pageSize)||15));
  const values: unknown[] = [context.userId, context.clinicId];
  const clauses = ["user_id=$1", "clinic_id=$2"];
  if (options.type && options.type !== "all") { values.push(options.type); clauses.push(`type=$${values.length}`); }
  if (options.read === "read" || options.read === "unread") { values.push(options.read === "read"); clauses.push(`is_read=$${values.length}`); }
  const where = clauses.join(" AND ");
  const countRows = await getPrisma().$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM notifications WHERE ${where}`, ...values);
  values.push(pageSize, (page-1)*pageSize);
  const rows = await getPrisma().$queryRawUnsafe<NotificationRow[]>(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`, ...values);
  const total = Number(countRows[0]?.count || 0);
  return { items: rows.map(mapNotification), page, pageSize, total, pages: Math.max(1, Math.ceil(total/pageSize)) };
}

export async function unreadCount(context: ClinicContext) {
  const rows = await getPrisma().$queryRawUnsafe<Array<{ count: bigint }>>("SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND clinic_id=$2 AND is_read=false", context.userId, context.clinicId);
  return Number(rows[0]?.count || 0);
}

export async function markNotificationRead(context: ClinicContext, id: string) {
  const rows = await getPrisma().$queryRawUnsafe<NotificationRow[]>("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=$1 AND user_id=$2 AND clinic_id=$3 RETURNING *", id, context.userId, context.clinicId);
  if (!rows[0]) throw new ClinicError("NOTIFICATION_NOT_FOUND", "الإشعار غير موجود", 404);
  return mapNotification(rows[0]);
}

export async function markAllNotificationsRead(context: ClinicContext) {
  const count = await getPrisma().$executeRawUnsafe("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=$1 AND clinic_id=$2 AND is_read=false", context.userId, context.clinicId);
  return { updated: count };
}

export async function deleteNotification(context: ClinicContext, id: string) {
  const rows = await getPrisma().$queryRawUnsafe<Array<{id:string}>>("DELETE FROM notifications WHERE id=$1 AND user_id=$2 AND clinic_id=$3 RETURNING id", id, context.userId, context.clinicId);
  if (!rows[0]) throw new ClinicError("NOTIFICATION_NOT_FOUND", "الإشعار غير موجود", 404);
  return { id };
}

export async function getPreferences(context: ClinicContext) {
  const rows = await getPrisma().$queryRawUnsafe<PreferenceRow[]>("SELECT * FROM notification_preferences WHERE user_id=$1 AND clinic_id=$2", context.userId, context.clinicId);
  if (!rows[0]) throw new ClinicError("PREFERENCES_NOT_FOUND", "إعدادات الإشعارات غير موجودة", 404);
  return mapPreferences(rows[0]);
}

export async function updatePreferences(context: ClinicContext, input: Partial<NotificationPreferences>) {
  const current = await getPreferences(context);
  const next = { ...current, ...input };
  if (![15,30,60].includes(Number(next.reminderMinutes))) throw new ClinicError("INVALID_REMINDER_INTERVAL", "مدة التذكير يجب أن تكون 15 أو 30 أو 60 دقيقة");
  const rows = await getPrisma().$queryRawUnsafe<PreferenceRow[]>(`UPDATE notification_preferences SET new_bookings=$1,cancellations=$2,appointment_updates=$3,patient_arrivals=$4,appointment_reminders=$5,reminder_minutes=$6,push_enabled=$7,in_app_enabled=$8,updated_at=CURRENT_TIMESTAMP WHERE user_id=$9 AND clinic_id=$10 RETURNING *`, next.newBookings,next.cancellations,next.appointmentUpdates,next.patientArrivals,next.appointmentReminders,next.reminderMinutes,next.pushEnabled,next.inAppEnabled,context.userId,context.clinicId);
  return mapPreferences(rows[0]);
}

export async function saveSubscription(context: ClinicContext, input: PushSubscriptionInput, userAgent: string) {
  if (!input.endpoint?.startsWith("https://") || !input.keys?.p256dh || !input.keys?.auth) throw new ClinicError("INVALID_PUSH_SUBSCRIPTION", "بيانات اشتراك الإشعارات غير صحيحة");
  const id = `push_${randomUUID()}`;
  await getPrisma().$executeRawUnsafe(`INSERT INTO push_subscriptions(id,user_id,clinic_id,endpoint,p256dh,auth,user_agent,device_name,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,clinic_id=EXCLUDED.clinic_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,device_name=EXCLUDED.device_name,enabled=true,failure_count=0,updated_at=CURRENT_TIMESTAMP`, id,context.userId,context.clinicId,input.endpoint,input.keys.p256dh,input.keys.auth,userAgent.slice(0,500),String(input.deviceName||"").slice(0,100));
  return { enabled: true };
}

export async function removeSubscription(context: ClinicContext, endpoint: string) {
  const count = await getPrisma().$executeRawUnsafe("DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2 AND clinic_id=$3", endpoint, context.userId, context.clinicId);
  return { removed: count > 0 };
}

export async function activeSubscriptions(userId: string, clinicId: string) {
  return getPrisma().$queryRawUnsafe<SubscriptionRow[]>("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1 AND clinic_id=$2 AND enabled=true", userId, clinicId);
}

export async function disableSubscription(id: string) { await getPrisma().$executeRawUnsafe("UPDATE push_subscriptions SET enabled=false,updated_at=CURRENT_TIMESTAMP WHERE id=$1", id); }
export async function touchSubscription(id: string, failed=false) { await getPrisma().$executeRawUnsafe(`UPDATE push_subscriptions SET last_used_at=CURRENT_TIMESTAMP,failure_count=${failed ? "failure_count+1" : "0"},updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id); }

export async function clinicRecipients(clinicId: string) {
  return getPrisma().$queryRawUnsafe<Array<{ user_id:string; clinic_id:string; new_bookings:boolean; cancellations:boolean; appointment_updates:boolean; patient_arrivals:boolean; appointment_reminders:boolean; reminder_minutes:number; push_enabled:boolean; in_app_enabled:boolean }>>(`SELECT u.id AS user_id,u.clinic_id,p.new_bookings,p.cancellations,p.appointment_updates,p.patient_arrivals,p.appointment_reminders,p.reminder_minutes,p.push_enabled,p.in_app_enabled FROM clinic_users u JOIN notification_preferences p ON p.user_id=u.id WHERE u.clinic_id=$1`, clinicId);
}

export async function createNotification(input: { userId:string; clinicId:string; title:string; message:string; type:NotificationType; priority?:NotificationPriority; actionUrl?:string|null; entityType?:string; entityId?:string }) {
  const id = `notification_${randomUUID()}`;
  await getPrisma().$executeRawUnsafe("INSERT INTO notifications(id,user_id,clinic_id,title,message,type,priority,action_url,entity_type,entity_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)", id,input.userId,input.clinicId,input.title.slice(0,120),input.message.slice(0,500),input.type,input.priority||"normal",safeInternalUrl(input.actionUrl),input.entityType||null,input.entityId||null);
  return id;
}
