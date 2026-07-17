import { getAvailability } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (!date) throw new Error("DATE_REQUIRED");
    const slots = await getAvailability({
      date,
      doctorId: url.searchParams.get("doctorId") || undefined,
      excludeAppointmentId: url.searchParams.get("excludeAppointmentId") || undefined,
    });
    return ok(slots, slots.length ? "تم تحميل المواعيد المتاحة" : "لا توجد مواعيد متاحة في هذا اليوم");
  } catch (error) {
    if (error instanceof Error && error.message === "DATE_REQUIRED") {
      return Response.json({ success: false, error: "DATE_REQUIRED", message: "التاريخ مطلوب" }, { status: 400 });
    }
    return fail(error);
  }
}

