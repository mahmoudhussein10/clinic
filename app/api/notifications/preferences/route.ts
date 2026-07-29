import { fail, ok } from "@/lib/api-response";
import { requireClinicContext } from "@/lib/clinic-auth";
import { getPreferences, updatePreferences } from "@/lib/notification-db";
import { pushConfiguration } from "@/lib/push-service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{const context=await requireClinicContext();return ok({preferences:await getPreferences(context),push:pushConfiguration()},"تم تحميل إعدادات الإشعارات");}catch(error){return fail(error);}}
export async function PATCH(request:Request){try{const context=await requireClinicContext();return ok(await updatePreferences(context,await request.json()),"تم حفظ إعدادات الإشعارات");}catch(error){return fail(error);}}
