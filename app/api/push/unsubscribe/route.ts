import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { removeSubscription } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function DELETE(request:Request){try{const context=await requireClinicContext();const body=await request.json();return ok(await removeSubscription(context,String(body.endpoint||"")),"تم إيقاف إشعارات هذا الجهاز");}catch(error){return fail(error);}}
