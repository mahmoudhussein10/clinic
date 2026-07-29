import { NextResponse } from "next/server";
import { processAppointmentReminders } from "@/lib/reminder-service";

export const runtime="nodejs"; export const dynamic="force-dynamic";

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({success:false,error:"UNAUTHORIZED"},{status:401});
  try{return NextResponse.json({success:true,data:await processAppointmentReminders()},{headers:{"Cache-Control":"no-store"}});}
  catch(error){console.error("Reminder cron failed",error instanceof Error?error.message:"unknown");return NextResponse.json({success:false,error:"INTERNAL_ERROR"},{status:500});}
}
