import type { Appointment, Doctor } from "./clinic-types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function formatBookingDate(date: string) {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatBookingTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(2026, 0, 1, hour, minute));
}

export async function sendBookingNotification(doctor: Doctor, appointment: Appointment) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = doctor.email.trim();
  if (!apiKey || !recipient) return { sent: false, reason: !apiKey ? "provider_not_configured" : "recipient_not_configured" } as const;

  const patientName = escapeHtml(appointment.patientName);
  const patientPhone = escapeHtml(appointment.patientPhone);
  const clinicName = escapeHtml(doctor.clinicName);
  const date = formatBookingDate(appointment.appointmentDate);
  const time = formatBookingTime(appointment.startTime);
  const notes = appointment.notes ? escapeHtml(appointment.notes) : "لا توجد ملاحظات";
  const from = process.env.RESEND_FROM_EMAIL?.trim() || `${doctor.clinicName} <onboarding@resend.dev>`;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "alreem-clinic/1.0",
      "Idempotency-Key": `booking-${appointment.id}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `حجز جديد في ${doctor.clinicName} — ${appointment.patientName}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173034"><h2 style="color:#8f5148">تم تسجيل حجز جديد</h2><p>تم حجز موعد جديد في <strong>${clinicName}</strong>.</p><table style="width:100%;border-collapse:collapse;background:#fff7f4;border-radius:14px;overflow:hidden"><tr><td style="padding:12px;border-bottom:1px solid #ecdcd7">المريض</td><td style="padding:12px;border-bottom:1px solid #ecdcd7"><strong>${patientName}</strong></td></tr><tr><td style="padding:12px;border-bottom:1px solid #ecdcd7">الهاتف</td><td dir="ltr" style="padding:12px;border-bottom:1px solid #ecdcd7;text-align:right"><strong>+${patientPhone}</strong></td></tr><tr><td style="padding:12px;border-bottom:1px solid #ecdcd7">التاريخ</td><td style="padding:12px;border-bottom:1px solid #ecdcd7"><strong>${date}</strong></td></tr><tr><td style="padding:12px;border-bottom:1px solid #ecdcd7">الوقت</td><td style="padding:12px;border-bottom:1px solid #ecdcd7"><strong>${time}</strong></td></tr><tr><td style="padding:12px">الملاحظات</td><td style="padding:12px"><strong>${notes}</strong></td></tr></table><p style="color:#718184;font-size:13px">رقم الحجز: ${escapeHtml(appointment.id.slice(-8).toUpperCase())}</p></div>`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email provider rejected booking notification (${response.status}): ${details.slice(0, 300)}`);
  }
  return { sent: true } as const;
}

export async function notifyBookingSafely(doctor: Doctor, appointment: Appointment) {
  try {
    return await sendBookingNotification(doctor, appointment);
  } catch (error) {
    console.error("Booking email notification failed", error instanceof Error ? error.message : "Unknown error");
    return { sent: false, reason: "provider_error" } as const;
  }
}
