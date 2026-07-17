import { getStats } from "@/lib/clinic-db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ok(getStats(url.searchParams.get("doctorId") || undefined, Number(url.searchParams.get("range") || 30)), "تم تحديث الإحصائيات");
  } catch (error) {
    return fail(error);
  }
}

