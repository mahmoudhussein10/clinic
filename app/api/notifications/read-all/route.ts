import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { markAllNotificationsRead } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function PATCH(){try{const context=await requireClinicContext();return ok(await markAllNotificationsRead(context),"تم تعليم الكل كمقروء");}catch(error){return fail(error);}}
