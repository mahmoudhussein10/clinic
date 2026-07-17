import { ClinicError, createAppointment, getDoctorBySlug } from "@/lib/clinic-db";
import { notifyBookingSafely } from "@/lib/booking-email";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doctor = await getDoctorBySlug(String(body.bookingSlug || ""));
    if (!doctor) throw new ClinicError("DOCTOR_NOT_FOUND", "صفحة الحجز غير موجودة", 404);
    if (!doctor.bookingEnabled) throw new ClinicError("BOOKING_DISABLED", "الحجز الإلكتروني متوقف مؤقتًا", 409);
    const appointment = await createAppointment({
      doctorId: doctor.id,
      patientName: body.patientName,
      patientPhone: body.patientPhone,
      appointmentDate: body.appointmentDate,
      startTime: body.startTime,
      notes: body.notes,
      source: "public_booking",
      status: "pending",
    });
    await notifyBookingSafely(doctor, appointment);
    return ok({ ...appointment, patientPhone: appointment.patientPhone }, "تم الحجز", 201);
  } catch (error) {
    return fail(error);
  }
}

