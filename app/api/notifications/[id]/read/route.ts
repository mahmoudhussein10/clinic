import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { markNotificationRead } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function PATCH(_:Request,{params}:{params:Promise<{id:string}>}){try{const [context,{id}]=await Promise.all([requireClinicContext(),params]);return ok(await markNotificationRead(context,id),"تم تعليم الإشعار كمقروء");}catch(error){return fail(error);}}
