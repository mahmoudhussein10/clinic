import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { saveSubscription } from "@/lib/notification-db";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request:Request){try{const context=await requireClinicContext();return ok(await saveSubscription(context,await request.json(),request.headers.get("user-agent")||""),"تم تفعيل إشعارات هذا الجهاز",201);}catch(error){return fail(error);}}
