import { ClinicError, createAppointment, getDoctorBySlug } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";
import { emitAppointmentEventSafely } from "@/lib/notification-events";
import { patientExists } from "@/lib/patient-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doctor = await getDoctorBySlug(String(body.bookingSlug || ""));
    if (!doctor) throw new ClinicError("DOCTOR_NOT_FOUND", "ØµÙØ­Ø© Ø§Ù„Ø­Ø¬Ø² ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©", 404);
    if (!doctor.bookingEnabled) throw new ClinicError("BOOKING_DISABLED", "Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ù…ØªÙˆÙ‚Ù Ù…Ø¤Ù‚ØªÙ‹Ø§", 409);
    const existingPatient = await patientExists(body.patientPhone);
    const appointment = await createAppointment({ doctorId: doctor.id, patientName: body.patientName, patientPhone: body.patientPhone, appointmentDate: body.appointmentDate, startTime: body.startTime, notes: body.notes, source: "public_booking", status: "pending" });
    await emitAppointmentEventSafely("created", appointment);
    if (!existingPatient) await emitAppointmentEventSafely("patient_created", appointment);
    return ok({ ...appointment, patientPhone: appointment.patientPhone }, "ØªÙ… Ø§Ù„Ø­Ø¬Ø²", 201);
  } catch (error) { return fail(error); }
}