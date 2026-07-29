import "server-only";
import { getPrisma } from "./prisma";
import type { ClinicContext } from "./clinic-auth";
import type { ClinicNotification, NotificationPriority, NotificationType } from "./notification-types";
type Row={id:string;title:string;message:string;type:NotificationType;priority:NotificationPriority;is_read:boolean;action_url:string|null;entity_type:string|null;entity_id:string|null;created_at:Date|string;read_at:Date|string|null};
export async function notificationsAfter(context:ClinicContext,after:string){const value=new Date(after);if(Number.isNaN(value.getTime()))return[];const rows=await getPrisma().$queryRawUnsafe<Row[]>("SELECT * FROM notifications WHERE user_id=$1 AND clinic_id=$2 AND created_at>$3 ORDER BY created_at DESC LIMIT 20",context.userId,context.clinicId,value);return rows.map(row=>({id:row.id,title:row.title,message:row.message,type:row.type,priority:row.priority,isRead:row.is_read,actionUrl:row.action_url,entityType:row.entity_type,entityId:row.entity_id,createdAt:new Date(row.created_at).toISOString(),readAt:row.read_at?new Date(row.read_at).toISOString():null} satisfies ClinicNotification));}
