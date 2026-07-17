import { cancelAppointment, getAppointment, updateAppointment } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    return ok(getAppointment(id), "تم تحميل الموعد");
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    return ok(updateAppointment(id, body), "تم تحديث الموعد");
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    return ok(cancelAppointment(id), "تم إلغاء الموعد");
  } catch (error) {
    return fail(error);
  }
}

