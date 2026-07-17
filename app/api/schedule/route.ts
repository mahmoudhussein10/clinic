import { addScheduleException, deleteScheduleException, listSchedule, updateSchedule } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ok(await listSchedule(url.searchParams.get("doctorId") || undefined), "تم تحميل جدول العمل");
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    return ok(await updateSchedule(await request.json()), "تم حفظ جدول العمل");
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return ok(await addScheduleException(await request.json()), "تمت إضافة الاستثناء", 201);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ success: false, error: "ID_REQUIRED", message: "رقم الاستثناء مطلوب" }, { status: 400 });
    return ok(await deleteScheduleException(id), "تم حذف الاستثناء");
  } catch (error) {
    return fail(error);
  }
}

