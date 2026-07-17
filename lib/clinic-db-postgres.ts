import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type {
  Appointment, AppointmentSource, AppointmentStatus, AvailabilitySlot, ClinicStats,
  Doctor, Schedule, ScheduleException,
} from "./clinic-types";

const DEFAULT_DOCTOR_ID = "doctor_reem";
const DEFAULT_SLUG = "alreem-clinic";
const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed", "completed", "no_show"];

type QueryResult<T> = { rows: T[] } | T[];
type DatabaseClient = { query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>> };
type ClinicGlobal = typeof globalThis & {
  __clinicClient?: Promise<DatabaseClient>;
  __clinicSchema?: Promise<void>;
};

type DbAppointment = {
  id: string; doctor_id: string; patient_id: string; patient_name: string;
  patient_phone: string; appointment_date: string; start_time: string; end_time: string;
  status: AppointmentStatus; notes: string; source: AppointmentSource;
  created_at: string; updated_at: string;
};
type DbDoctor = {
  id: string; name: string; specialization: string; phone: string; clinic_name: string;
  booking_slug: string; timezone: string; booking_enabled: boolean; address: string; bio: string;
  max_daily: number; min_lead_hours: number; max_future_days: number;
};
type DbSchedule = {
  id: string; doctor_id: string; day_of_week: number; start_time: string; end_time: string;
  slot_duration: number; break_minutes: number; is_active: boolean;
};
type DbException = {
  id: string; doctor_id: string; date: string; type: "closed" | "break";
  start_time: string | null; end_time: string | null; reason: string;
};

export class ClinicError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

async function createClient(): Promise<DatabaseClient> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    return { query: async <T>(text: string, values: unknown[] = []) => sql.query(text, values) as Promise<T[]> };
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new ClinicError("DATABASE_NOT_CONFIGURED", "DATABASE_URL غير مضبوط على بيئة النشر", 500);
  }
  const { newDb } = await import("pg-mem");
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  return { query: <T>(text: string, values: unknown[] = []) => pool.query(text, values) as Promise<{ rows: T[] }> };
}

async function client() {
  const globalRef = globalThis as ClinicGlobal;
  globalRef.__clinicClient ??= createClient();
  return globalRef.__clinicClient;
}

function rows<T>(result: QueryResult<T>) { return Array.isArray(result) ? result : result.rows; }
async function rawQuery<T>(text: string, values: unknown[] = []) { return rows(await (await client()).query<T>(text, values)); }

async function ensureSchema() {
  const globalRef = globalThis as ClinicGlobal;
  globalRef.__clinicSchema ??= (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, specialization TEXT NOT NULL, phone TEXT NOT NULL,
        clinic_name TEXT NOT NULL, booking_slug TEXT NOT NULL UNIQUE, timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
        booking_enabled BOOLEAN NOT NULL DEFAULT TRUE, address TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
        max_daily INTEGER NOT NULL DEFAULT 20, min_lead_hours INTEGER NOT NULL DEFAULT 2,
        max_future_days INTEGER NOT NULL DEFAULT 60, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES doctors(id), patient_id TEXT NOT NULL REFERENCES patients(id),
        patient_name TEXT NOT NULL, patient_phone TEXT NOT NULL, appointment_date DATE NOT NULL,
        start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','confirmed','completed','cancelled','no_show')),
        notes TEXT NOT NULL DEFAULT '', source TEXT NOT NULL CHECK(source IN ('public_booking','manual','whatsapp')),
        created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot
        ON appointments(doctor_id, appointment_date, start_time) WHERE status <> 'cancelled'`,
      `CREATE INDEX IF NOT EXISTS appointment_date_idx ON appointments(doctor_id, appointment_date)`,
      `CREATE INDEX IF NOT EXISTS appointment_phone_idx ON appointments(patient_phone)`,
      `CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES doctors(id), day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL, end_time TEXT NOT NULL, slot_duration INTEGER NOT NULL,
        break_minutes INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE(doctor_id, day_of_week)
      )`,
      `CREATE TABLE IF NOT EXISTS schedule_exceptions (
        id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES doctors(id), date DATE NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('closed','break')), start_time TEXT, end_time TEXT,
        reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL
      )`,
    ];
    for (const statement of statements) await rawQuery(statement);
    const now = new Date().toISOString();
    await rawQuery(`INSERT INTO doctors
      (id,name,specialization,phone,clinic_name,booking_slug,timezone,booking_enabled,address,bio,max_daily,min_lead_hours,max_future_days,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,20,2,60,$10,$10) ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_DOCTOR_ID,"د. ريم","طب عام ومتابعة","201000000000","عيادة الريم",DEFAULT_SLUG,"Africa/Cairo","القاهرة، مصر","رعاية طبية منظمة ومواعيد دقيقة بدون انتظار طويل.",now]);
    for (const day of [0,1,2,3,4,5,6]) {
      await rawQuery(`INSERT INTO schedules (id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active)
        VALUES ($1,$2,$3,'16:00','22:00',30,0,$4) ON CONFLICT (doctor_id,day_of_week) DO NOTHING`,
        [`schedule_${day}`,DEFAULT_DOCTOR_ID,day,day !== 5]);
    }
  })();
  return globalRef.__clinicSchema;
}

