import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { unreadCount } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{const context=await requireClinicContext();return ok({count:await unreadCount(context)},"تم تحميل عدد الإشعارات");}catch(error){return fail(error);}}
