import { randomUUID } from "node:crypto";
import { getPrisma } from "./prisma";
import { generateAvailabilitySlots, timeToMinutes } from "./schedule-slots";
import type {
  Appointment, AppointmentSource, AppointmentStatus, ClinicStats,
  Doctor, Schedule, ScheduleException,
} from "./clinic-types";

const DEFAULT_DOCTOR_ID = "doctor_reem";
const DEFAULT_SLUG = "alreem-clinic";
const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed", "completed", "no_show"];

type DbAppointment = {
  id: string; doctor_id: string; patient_id: string; patient_name: string;
  patient_phone: string; appointment_date: string | Date; start_time: string; end_time: string;
  status: AppointmentStatus; notes: string; source: AppointmentSource;
  created_at: string | Date; updated_at: string | Date;
};
type DbDoctor = {
  id: string; name: string; specialization: string; phone: string; whatsapp_phone: string; email: string; clinic_name: string;
  booking_slug: string; timezone: string; booking_enabled: boolean; address: string; bio: string;
  max_daily: number; min_lead_hours: number; max_future_days: number;
};
type DbSchedule = {
  id: string; doctor_id: string; day_of_week: number; start_time: string; end_time: string;
  slot_duration: number; break_minutes: number; is_active: boolean;
};
type DbException = {
  id: string; doctor_id: string; date: string | Date; type: "closed" | "break";
  start_time: string | null; end_time: string | null; reason: string;
};

export class ClinicError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

async function query<T>(text: string, values: unknown[] = []) {
  try {
    return await getPrisma().$queryRawUnsafe<T[]>(text, ...values);
  } catch (error) {
    console.error("Database query failed", error instanceof Error ? error.message : "Unknown database error");
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      throw new ClinicError("DATABASE_NOT_CONFIGURED", "قاعدة البيانات غير مضبوطة على بيئة النشر", 500);
    }
    throw error;
  }
}

