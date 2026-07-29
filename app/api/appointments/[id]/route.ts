import { cancelAppointment, getAppointment, updateAppointment, ClinicError } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { emitAppointmentEventSafely } from "@/lib/notification-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function ownedAppointment(context: Context) {
  const [{ id }, auth] = await Promise.all([context.params, requireClinicContext()]);
  const appointment = await getAppointment(id);
  if (appointment.doctorId !== auth.clinicId) throw new ClinicError("CLINIC_ACCESS_DENIED", "Ù„Ø§ ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ¹Ø¯", 403);
  return appointment;
}

export async function GET(_: Request, context: Context) {
  try { return ok(await ownedAppointment(context), "ØªÙ… ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…ÙˆØ¹Ø¯"); }
  catch (error) { return fail(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const before = await ownedAppointment(context), body = await request.json();
    const appointment = await updateAppointment(before.id, body);
    const kind = appointment.status === "cancelled" && before.status !== "cancelled" ? "cancelled" : appointment.status === "confirmed" && before.status !== "confirmed" ? "confirmed" : appointment.status === "arrived" && before.status !== "arrived" ? "arrived" : appointment.appointmentDate !== before.appointmentDate || appointment.startTime !== before.startTime ? "updated" : null;
    if (kind) await emitAppointmentEventSafely(kind, appointment);
    return ok(appointment, "ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…ÙˆØ¹Ø¯");
  } catch (error) { return fail(error); }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const before = await ownedAppointment(context), appointment = await cancelAppointment(before.id);
    if (before.status !== "cancelled") await emitAppointmentEventSafely("cancelled", appointment);
    return ok(appointment, "ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ù…ÙˆØ¹Ø¯");
  } catch (error) { return fail(error); }
}