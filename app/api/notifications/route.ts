import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { listNotifications } from "@/lib/notification-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireClinicContext(), url = new URL(request.url);
    return ok(await listNotifications(context, { page:Number(url.searchParams.get("page")||1), pageSize:Number(url.searchParams.get("pageSize")||15), type:url.searchParams.get("type")||"all", read:url.searchParams.get("read")||"all" }), "تم تحميل الإشعارات");
  } catch (error) { return fail(error); }
}