function dateOnly(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function mapAppointment(row: DbAppointment): Appointment {
  return { id: row.id, doctorId: row.doctor_id, patientId: row.patient_id, patientName: row.patient_name,
    patientPhone: row.patient_phone, appointmentDate: dateOnly(row.appointment_date), startTime: row.start_time,
    endTime: row.end_time, status: row.status, notes: row.notes, source: row.source,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
function mapDoctor(row: DbDoctor): Doctor { return { id: row.id, name: row.name, specialization: row.specialization, phone: row.phone, whatsappPhone: row.whatsapp_phone || row.phone, email: row.email || "",
  clinicName: row.clinic_name, bookingSlug: row.booking_slug, timezone: row.timezone, bookingEnabled: Boolean(row.booking_enabled),
  address: row.address, bio: row.bio, maxDaily: Number(row.max_daily), minLeadHours: Number(row.min_lead_hours), maxFutureDays: Number(row.max_future_days) }; }
function mapSchedule(row: DbSchedule): Schedule { return { id: row.id, doctorId: row.doctor_id, dayOfWeek: Number(row.day_of_week),
  startTime: row.start_time, endTime: row.end_time, slotDuration: Number(row.slot_duration), breakMinutes: Number(row.break_minutes), isActive: Boolean(row.is_active) }; }
function mapException(row: DbException): ScheduleException { return { id: row.id, doctorId: row.doctor_id,
  date: dateOnly(row.date), type: row.type, startTime: row.start_time, endTime: row.end_time, reason: row.reason }; }

function cleanName(value: unknown) { const name = String(value || "").trim().replace(/\s+/g," "); if (name.length < 2 || name.length > 80) throw new ClinicError("INVALID_PATIENT_NAME","اكتب اسم المريض بشكل صحيح"); return name; }
export function normalizeEgyptPhone(value: unknown) { let phone = String(value || "").replace(/[^\d+]/g,""); if (phone.startsWith("+")) phone=phone.slice(1); if (phone.startsWith("0020")) phone=phone.slice(2); if (phone.startsWith("01")&&phone.length===11) phone=`20${phone.slice(1)}`; if (!/^20(?:10|11|12|15)\d{8}$/.test(phone)) throw new ClinicError("INVALID_PHONE","أدخل رقم موبايل مصري صحيح مثل 01012345678"); return phone; }
function cleanContactPhone(value: unknown) { let phone=String(value||"").replace(/[^\d+]/g,""); if(phone.startsWith("+"))phone=phone.slice(1); if(phone.startsWith("0020"))phone=phone.slice(2); if(phone.startsWith("01")&&phone.length===11)phone=`20${phone.slice(1)}`; if(!/^\d{8,15}$/.test(phone))throw new ClinicError("INVALID_CONTACT_PHONE","أدخل رقم اتصال صحيحًا"); return phone; }
function cleanEmail(value: unknown) { const email=String(value||"").trim().toLowerCase(); if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ClinicError("INVALID_EMAIL","أدخل بريدًا إلكترونيًا صحيحًا"); return email; }
function validDate(value: unknown) { const date=String(value||""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new ClinicError("INVALID_DATE","اختر تاريخًا صحيحًا"); return date; }
function validTime(value: unknown) { const time=String(value||""); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ClinicError("INVALID_TIME","اختر وقتًا صحيحًا"); return time; }

function cairoNow(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return{date:`${v.year}-${v.month}-${v.day}`,time:`${v.hour}:${v.minute}`};}
function dateInCairo(iso:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo"}).format(new Date(iso));} function addDays(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export async function getDoctorBySlug(slug=DEFAULT_SLUG){const found=await query<DbDoctor>("SELECT * FROM doctors WHERE booking_slug=$1",[slug]);return found[0]?mapDoctor(found[0]):null;}
export async function getDoctor(id=DEFAULT_DOCTOR_ID){const found=await query<DbDoctor>("SELECT * FROM doctors WHERE id=$1",[id]);if(!found[0])throw new ClinicError("DOCTOR_NOT_FOUND","بيانات الطبيبة غير موجودة",404);return mapDoctor(found[0]);}
export async function listSchedule(doctorId=DEFAULT_DOCTOR_ID){const [doctor,schedules,exceptions]=await Promise.all([getDoctor(doctorId),query<DbSchedule>("SELECT * FROM schedules WHERE doctor_id=$1 ORDER BY day_of_week",[doctorId]),query<DbException>("SELECT * FROM schedule_exceptions WHERE doctor_id=$1 ORDER BY date",[doctorId])]);return{doctor,schedules:schedules.map(mapSchedule),exceptions:exceptions.map(mapException)};}

export async function updateSchedule(input: { doctorId?: string; phone?: unknown; whatsappPhone?: unknown; email?: unknown; bookingEnabled?: boolean; maxDaily?: number; minLeadHours?: number; maxFutureDays?: number; schedules?: Array<Partial<Schedule> & { dayOfWeek: number }> }) {
  const doctorId = input.doctorId || DEFAULT_DOCTOR_ID;
  const doctor = await getDoctor(doctorId);
  const phone = input.phone === undefined ? doctor.phone : cleanContactPhone(input.phone);
  const whatsappPhone = input.whatsappPhone === undefined ? doctor.whatsappPhone : cleanContactPhone(input.whatsappPhone);
  const email = input.email === undefined ? doctor.email : cleanEmail(input.email);
  const maxDaily = Math.min(100, Math.max(1, Number(input.maxDaily ?? doctor.maxDaily)));
  const minLeadHours = Math.min(168, Math.max(0, Number(input.minLeadHours ?? doctor.minLeadHours)));
  const maxFutureDays = Math.min(365, Math.max(1, Number(input.maxFutureDays ?? doctor.maxFutureDays)));
  const seenDays = new Set<number>();
  const prepared = (input.schedules || []).map((item) => {
    if (!Number.isInteger(item.dayOfWeek) || item.dayOfWeek < 0 || item.dayOfWeek > 6 || seenDays.has(item.dayOfWeek)) {
      throw new ClinicError("INVALID_SCHEDULE_DAY", "أيام جدول العمل غير صحيحة");
    }
    seenDays.add(item.dayOfWeek);
    const start = validTime(item.startTime);
    const end = validTime(item.endTime);
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      throw new ClinicError("INVALID_SCHEDULE", "وقت نهاية العمل يجب أن يكون بعد وقت البداية");
    }
    return {
      id: item.id || `schedule_${item.dayOfWeek}`,
      dayOfWeek: item.dayOfWeek,
      start,
      end,
      duration: [15, 20, 30, 45, 60].includes(Number(item.slotDuration)) ? Number(item.slotDuration) : 30,
      breakMinutes: Math.min(120, Math.max(0, Number(item.breakMinutes ?? 0))),
      isActive: item.isActive === true,
    };
  });
  if (prepared.length !== 7) throw new ClinicError("INCOMPLETE_SCHEDULE", "يجب إرسال جدول الأيام السبعة كاملًا");

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "UPDATE doctors SET phone=$1,whatsapp_phone=$2,email=$3,booking_enabled=$4,max_daily=$5,min_lead_hours=$6,max_future_days=$7,updated_at=$8 WHERE id=$9",
      phone, whatsappPhone, email, input.bookingEnabled ?? doctor.bookingEnabled, maxDaily, minLeadHours, maxFutureDays, new Date(), doctorId,
    );
    for (const item of prepared) {
      await tx.$executeRawUnsafe(
        `INSERT INTO schedules(id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(doctor_id,day_of_week) DO UPDATE SET
           start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,slot_duration=EXCLUDED.slot_duration,
           break_minutes=EXCLUDED.break_minutes,is_active=EXCLUDED.is_active`,
        item.id, doctorId, item.dayOfWeek, item.start, item.end, item.duration, item.breakMinutes, item.isActive,
      );
    }
  });
  return listSchedule(doctorId);
}
export async function addScheduleException(input:{doctorId?:string;date:string;type:"closed"|"break";startTime?:string;endTime?:string;reason?:string}){const doctorId=input.doctorId||DEFAULT_DOCTOR_ID,date=validDate(input.date),type=input.type==="break"?"break":"closed",start=type==="break"?validTime(input.startTime):null,end=type==="break"?validTime(input.endTime):null;if(start&&end&&timeToMinutes(end)<=timeToMinutes(start))throw new ClinicError("INVALID_EXCEPTION","نهاية الاستراحة يجب أن تكون بعد بدايتها");await query("INSERT INTO schedule_exceptions(id,doctor_id,date,type,start_time,end_time,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[ `exception_${randomUUID()}`,doctorId,date,type,start,end,String(input.reason||"").trim().slice(0,160),new Date().toISOString()]);return listSchedule(doctorId);}
export async function deleteScheduleException(id:string){const deleted=await query<{id:string}>("DELETE FROM schedule_exceptions WHERE id=$1 RETURNING id",[id]);if(!deleted[0])throw new ClinicError("EXCEPTION_NOT_FOUND","الاستثناء غير موجود",404);return{id};}

export async function getAvailability(options: { date: string; doctorId?: string; excludeAppointmentId?: string }) {
  const date = validDate(options.date);
  const doctorId = options.doctorId || DEFAULT_DOCTOR_ID;
  const doctor = await getDoctor(doctorId);
  const now = cairoNow();
  if (date < now.date || date > addDays(now.date, doctor.maxFutureDays)) return [];

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const [scheduleRows, exceptionRows] = await Promise.all([
    query<DbSchedule>("SELECT * FROM schedules WHERE doctor_id=$1 AND day_of_week=$2", [doctorId, dayOfWeek]),
    query<DbException>("SELECT * FROM schedule_exceptions WHERE doctor_id=$1 AND date=$2", [doctorId, date]),
  ]);
  if (!scheduleRows[0]) return [];

  const values: unknown[] = [doctorId, date];
  let sql = "SELECT start_time FROM appointments WHERE doctor_id=$1 AND appointment_date=$2 AND status <> 'cancelled'";
  if (options.excludeAppointmentId) { values.push(options.excludeAppointmentId); sql += " AND id <> $3"; }
  const booked = (await query<{ start_time: string }>(sql, values)).map((item) => item.start_time);

  return generateAvailabilitySlots({
    schedule: mapSchedule(scheduleRows[0]),
    exceptions: exceptionRows.map(mapException),
    bookedStartTimes: booked,
    maxDaily: doctor.maxDaily,
    date,
    now,
    minLeadHours: doctor.minLeadHours,
  });
}
export async function listAppointments(filters:{doctorId?:string;date?:string;startDate?:string;endDate?:string;status?:AppointmentStatus|"all";search?:string}={}){const clauses=["doctor_id=$1"],values:unknown[]=[filters.doctorId||DEFAULT_DOCTOR_ID];const add=(clause:string,value:unknown)=>{values.push(value);clauses.push(clause.replace("?",`$${values.length}`));};if(filters.date)add("appointment_date=?",validDate(filters.date));if(filters.startDate)add("appointment_date>=?",validDate(filters.startDate));if(filters.endDate)add("appointment_date<=?",validDate(filters.endDate));if(filters.status&&filters.status!=="all")add("status=?",filters.status);if(filters.search){values.push(`%${filters.search.trim()}%`);const p=values.length;clauses.push(`(patient_name ILIKE $${p} OR patient_phone ILIKE $${p})`);}return (await query<DbAppointment>(`SELECT * FROM appointments WHERE ${clauses.join(" AND ")} ORDER BY appointment_date,start_time`,values)).map(mapAppointment);}
export async function getAppointment(id:string){const found=await query<DbAppointment>("SELECT * FROM appointments WHERE id=$1",[id]);if(!found[0])throw new ClinicError("APPOINTMENT_NOT_FOUND","الموعد غير موجود",404);return mapAppointment(found[0]);}

export async function createAppointment(input:{doctorId?:string;patientName:unknown;patientPhone:unknown;appointmentDate:unknown;startTime:unknown;notes?:unknown;source?:AppointmentSource;status?:AppointmentStatus}){const doctorId=input.doctorId||DEFAULT_DOCTOR_ID,patientName=cleanName(input.patientName),patientPhone=normalizeEgyptPhone(input.patientPhone),appointmentDate=validDate(input.appointmentDate),startTime=validTime(input.startTime),notes=String(input.notes||"").trim().slice(0,500),source=input.source&&["public_booking","manual","whatsapp"].includes(input.source)?input.source:"manual",status=input.status&&ACTIVE_STATUSES.includes(input.status)?input.status:source==="public_booking"?"pending":"confirmed";const slot=(await getAvailability({date:appointmentDate,doctorId})).find(x=>x.startTime===startTime);if(!slot)throw new ClinicError("SLOT_UNAVAILABLE","هذا الموعد غير متاح أو تم حجزه بالفعل",409);const now=new Date().toISOString();try{const patients=await query<{id:string}>(`INSERT INTO patients(id,name,phone,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,notes=CASE WHEN EXCLUDED.notes<>'' THEN EXCLUDED.notes ELSE patients.notes END,updated_at=EXCLUDED.updated_at RETURNING id`,[`patient_${randomUUID()}`,patientName,patientPhone,notes,now]);const id=`appointment_${randomUUID()}`;await query(`INSERT INTO appointments(id,doctor_id,patient_id,patient_name,patient_phone,appointment_date,start_time,end_time,status,notes,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,[id,doctorId,patients[0].id,patientName,patientPhone,appointmentDate,startTime,slot.endTime,status,notes,source,now]);return getAppointment(id);}catch(error){const code=(error as {code?:string}).code||"",message=error instanceof Error?error.message:"";if(code==="23505"||message.includes("unique_active_doctor_slot")||message.includes("duplicate key"))throw new ClinicError("SLOT_UNAVAILABLE","هذا الموعد تم حجزه بالفعل، اختر موعدًا آخر",409);throw error;}}

export async function updateAppointment(id:string,input:Partial<{patientName:unknown;patientPhone:unknown;appointmentDate:unknown;startTime:unknown;notes:unknown;status:AppointmentStatus}>){const current=await getAppointment(id),patientName=input.patientName===undefined?current.patientName:cleanName(input.patientName),patientPhone=input.patientPhone===undefined?current.patientPhone:normalizeEgyptPhone(input.patientPhone),appointmentDate=input.appointmentDate===undefined?current.appointmentDate:validDate(input.appointmentDate),startTime=input.startTime===undefined?current.startTime:validTime(input.startTime),notes=input.notes===undefined?current.notes:String(input.notes||"").trim().slice(0,500),status=input.status===undefined?current.status:input.status;if(!["pending","confirmed","completed","cancelled","no_show"].includes(status))throw new ClinicError("INVALID_STATUS","حالة الموعد غير صحيحة");let endTime=current.endTime;if((appointmentDate!==current.appointmentDate||startTime!==current.startTime)&&status!=="cancelled"){const slot=(await getAvailability({date:appointmentDate,doctorId:current.doctorId,excludeAppointmentId:id})).find(x=>x.startTime===startTime);if(!slot)throw new ClinicError("SLOT_UNAVAILABLE","الوقت الجديد غير متاح",409);endTime=slot.endTime;}const now=new Date().toISOString();try{const patients=await query<{id:string}>(`INSERT INTO patients(id,name,phone,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,notes=CASE WHEN EXCLUDED.notes<>'' THEN EXCLUDED.notes ELSE patients.notes END,updated_at=EXCLUDED.updated_at RETURNING id`,[`patient_${randomUUID()}`,patientName,patientPhone,notes,now]);await query("UPDATE appointments SET patient_id=$1,patient_name=$2,patient_phone=$3,appointment_date=$4,start_time=$5,end_time=$6,status=$7,notes=$8,updated_at=$9 WHERE id=$10",[patients[0].id,patientName,patientPhone,appointmentDate,startTime,endTime,status,notes,now,id]);return getAppointment(id);}catch(error){const code=(error as {code?:string}).code||"",message=error instanceof Error?error.message:"";if(code==="23505"||message.includes("duplicate key"))throw new ClinicError("SLOT_UNAVAILABLE","الوقت الجديد محجوز بالفعل",409);throw error;}}
export async function cancelAppointment(id:string){return updateAppointment(id,{status:"cancelled"});}

export async function getStats(doctorId=DEFAULT_DOCTOR_ID,requestedRange=30):Promise<ClinicStats>{const rangeDays=Math.min(365,Math.max(1,Number(requestedRange)||30)),appointments=await listAppointments({doctorId}),now=cairoNow(),monthStart=`${now.date.slice(0,7)}-01`,last7Start=addDays(now.date,-6),last30Start=addDays(now.date,-29),rangeStart=addDays(now.date,-(rangeDays-1)),valid=appointments.filter(x=>x.status!=="cancelled"),nextAppointments=valid.filter(x=>x.status!=="completed"&&`${x.appointmentDate} ${x.startTime}`>`${now.date} ${now.time}`),laterAppointments=nextAppointments.filter(x=>x.appointmentDate>now.date),outcomes=appointments.filter(x=>x.status==="completed"||x.status==="no_show"),completed=outcomes.filter(x=>x.status==="completed").length,noShows=outcomes.filter(x=>x.status==="no_show").length,patientRows=await query<{created_at:string}>("SELECT created_at FROM patients"),dayNames=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"],dayCounts=new Map<number,number>(),timeCounts=new Map<string,number>();for(const item of valid){const day=new Date(`${item.appointmentDate}T12:00:00Z`).getUTCDay();dayCounts.set(day,(dayCounts.get(day)||0)+1);timeCounts.set(item.startTime,(timeCounts.get(item.startTime)||0)+1);}const busyDay=[...dayCounts.entries()].sort((a,b)=>b[1]-a[1])[0],busyTime=[...timeCounts.entries()].sort((a,b)=>b[1]-a[1])[0],series=Array.from({length:7},(_,i)=>{const date=addDays(now.date,i-6);return{date,count:valid.filter(x=>x.appointmentDate===date).length};});return{today:valid.filter(x=>x.appointmentDate===now.date).length,upcoming:laterAppointments.length,completed:appointments.filter(x=>x.status==="completed").length,cancelled:appointments.filter(x=>x.status==="cancelled").length,patients:new Set(appointments.map(x=>x.patientId)).size,newPatientsThisMonth:patientRows.filter(x=>dateInCairo(String(x.created_at))>=monthStart).length,patientsToday:new Set(valid.filter(x=>x.appointmentDate===now.date).map(x=>x.patientId)).size,newBookings:appointments.filter(x=>dateInCairo(x.createdAt)===now.date).length,attendanceRate:outcomes.length?Math.round(completed/outcomes.length*100):0,noShowRate:outcomes.length?Math.round(noShows/outcomes.length*100):0,publicBookings:appointments.filter(x=>x.source==="public_booking").length,manualBookings:appointments.filter(x=>x.source==="manual").length,busiestDay:busyDay?dayNames[busyDay[0]]:"—",mostBookedTime:busyTime?.[0]||"—",last7Days:valid.filter(x=>x.appointmentDate>=last7Start&&x.appointmentDate<=now.date).length,last30Days:valid.filter(x=>x.appointmentDate>=last30Start&&x.appointmentDate<=now.date).length,rangeDays,rangeAppointments:valid.filter(x=>x.appointmentDate>=rangeStart&&x.appointmentDate<=now.date).length,nextAppointment:nextAppointments.sort((a,b)=>`${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`))[0]||null,sevenDaySeries:series};}

export const clinicDefaults={doctorId:DEFAULT_DOCTOR_ID,bookingSlug:DEFAULT_SLUG};
