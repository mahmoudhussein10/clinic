import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { deleteNotification } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{const [context,{id}]=await Promise.all([requireClinicContext(),params]);return ok(await deleteNotification(context,id),"تم حذف الإشعار");}catch(error){return fail(error);}}
