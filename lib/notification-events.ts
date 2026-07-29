import "server-only";

import type { Appointment } from "./clinic-types";
import type { NotificationType, NotificationPriority } from "./notification-types";
import { clinicRecipients, createNotification } from "./notification-db";
import { sendPushSafely } from "./push-service";

type EventKind = "created"|"confirmed"|"cancelled"|"updated"|"reminder"|"patient_created"|"arrived";
const dateFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone:"Africa/Cairo", weekday:"long", day:"numeric", month:"long" });
const timeFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone:"Africa/Cairo", hour:"numeric", minute:"2-digit", hour12:true });

function appointmentWhen(item: Appointment) {
  const date = dateFormat.format(new Date(`${item.appointmentDate}T12:00:00+03:00`));
  const time = timeFormat.format(new Date(`${item.appointmentDate}T${item.startTime}:00+03:00`));
  return `${date} الساعة ${time}`;
}

const config: Record<EventKind, { type:NotificationType; title:string; priority:NotificationPriority; pref:"new_bookings"|"cancellations"|"appointment_updates"|"appointment_reminders"|"patient_arrivals" }> = {
  created:{type:"APPOINTMENT_CREATED",title:"حجز جديد",priority:"high",pref:"new_bookings"},
  confirmed:{type:"APPOINTMENT_CONFIRMED",title:"تم تأكيد موعد",priority:"normal",pref:"appointment_updates"},
  cancelled:{type:"APPOINTMENT_CANCELLED",title:"تم إلغاء موعد",priority:"high",pref:"cancellations"},
  updated:{type:"APPOINTMENT_UPDATED",title:"تم تعديل موعد",priority:"normal",pref:"appointment_updates"},
  reminder:{type:"APPOINTMENT_REMINDER",title:"موعد قريب",priority:"high",pref:"appointment_reminders"},
  patient_created:{type:"PATIENT_CREATED",title:"مريض جديد",priority:"normal",pref:"new_bookings"},
  arrived:{type:"PATIENT_ARRIVED",title:"وصل المريض",priority:"urgent",pref:"patient_arrivals"},
};

function message(kind: EventKind, appointment: Appointment) {
  if (kind === "created") return `حجز ${appointment.patientName} موعدًا جديدًا يوم ${appointmentWhen(appointment)}.`;
  if (kind === "confirmed") return `تم تأكيد موعد ${appointment.patientName} يوم ${appointmentWhen(appointment)}.`;
  if (kind === "cancelled") return `تم إلغاء موعد ${appointment.patientName} الذي كان مقررًا ${appointmentWhen(appointment)}.`;
  if (kind === "updated") return `تم تعديل موعد ${appointment.patientName} إلى ${appointmentWhen(appointment)}.`;
  if (kind === "reminder") return `موعد ${appointment.patientName} سيبدأ ${appointmentWhen(appointment)}.`;
  if (kind === "patient_created") return `تم تسجيل ${appointment.patientName} كمريض جديد في العيادة.`;
  return `وصل ${appointment.patientName} إلى العيادة لموعد ${appointmentWhen(appointment)}.`;
}

export async function emitAppointmentEvent(kind: EventKind, appointment: Appointment) {
  const meta = config[kind], recipients = await clinicRecipients(appointment.doctorId);
  const actionUrl = `/?view=appointments&date=${encodeURIComponent(appointment.appointmentDate)}&appointment=${encodeURIComponent(appointment.id)}`;
  await Promise.all(recipients.map(async (recipient) => {
    if (!recipient[meta.pref]) return;
    const body = message(kind, appointment);
    if (recipient.in_app_enabled) await createNotification({ userId:recipient.user_id, clinicId:recipient.clinic_id, title:meta.title, message:body, type:meta.type, priority:meta.priority, actionUrl, entityType:"appointment", entityId:appointment.id });
    if (recipient.push_enabled) await sendPushSafely(recipient.user_id, recipient.clinic_id, { title:meta.title, body, url:actionUrl, tag:`appointment-${appointment.id}-${meta.type}`, priority:meta.priority });
  }));
}

export async function emitAppointmentEventSafely(kind: EventKind, appointment: Appointment) {
  try { await emitAppointmentEvent(kind, appointment); }
  catch (error) { console.warn("Appointment notification failed", { kind, appointmentId:appointment.id, error:error instanceof Error ? error.message : "unknown" }); }
}
