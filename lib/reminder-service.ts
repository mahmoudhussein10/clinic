import "server-only";

import { randomUUID } from "node:crypto";
import { getAppointment } from "./clinic-db";
import { getPrisma } from "./prisma";
import { createNotification } from "./notification-db";
import { sendPushSafely } from "./push-service";

type DueRow = { appointment_id:string; user_id:string; clinic_id:string; reminder_minutes:number; push_enabled:boolean; in_app_enabled:boolean };

export async function processAppointmentReminders() {
  const due = await getPrisma().$queryRawUnsafe<DueRow[]>(`
    SELECT a.id AS appointment_id,p.user_id,p.clinic_id,p.reminder_minutes,p.push_enabled,p.in_app_enabled
    FROM appointments a
    JOIN notification_preferences p ON p.clinic_id=a.doctor_id
    WHERE p.appointment_reminders=true
      AND a.status IN ('pending','confirmed')
      AND (a.appointment_date + a.start_time::time) BETWEEN
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo') + make_interval(mins => p.reminder_minutes - 3)) AND
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo') + make_interval(mins => p.reminder_minutes + 3))
      AND NOT EXISTS (
        SELECT 1 FROM reminder_deliveries d
        WHERE d.appointment_id=a.id AND d.user_id=p.user_id AND d.interval_minutes=p.reminder_minutes
      )
  `);
  let delivered = 0;
  for (const item of due) {
    const claimed = await getPrisma().$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO reminder_deliveries(id,appointment_id,user_id,clinic_id,interval_minutes,delivered_at,created_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(appointment_id,user_id,interval_minutes) DO NOTHING RETURNING id`, `reminder_${randomUUID()}`,item.appointment_id,item.user_id,item.clinic_id,item.reminder_minutes);
    if (!claimed[0]) continue;
    const appointment = await getAppointment(item.appointment_id);
    const title = `موعد خلال ${item.reminder_minutes} دقيقة`;
    const body = `موعد ${appointment.patientName} الساعة ${appointment.startTime}.`;
    const url = `/?view=appointments&date=${appointment.appointmentDate}&appointment=${appointment.id}`;
    if (item.in_app_enabled) await createNotification({userId:item.user_id,clinicId:item.clinic_id,title,message:body,type:"APPOINTMENT_REMINDER",priority:"high",actionUrl:url,entityType:"appointment",entityId:appointment.id});
    if (item.push_enabled) await sendPushSafely(item.user_id,item.clinic_id,{title,body,url,tag:`reminder-${appointment.id}-${item.reminder_minutes}`});
    delivered += 1;
  }
  return { checked: due.length, delivered };
}
