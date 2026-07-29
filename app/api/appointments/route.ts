import { createAppointment, listAppointments } from "@/lib/clinic-db";
import type { AppointmentStatus } from "@/lib/clinic-types";
import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { emitAppointmentEventSafely } from "@/lib/notification-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireClinicContext();
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "all") as AppointmentStatus | "all";
    return ok(await listAppointments({ doctorId: context.clinicId, date: url.searchParams.get("date") || undefined, startDate: url.searchParams.get("startDate") || undefined, endDate: url.searchParams.get("endDate") || undefined, status, search: url.searchParams.get("search") || undefined }), "ØªÙ… ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…ÙˆØ§Ø¹ÙŠØ¯");
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireClinicContext();
    const body = await request.json();
    const appointment = await createAppointment({ ...body, doctorId: context.clinicId, source: body.source || "manual" });
    await emitAppointmentEventSafely("created", appointment);
    return ok(appointment, "ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…ÙˆØ¹Ø¯", 201);
  } catch (error) { return fail(error); }
}