import { getDoctorBySlug, listSchedule } from "@/lib/clinic-db";
import { ClinicError } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ slug: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { slug } = await context.params;
    const doctor = await getDoctorBySlug(slug);
    if (!doctor) throw new ClinicError("DOCTOR_NOT_FOUND", "صفحة الحجز غير موجودة", 404);
    const scheduleData = await listSchedule(doctor.id);
    const schedule = scheduleData.schedules;
    const publicDoctor = {
      id: doctor.id,
      name: doctor.name,
      specialization: doctor.specialization,
      phone: doctor.phone,
      whatsappPhone: doctor.whatsappPhone,
      clinicName: doctor.clinicName,
      bookingSlug: doctor.bookingSlug,
      timezone: doctor.timezone,
      bookingEnabled: doctor.bookingEnabled,
      address: doctor.address,
      bio: doctor.bio,
      maxDaily: doctor.maxDaily,
      minLeadHours: doctor.minLeadHours,
      maxFutureDays: doctor.maxFutureDays,
      schedule,
    };
    return ok(publicDoctor, "تم تحميل بيانات العيادة");
  } catch (error) {
    return fail(error);
  }
}