async function query<T>(text: string, values: unknown[] = []) { await ensureSchema(); return rawQuery<T>(text, values); }

function mapAppointment(row: DbAppointment): Appointment {
  return { id: row.id, doctorId: row.doctor_id, patientId: row.patient_id, patientName: row.patient_name,
    patientPhone: row.patient_phone, appointmentDate: String(row.appointment_date).slice(0,10), startTime: row.start_time,
    endTime: row.end_time, status: row.status, notes: row.notes, source: row.source,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
function mapDoctor(row: DbDoctor): Doctor { return { id: row.id, name: row.name, specialization: row.specialization, phone: row.phone,
  clinicName: row.clinic_name, bookingSlug: row.booking_slug, timezone: row.timezone, bookingEnabled: Boolean(row.booking_enabled),
  address: row.address, bio: row.bio, maxDaily: Number(row.max_daily), minLeadHours: Number(row.min_lead_hours), maxFutureDays: Number(row.max_future_days) }; }
function mapSchedule(row: DbSchedule): Schedule { return { id: row.id, doctorId: row.doctor_id, dayOfWeek: Number(row.day_of_week),
  startTime: row.start_time, endTime: row.end_time, slotDuration: Number(row.slot_duration), breakMinutes: Number(row.break_minutes), isActive: Boolean(row.is_active) }; }
function mapException(row: DbException): ScheduleException { return { id: row.id, doctorId: row.doctor_id,
  date: String(row.date).slice(0,10), type: row.type, startTime: row.start_time, endTime: row.end_time, reason: row.reason }; }

function cleanName(value: unknown) { const name = String(value || "").trim().replace(/\s+/g," "); if (name.length < 2 || name.length > 80) throw new ClinicError("INVALID_PATIENT_NAME","اكتب اسم المريض بشكل صحيح"); return name; }
export function normalizeEgyptPhone(value: unknown) { let phone = String(value || "").replace(/[^\d+]/g,""); if (phone.startsWith("+")) phone=phone.slice(1); if (phone.startsWith("0020")) phone=phone.slice(2); if (phone.startsWith("01")&&phone.length===11) phone=`20${phone.slice(1)}`; if (!/^20(?:10|11|12|15)\d{8}$/.test(phone)) throw new ClinicError("INVALID_PHONE","أدخل رقم موبايل مصري صحيح مثل 01012345678"); return phone; }
function validDate(value: unknown) { const date=String(value||""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new ClinicError("INVALID_DATE","اختر تاريخًا صحيحًا"); return date; }
function validTime(value: unknown) { const time=String(value||""); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ClinicError("INVALID_TIME","اختر وقتًا صحيحًا"); return time; }
function timeToMinutes(time:string){const [h,m]=time.split(":").map(Number);return h*60+m;} function minutesToTime(total:number){return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
function cairoNow(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return{date:`${v.year}-${v.month}-${v.day}`,time:`${v.hour}:${v.minute}`};}
function dateInCairo(iso:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo"}).format(new Date(iso));} function addDays(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export async function getDoctorBySlug(slug=DEFAULT_SLUG){const found=await query<DbDoctor>("SELECT * FROM doctors WHERE booking_slug=$1",[slug]);return found[0]?mapDoctor(found[0]):null;}
export async function getDoctor(id=DEFAULT_DOCTOR_ID){const found=await query<DbDoctor>("SELECT * FROM doctors WHERE id=$1",[id]);if(!found[0])throw new ClinicError("DOCTOR_NOT_FOUND","بيانات الطبيبة غير موجودة",404);return mapDoctor(found[0]);}
export async function listSchedule(doctorId=DEFAULT_DOCTOR_ID){const [doctor,schedules,exceptions]=await Promise.all([getDoctor(doctorId),query<DbSchedule>("SELECT * FROM schedules WHERE doctor_id=$1 ORDER BY day_of_week",[doctorId]),query<DbException>("SELECT * FROM schedule_exceptions WHERE doctor_id=$1 ORDER BY date",[doctorId])]);return{doctor,schedules:schedules.map(mapSchedule),exceptions:exceptions.map(mapException)};}

export async function updateSchedule(input:{doctorId?:string;bookingEnabled?:boolean;maxDaily?:number;minLeadHours?:number;maxFutureDays?:number;schedules?:Array<Partial<Schedule>&{dayOfWeek:number}>}){
  const doctorId=input.doctorId||DEFAULT_DOCTOR_ID;const doctor=await getDoctor(doctorId);const maxDaily=Math.min(100,Math.max(1,Number(input.maxDaily??doctor.maxDaily)));const minLeadHours=Math.min(168,Math.max(0,Number(input.minLeadHours??doctor.minLeadHours)));const maxFutureDays=Math.min(365,Math.max(1,Number(input.maxFutureDays??doctor.maxFutureDays)));const prepared=[] as Array<{item:Partial<Schedule>&{dayOfWeek:number};start:string;end:string;duration:number;breakMinutes:number}>;
  for(const item of input.schedules||[]){if(item.dayOfWeek<0||item.dayOfWeek>6)continue;const start=validTime(item.startTime||"16:00"),end=validTime(item.endTime||"22:00");if(timeToMinutes(end)<=timeToMinutes(start))throw new ClinicError("INVALID_SCHEDULE","وقت نهاية العمل يجب أن يكون بعد وقت البداية");prepared.push({item,start,end,duration:[15,20,30,45,60].includes(Number(item.slotDuration))?Number(item.slotDuration):30,breakMinutes:Math.min(120,Math.max(0,Number(item.breakMinutes||0)))});}
  await query("UPDATE doctors SET booking_enabled=$1,max_daily=$2,min_lead_hours=$3,max_future_days=$4,updated_at=$5 WHERE id=$6",[input.bookingEnabled??doctor.bookingEnabled,maxDaily,minLeadHours,maxFutureDays,new Date().toISOString(),doctorId]);
  for(const p of prepared)await query(`INSERT INTO schedules(id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(doctor_id,day_of_week) DO UPDATE SET start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,slot_duration=EXCLUDED.slot_duration,break_minutes=EXCLUDED.break_minutes,is_active=EXCLUDED.is_active`,[p.item.id||`schedule_${p.item.dayOfWeek}`,doctorId,p.item.dayOfWeek,p.start,p.end,p.duration,p.breakMinutes,Boolean(p.item.isActive)]);
  return listSchedule(doctorId);
}
export async function addScheduleException(input:{doctorId?:string;date:string;type:"closed"|"break";startTime?:string;endTime?:string;reason?:string}){const doctorId=input.doctorId||DEFAULT_DOCTOR_ID,date=validDate(input.date),type=input.type==="break"?"break":"closed",start=type==="break"?validTime(input.startTime):null,end=type==="break"?validTime(input.endTime):null;if(start&&end&&timeToMinutes(end)<=timeToMinutes(start))throw new ClinicError("INVALID_EXCEPTION","نهاية الاستراحة يجب أن تكون بعد بدايتها");await query("INSERT INTO schedule_exceptions(id,doctor_id,date,type,start_time,end_time,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[ `exception_${randomUUID()}`,doctorId,date,type,start,end,String(input.reason||"").trim().slice(0,160),new Date().toISOString()]);return listSchedule(doctorId);}
export async function deleteScheduleException(id:string){const deleted=await query<{id:string}>("DELETE FROM schedule_exceptions WHERE id=$1 RETURNING id",[id]);if(!deleted[0])throw new ClinicError("EXCEPTION_NOT_FOUND","الاستثناء غير موجود",404);return{id};}

export async function getAvailability(options:{date:string;doctorId?:string;excludeAppointmentId?:string}){const date=validDate(options.date),doctorId=options.doctorId||DEFAULT_DOCTOR_ID,doctor=await getDoctor(doctorId),now=cairoNow();if(date<now.date||date>addDays(now.date,doctor.maxFutureDays))return[];const day=new Date(`${date}T12:00:00Z`).getUTCDay();const [scheduleRows,exceptionRows]=await Promise.all([query<DbSchedule>("SELECT * FROM schedules WHERE doctor_id=$1 AND day_of_week=$2",[doctorId,day]),query<DbException>("SELECT * FROM schedule_exceptions WHERE doctor_id=$1 AND date=$2",[doctorId,date])]);if(!scheduleRows[0]||!scheduleRows[0].is_active)return[];const schedule=mapSchedule(scheduleRows[0]),exceptions=exceptionRows.map(mapException);if(exceptions.some(x=>x.type==="closed"))return[];const values:unknown[]=[doctorId,date];let sql="SELECT start_time FROM appointments WHERE doctor_id=$1 AND appointment_date=$2 AND status <> 'cancelled'";if(options.excludeAppointmentId){values.push(options.excludeAppointmentId);sql+=" AND id <> $3";}const booked=new Set((await query<{start_time:string}>(sql,values)).map(x=>x.start_time));if(booked.size>=doctor.maxDaily)return[];const slots:AvailabilitySlot[]=[];const end=timeToMinutes(schedule.endTime),step=schedule.slotDuration+schedule.breakMinutes;for(let start=timeToMinutes(schedule.startTime);start+schedule.slotDuration<=end;start+=step){const startTime=minutesToTime(start),endTime=minutesToTime(start+schedule.slotDuration);if(booked.has(startTime))continue;if(date===now.date&&start<timeToMinutes(now.time)+doctor.minLeadHours*60)continue;const blocked=exceptions.some(x=>x.type==="break"&&x.startTime&&x.endTime&&start<timeToMinutes(x.endTime)&&start+schedule.slotDuration>timeToMinutes(x.startTime));if(!blocked)slots.push({startTime,endTime});}return slots.slice(0,Math.max(0,doctor.maxDaily-booked.size));}

export async function listAppointments(filters:{doctorId?:string;date?:string;startDate?:string;endDate?:string;status?:AppointmentStatus|"all";search?:string}={}){const clauses=["doctor_id=$1"],values:unknown[]=[filters.doctorId||DEFAULT_DOCTOR_ID];const add=(clause:string,value:unknown)=>{values.push(value);clauses.push(clause.replace("?",`$${values.length}`));};if(filters.date)add("appointment_date=?",validDate(filters.date));if(filters.startDate)add("appointment_date>=?",validDate(filters.startDate));if(filters.endDate)add("appointment_date<=?",validDate(filters.endDate));if(filters.status&&filters.status!=="all")add("status=?",filters.status);if(filters.search){values.push(`%${filters.search.trim()}%`);const p=values.length;clauses.push(`(patient_name ILIKE $${p} OR patient_phone ILIKE $${p})`);}return (await query<DbAppointment>(`SELECT * FROM appointments WHERE ${clauses.join(" AND ")} ORDER BY appointment_date,start_time`,values)).map(mapAppointment);}
export async function getAppointment(id:string){const found=await query<DbAppointment>("SELECT * FROM appointments WHERE id=$1",[id]);if(!found[0])throw new ClinicError("APPOINTMENT_NOT_FOUND","الموعد غير موجود",404);return mapAppointment(found[0]);}

export async function createAppointment(input:{doctorId?:string;patientName:unknown;patientPhone:unknown;appointmentDate:unknown;startTime:unknown;notes?:unknown;source?:AppointmentSource;status?:AppointmentStatus}){const doctorId=input.doctorId||DEFAULT_DOCTOR_ID,patientName=cleanName(input.patientName),patientPhone=normalizeEgyptPhone(input.patientPhone),appointmentDate=validDate(input.appointmentDate),startTime=validTime(input.startTime),notes=String(input.notes||"").trim().slice(0,500),source=input.source&&["public_booking","manual","whatsapp"].includes(input.source)?input.source:"manual",status=input.status&&ACTIVE_STATUSES.includes(input.status)?input.status:source==="public_booking"?"pending":"confirmed";const slot=(await getAvailability({date:appointmentDate,doctorId})).find(x=>x.startTime===startTime);if(!slot)throw new ClinicError("SLOT_UNAVAILABLE","هذا الموعد غير متاح أو تم حجزه بالفعل",409);const now=new Date().toISOString();try{const patients=await query<{id:string}>(`INSERT INTO patients(id,name,phone,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,notes=CASE WHEN EXCLUDED.notes<>'' THEN EXCLUDED.notes ELSE patients.notes END,updated_at=EXCLUDED.updated_at RETURNING id`,[`patient_${randomUUID()}`,patientName,patientPhone,notes,now]);const id=`appointment_${randomUUID()}`;await query(`INSERT INTO appointments(id,doctor_id,patient_id,patient_name,patient_phone,appointment_date,start_time,end_time,status,notes,source,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,[id,doctorId,patients[0].id,patientName,patientPhone,appointmentDate,startTime,slot.endTime,status,notes,source,now]);return getAppointment(id);}catch(error){const code=(error as {code?:string}).code||"",message=error instanceof Error?error.message:"";if(code==="23505"||message.includes("unique_active_doctor_slot")||message.includes("duplicate key"))throw new ClinicError("SLOT_UNAVAILABLE","هذا الموعد تم حجزه بالفعل، اختر موعدًا آخر",409);throw error;}}

export async function updateAppointment(id:string,input:Partial<{patientName:unknown;patientPhone:unknown;appointmentDate:unknown;startTime:unknown;notes:unknown;status:AppointmentStatus}>){const current=await getAppointment(id),patientName=input.patientName===undefined?current.patientName:cleanName(input.patientName),patientPhone=input.patientPhone===undefined?current.patientPhone:normalizeEgyptPhone(input.patientPhone),appointmentDate=input.appointmentDate===undefined?current.appointmentDate:validDate(input.appointmentDate),startTime=input.startTime===undefined?current.startTime:validTime(input.startTime),notes=input.notes===undefined?current.notes:String(input.notes||"").trim().slice(0,500),status=input.status===undefined?current.status:input.status;if(!["pending","confirmed","completed","cancelled","no_show"].includes(status))throw new ClinicError("INVALID_STATUS","حالة الموعد غير صحيحة");let endTime=current.endTime;if((appointmentDate!==current.appointmentDate||startTime!==current.startTime)&&status!=="cancelled"){const slot=(await getAvailability({date:appointmentDate,doctorId:current.doctorId,excludeAppointmentId:id})).find(x=>x.startTime===startTime);if(!slot)throw new ClinicError("SLOT_UNAVAILABLE","الوقت الجديد غير متاح",409);endTime=slot.endTime;}const now=new Date().toISOString();try{const patients=await query<{id:string}>(`INSERT INTO patients(id,name,phone,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,notes=CASE WHEN EXCLUDED.notes<>'' THEN EXCLUDED.notes ELSE patients.notes END,updated_at=EXCLUDED.updated_at RETURNING id`,[`patient_${randomUUID()}`,patientName,patientPhone,notes,now]);await query("UPDATE appointments SET patient_id=$1,patient_name=$2,patient_phone=$3,appointment_date=$4,start_time=$5,end_time=$6,status=$7,notes=$8,updated_at=$9 WHERE id=$10",[patients[0].id,patientName,patientPhone,appointmentDate,startTime,endTime,status,notes,now,id]);return getAppointment(id);}catch(error){const code=(error as {code?:string}).code||"",message=error instanceof Error?error.message:"";if(code==="23505"||message.includes("duplicate key"))throw new ClinicError("SLOT_UNAVAILABLE","الوقت الجديد محجوز بالفعل",409);throw error;}}
export async function cancelAppointment(id:string){return updateAppointment(id,{status:"cancelled"});}

export async function getStats(doctorId=DEFAULT_DOCTOR_ID,requestedRange=30):Promise<ClinicStats>{const rangeDays=Math.min(365,Math.max(1,Number(requestedRange)||30)),appointments=await listAppointments({doctorId}),now=cairoNow(),monthStart=`${now.date.slice(0,7)}-01`,last7Start=addDays(now.date,-6),last30Start=addDays(now.date,-29),rangeStart=addDays(now.date,-(rangeDays-1)),valid=appointments.filter(x=>x.status!=="cancelled"),upcoming=valid.filter(x=>x.status!=="completed"&&`${x.appointmentDate} ${x.startTime}`>`${now.date} ${now.time}`),outcomes=appointments.filter(x=>x.status==="completed"||x.status==="no_show"),completed=outcomes.filter(x=>x.status==="completed").length,noShows=outcomes.filter(x=>x.status==="no_show").length,patientRows=await query<{created_at:string}>("SELECT created_at FROM patients"),dayNames=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"],dayCounts=new Map<number,number>(),timeCounts=new Map<string,number>();for(const item of valid){const day=new Date(`${item.appointmentDate}T12:00:00Z`).getUTCDay();dayCounts.set(day,(dayCounts.get(day)||0)+1);timeCounts.set(item.startTime,(timeCounts.get(item.startTime)||0)+1);}const busyDay=[...dayCounts.entries()].sort((a,b)=>b[1]-a[1])[0],busyTime=[...timeCounts.entries()].sort((a,b)=>b[1]-a[1])[0],series=Array.from({length:7},(_,i)=>{const date=addDays(now.date,i-6);return{date,count:valid.filter(x=>x.appointmentDate===date).length};});return{today:valid.filter(x=>x.appointmentDate===now.date).length,upcoming:upcoming.length,completed:appointments.filter(x=>x.status==="completed").length,cancelled:appointments.filter(x=>x.status==="cancelled").length,patients:new Set(appointments.map(x=>x.patientId)).size,newPatientsThisMonth:patientRows.filter(x=>dateInCairo(String(x.created_at))>=monthStart).length,patientsToday:new Set(valid.filter(x=>x.appointmentDate===now.date).map(x=>x.patientId)).size,newBookings:appointments.filter(x=>dateInCairo(x.createdAt)===now.date).length,attendanceRate:outcomes.length?Math.round(completed/outcomes.length*100):0,noShowRate:outcomes.length?Math.round(noShows/outcomes.length*100):0,publicBookings:appointments.filter(x=>x.source==="public_booking").length,manualBookings:appointments.filter(x=>x.source==="manual").length,busiestDay:busyDay?dayNames[busyDay[0]]:"—",mostBookedTime:busyTime?.[0]||"—",last7Days:valid.filter(x=>x.appointmentDate>=last7Start&&x.appointmentDate<=now.date).length,last30Days:valid.filter(x=>x.appointmentDate>=last30Start&&x.appointmentDate<=now.date).length,rangeDays,rangeAppointments:valid.filter(x=>x.appointmentDate>=rangeStart&&x.appointmentDate<=now.date).length,nextAppointment:upcoming.sort((a,b)=>`${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`))[0]||null,sevenDaySeries:series};}

export const clinicDefaults={doctorId:DEFAULT_DOCTOR_ID,bookingSlug:DEFAULT_SLUG};
