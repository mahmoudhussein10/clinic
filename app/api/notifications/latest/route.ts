import { fail,ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { notificationsAfter } from "@/lib/notification-live";
import { unreadCount } from "@/lib/notification-db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){try{const context=await requireClinicContext(),after=new URL(request.url).searchParams.get("after")||new Date(0).toISOString();return ok({items:await notificationsAfter(context,after),count:await unreadCount(context)},"تم تحميل أحدث الإشعارات");}catch(error){return fail(error);}}
