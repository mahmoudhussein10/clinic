import { createAppointment, listAppointments } from "@/lib/clinic-db";
import type { AppointmentStatus } from "@/lib/clinic-types";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "all") as AppointmentStatus | "all";
    const data = listAppointments({
      doctorId: url.searchParams.get("doctorId") || undefined,
      date: url.searchParams.get("date") || undefined,
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      status,
      search: url.searchParams.get("search") || undefined,
    });
    return ok(data, "تم تحميل المواعيد");
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const appointment = createAppointment({ ...body, source: body.source || "manual" });
    return ok(appointment, "تمت إضافة الموعد", 201);
  } catch (error) {
    return fail(error);
  }
}

