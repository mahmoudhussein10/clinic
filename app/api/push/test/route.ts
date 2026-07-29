import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { sendPush } from "@/lib/push-service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(){try{const context=await requireClinicContext();return ok(await sendPush(context.userId,context.clinicId,{title:"إشعارات عيادة الريم",body:"الإشعارات تعمل بنجاح على هذا الجهاز.",url:"/notifications",tag:"alreem-push-test"}),"تم إرسال إشعار تجريبي");}catch(error){return fail(error);}}
