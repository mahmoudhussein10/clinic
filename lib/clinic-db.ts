import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  AvailabilitySlot,
  ClinicStats,
  Doctor,
  Schedule,
  ScheduleException,
} from "./clinic-types";

const DEFAULT_DOCTOR_ID = "doctor_reem";
const DEFAULT_SLUG = "alreem-clinic";
const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed", "completed", "no_show"];

type DbAppointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string;
  source: AppointmentSource;
  created_at: string;
  updated_at: string;
};

type DbDoctor = {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  clinic_name: string;
  booking_slug: string;
  timezone: string;
  booking_enabled: number;
  address: string;
  bio: string;
  max_daily: number;
  min_lead_hours: number;
  max_future_days: number;
};

type DbSchedule = {
  id: string;
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration: number;
  break_minutes: number;
  is_active: number;
};

type DbException = {
  id: string;
  doctor_id: string;
  date: string;
  type: "closed" | "break";
  start_time: string | null;
  end_time: string | null;
  reason: string;
};

type ClinicGlobal = typeof globalThis & { __clinicDb?: DatabaseSync };

export class ClinicError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function databasePath() {
  return process.env.CLINIC_DB_PATH || join(process.cwd(), ".data", "clinic.db");
}

function getDb() {
  const globalRef = globalThis as ClinicGlobal;
  if (globalRef.__clinicDb) return globalRef.__clinicDb;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  globalRef.__clinicDb = db;
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialization TEXT NOT NULL,
      phone TEXT NOT NULL,
      clinic_name TEXT NOT NULL,
      booking_slug TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
      booking_enabled INTEGER NOT NULL DEFAULT 1,
      address TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      max_daily INTEGER NOT NULL DEFAULT 20,
      min_lead_hours INTEGER NOT NULL DEFAULT 2,
      max_future_days INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES doctors(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','confirmed','completed','cancelled','no_show')),
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL CHECK(source IN ('public_booking','manual','whatsapp')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot
      ON appointments(doctor_id, appointment_date, start_time)
      WHERE status <> 'cancelled';
    CREATE INDEX IF NOT EXISTS appointment_date_idx ON appointments(doctor_id, appointment_date);
    CREATE INDEX IF NOT EXISTS appointment_phone_idx ON appointments(patient_phone);
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES doctors(id),
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration INTEGER NOT NULL,
      break_minutes INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(doctor_id, day_of_week)
    );
    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES doctors(id),
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('closed','break')),
      start_time TEXT,
      end_time TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO doctors
    (id,name,specialization,phone,clinic_name,booking_slug,timezone,booking_enabled,address,bio,max_daily,min_lead_hours,max_future_days,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      DEFAULT_DOCTOR_ID,
      "د. ريم",
      "طب عام ومتابعة",
      "201000000000",
      "عيادة الريم",
      DEFAULT_SLUG,
      "Africa/Cairo",
      1,
      "القاهرة، مصر",
      "رعاية طبية منظمة ومواعيد دقيقة بدون انتظار طويل.",
      20,
      2,
      60,
      now,
      now,
    );

  for (const day of [0, 1, 2, 3, 4, 6]) {
    db.prepare(`INSERT OR IGNORE INTO schedules
      (id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active)
      VALUES (?,?,?,?,?,?,?,?)`).run(
        `schedule_${day}`,
        DEFAULT_DOCTOR_ID,
        day,
        "16:00",
        "22:00",
        30,
        0,
        1,
      );
  }
  db.prepare(`INSERT OR IGNORE INTO schedules
    (id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active)
    VALUES (?,?,?,?,?,?,?,?)`).run("schedule_5", DEFAULT_DOCTOR_ID, 5, "16:00", "22:00", 30, 0, 0);
}

function mapAppointment(row: DbAppointment): Appointment {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    appointmentDate: row.appointment_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    notes: row.notes,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDoctor(row: DbDoctor): Doctor {
  return {
    id: row.id,
    name: row.name,
    specialization: row.specialization,
    phone: row.phone,
    clinicName: row.clinic_name,
    bookingSlug: row.booking_slug,
    timezone: row.timezone,
    bookingEnabled: Boolean(row.booking_enabled),
    address: row.address,
    bio: row.bio,
    maxDaily: row.max_daily,
    minLeadHours: row.min_lead_hours,
    maxFutureDays: row.max_future_days,
  };
}

function mapSchedule(row: DbSchedule): Schedule {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotDuration: row.slot_duration,
    breakMinutes: row.break_minutes,
    isActive: Boolean(row.is_active),
  };
}

function mapException(row: DbException): ScheduleException {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    date: row.date,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
  };
}

function cleanName(value: unknown) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new ClinicError("INVALID_PATIENT_NAME", "اكتب اسم المريض بشكل صحيح");
  }
  return name;
}

export function normalizeEgyptPhone(value: unknown) {
  let phone = String(value || "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0020")) phone = phone.slice(2);
  if (phone.startsWith("01") && phone.length === 11) phone = `20${phone.slice(1)}`;
  if (!/^20(?:10|11|12|15)\d{8}$/.test(phone)) {
    throw new ClinicError("INVALID_PHONE", "أدخل رقم موبايل مصري صحيح مثل 01012345678");
  }
  return phone;
}

function validDate(value: unknown) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    throw new ClinicError("INVALID_DATE", "اختر تاريخًا صحيحًا");
  }
  return date;
}

function validTime(value: unknown) {
  const time = String(value || "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new ClinicError("INVALID_TIME", "اختر وقتًا صحيحًا");
  }
  return time;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function cairoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function dateInCairo(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(iso));
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getDoctorBySlug(slug = DEFAULT_SLUG) {
  const row = getDb().prepare("SELECT * FROM doctors WHERE booking_slug = ?").get(slug) as DbDoctor | undefined;
  return row ? mapDoctor(row) : null;
}

export function getDoctor(id = DEFAULT_DOCTOR_ID) {
  const row = getDb().prepare("SELECT * FROM doctors WHERE id = ?").get(id) as DbDoctor | undefined;
  if (!row) throw new ClinicError("DOCTOR_NOT_FOUND", "بيانات الطبيبة غير موجودة", 404);
  return mapDoctor(row);
}

export function listSchedule(doctorId = DEFAULT_DOCTOR_ID) {
  const db = getDb();
  const schedules = (db.prepare("SELECT * FROM schedules WHERE doctor_id = ? ORDER BY day_of_week").all(doctorId) as DbSchedule[]).map(mapSchedule);
  const exceptions = (db.prepare("SELECT * FROM schedule_exceptions WHERE doctor_id = ? ORDER BY date").all(doctorId) as DbException[]).map(mapException);
  return { doctor: getDoctor(doctorId), schedules, exceptions };
}

export function updateSchedule(input: {
  doctorId?: string;
  bookingEnabled?: boolean;
  maxDaily?: number;
  minLeadHours?: number;
  maxFutureDays?: number;
  schedules?: Array<Partial<Schedule> & { dayOfWeek: number }>;
}) {
  const doctorId = input.doctorId || DEFAULT_DOCTOR_ID;
  const db = getDb();
  const doctor = getDoctor(doctorId);
  const maxDaily = Math.min(100, Math.max(1, Number(input.maxDaily ?? doctor.maxDaily)));
  const minLeadHours = Math.min(168, Math.max(0, Number(input.minLeadHours ?? doctor.minLeadHours)));
  const maxFutureDays = Math.min(365, Math.max(1, Number(input.maxFutureDays ?? doctor.maxFutureDays)));
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE doctors SET booking_enabled=?, max_daily=?, min_lead_hours=?, max_future_days=?, updated_at=? WHERE id=?`).run(
      input.bookingEnabled ?? doctor.bookingEnabled ? 1 : 0,
      maxDaily,
      minLeadHours,
      maxFutureDays,
      now,
      doctorId,
    );
    for (const item of input.schedules || []) {
      if (item.dayOfWeek < 0 || item.dayOfWeek > 6) continue;
      const start = validTime(item.startTime || "16:00");
      const end = validTime(item.endTime || "22:00");
      if (timeToMinutes(end) <= timeToMinutes(start)) {
        throw new ClinicError("INVALID_SCHEDULE", "وقت نهاية العمل يجب أن يكون بعد وقت البداية");
      }
      const duration = [15, 20, 30, 45, 60].includes(Number(item.slotDuration)) ? Number(item.slotDuration) : 30;
      const breakMinutes = Math.min(120, Math.max(0, Number(item.breakMinutes || 0)));
      db.prepare(`INSERT INTO schedules (id,doctor_id,day_of_week,start_time,end_time,slot_duration,break_minutes,is_active)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(doctor_id,day_of_week) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,slot_duration=excluded.slot_duration,break_minutes=excluded.break_minutes,is_active=excluded.is_active`).run(
          item.id || `schedule_${item.dayOfWeek}`,
          doctorId,
          item.dayOfWeek,
          start,
          end,
          duration,
          breakMinutes,
          item.isActive ? 1 : 0,
        );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listSchedule(doctorId);
}

export function addScheduleException(input: {
  doctorId?: string;
  date: string;
  type: "closed" | "break";
  startTime?: string;
  endTime?: string;
  reason?: string;
}) {
  const doctorId = input.doctorId || DEFAULT_DOCTOR_ID;
  const date = validDate(input.date);
  const type = input.type === "break" ? "break" : "closed";
  const start = type === "break" ? validTime(input.startTime) : null;
  const end = type === "break" ? validTime(input.endTime) : null;
  if (start && end && timeToMinutes(end) <= timeToMinutes(start)) {
    throw new ClinicError("INVALID_EXCEPTION", "نهاية الاستراحة يجب أن تكون بعد بدايتها");
  }
  const id = `exception_${randomUUID()}`;
  getDb().prepare(`INSERT INTO schedule_exceptions (id,doctor_id,date,type,start_time,end_time,reason,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(
    id,
    doctorId,
    date,
    type,
    start,
    end,
    String(input.reason || "").trim().slice(0, 160),
    new Date().toISOString(),
  );
  return listSchedule(doctorId);
}

export function deleteScheduleException(id: string) {
  const result = getDb().prepare("DELETE FROM schedule_exceptions WHERE id = ?").run(id);
  if (!result.changes) throw new ClinicError("EXCEPTION_NOT_FOUND", "الاستثناء غير موجود", 404);
  return { id };
}

export function getAvailability(options: { date: string; doctorId?: string; excludeAppointmentId?: string }) {
  const date = validDate(options.date);
  const doctorId = options.doctorId || DEFAULT_DOCTOR_ID;
  const doctor = getDoctor(doctorId);
  const now = cairoNow();
  if (date < now.date || date > addDays(now.date, doctor.maxFutureDays)) return [];

  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const scheduleRow = getDb().prepare("SELECT * FROM schedules WHERE doctor_id = ? AND day_of_week = ?").get(doctorId, day) as DbSchedule | undefined;
  if (!scheduleRow || !scheduleRow.is_active) return [];
  const schedule = mapSchedule(scheduleRow);
  const exceptions = (getDb().prepare("SELECT * FROM schedule_exceptions WHERE doctor_id = ? AND date = ?").all(doctorId, date) as DbException[]).map(mapException);
  if (exceptions.some((item) => item.type === "closed")) return [];

  const params: Array<string> = [doctorId, date];
  let appointmentSql = "SELECT start_time FROM appointments WHERE doctor_id=? AND appointment_date=? AND status <> 'cancelled'";
  if (options.excludeAppointmentId) {
    appointmentSql += " AND id <> ?";
    params.push(options.excludeAppointmentId);
  }
  const booked = new Set(
    (getDb().prepare(appointmentSql).all(...params) as Array<{ start_time: string }>).map((row) => row.start_time),
  );
  if (booked.size >= doctor.maxDaily) return [];

  const slots: AvailabilitySlot[] = [];
  const end = timeToMinutes(schedule.endTime);
  const step = schedule.slotDuration + schedule.breakMinutes;
  for (let start = timeToMinutes(schedule.startTime); start + schedule.slotDuration <= end; start += step) {
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(start + schedule.slotDuration);
    if (booked.has(startTime)) continue;
    if (date === now.date && start < timeToMinutes(now.time) + doctor.minLeadHours * 60) continue;
    const blocked = exceptions.some((item) => {
      if (item.type !== "break" || !item.startTime || !item.endTime) return false;
      return start < timeToMinutes(item.endTime) && start + schedule.slotDuration > timeToMinutes(item.startTime);
    });
    if (!blocked) slots.push({ startTime, endTime });
  }
  return slots.slice(0, Math.max(0, doctor.maxDaily - booked.size));
}

export function listAppointments(filters: {
  doctorId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: AppointmentStatus | "all";
  search?: string;
} = {}) {
  const clauses = ["doctor_id = ?"];
  const params: Array<string> = [filters.doctorId || DEFAULT_DOCTOR_ID];
  if (filters.date) { clauses.push("appointment_date = ?"); params.push(validDate(filters.date)); }
  if (filters.startDate) { clauses.push("appointment_date >= ?"); params.push(validDate(filters.startDate)); }
  if (filters.endDate) { clauses.push("appointment_date <= ?"); params.push(validDate(filters.endDate)); }
  if (filters.status && filters.status !== "all") { clauses.push("status = ?"); params.push(filters.status); }
  if (filters.search) {
    clauses.push("(patient_name LIKE ? OR patient_phone LIKE ?)");
    const term = `%${filters.search.trim()}%`;
    params.push(term, term);
  }
  const rows = getDb().prepare(`SELECT * FROM appointments WHERE ${clauses.join(" AND ")} ORDER BY appointment_date,start_time`).all(...params) as DbAppointment[];
  return rows.map(mapAppointment);
}

export function getAppointment(id: string) {
  const row = getDb().prepare("SELECT * FROM appointments WHERE id = ?").get(id) as DbAppointment | undefined;
  if (!row) throw new ClinicError("APPOINTMENT_NOT_FOUND", "الموعد غير موجود", 404);
  return mapAppointment(row);
}

export function createAppointment(input: {
  doctorId?: string;
  patientName: unknown;
  patientPhone: unknown;
  appointmentDate: unknown;
  startTime: unknown;
  notes?: unknown;
  source?: AppointmentSource;
  status?: AppointmentStatus;
}) {
  const doctorId = input.doctorId || DEFAULT_DOCTOR_ID;
  const patientName = cleanName(input.patientName);
  const patientPhone = normalizeEgyptPhone(input.patientPhone);
  const appointmentDate = validDate(input.appointmentDate);
  const startTime = validTime(input.startTime);
  const notes = String(input.notes || "").trim().slice(0, 500);
  const source = input.source && ["public_booking", "manual", "whatsapp"].includes(input.source) ? input.source : "manual";
  const status: AppointmentStatus = input.status && ACTIVE_STATUSES.includes(input.status) ? input.status : source === "public_booking" ? "pending" : "confirmed";
  const slot = getAvailability({ date: appointmentDate, doctorId }).find((item) => item.startTime === startTime);
  if (!slot) throw new ClinicError("SLOT_UNAVAILABLE", "هذا الموعد غير متاح أو تم حجزه بالفعل", 409);

  const db = getDb();
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    let patient = db.prepare("SELECT id FROM patients WHERE phone = ?").get(patientPhone) as { id: string } | undefined;
    if (!patient) {
      patient = { id: `patient_${randomUUID()}` };
      db.prepare("INSERT INTO patients (id,name,phone,notes,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(
        patient.id, patientName, patientPhone, notes, now, now,
      );
    } else {
      db.prepare("UPDATE patients SET name=?, notes=CASE WHEN ? <> '' THEN ? ELSE notes END, updated_at=? WHERE id=?").run(
        patientName, notes, notes, now, patient.id,
      );
    }
    const id = `appointment_${randomUUID()}`;
    db.prepare(`INSERT INTO appointments
      (id,doctor_id,patient_id,patient_name,patient_phone,appointment_date,start_time,end_time,status,notes,source,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, doctorId, patient.id, patientName, patientPhone, appointmentDate, startTime, slot.endTime, status, notes, source, now, now,
      );
    db.exec("COMMIT");
    return getAppointment(id);
  } catch (error) {
    db.exec("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unique_active_doctor_slot") || message.includes("UNIQUE constraint")) {
      throw new ClinicError("SLOT_UNAVAILABLE", "هذا الموعد تم حجزه بالفعل، اختر موعدًا آخر", 409);
    }
    throw error;
  }
}

export function updateAppointment(id: string, input: Partial<{
  patientName: unknown;
  patientPhone: unknown;
  appointmentDate: unknown;
  startTime: unknown;
  notes: unknown;
  status: AppointmentStatus;
}>) {
  const current = getAppointment(id);
  const patientName = input.patientName === undefined ? current.patientName : cleanName(input.patientName);
  const patientPhone = input.patientPhone === undefined ? current.patientPhone : normalizeEgyptPhone(input.patientPhone);
  const appointmentDate = input.appointmentDate === undefined ? current.appointmentDate : validDate(input.appointmentDate);
  const startTime = input.startTime === undefined ? current.startTime : validTime(input.startTime);
  const notes = input.notes === undefined ? current.notes : String(input.notes || "").trim().slice(0, 500);
  const status = input.status === undefined ? current.status : input.status;
  if (!["pending", "confirmed", "completed", "cancelled", "no_show"].includes(status)) {
    throw new ClinicError("INVALID_STATUS", "حالة الموعد غير صحيحة");
  }

  let endTime = current.endTime;
  if ((appointmentDate !== current.appointmentDate || startTime !== current.startTime) && status !== "cancelled") {
    const slot = getAvailability({ date: appointmentDate, doctorId: current.doctorId, excludeAppointmentId: id }).find((item) => item.startTime === startTime);
    if (!slot) throw new ClinicError("SLOT_UNAVAILABLE", "الوقت الجديد غير متاح", 409);
    endTime = slot.endTime;
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE patients SET name=?, phone=?, notes=CASE WHEN ? <> '' THEN ? ELSE notes END, updated_at=? WHERE id=?").run(
      patientName, patientPhone, notes, notes, now, current.patientId,
    );
    db.prepare(`UPDATE appointments SET patient_name=?,patient_phone=?,appointment_date=?,start_time=?,end_time=?,status=?,notes=?,updated_at=? WHERE id=?`).run(
      patientName, patientPhone, appointmentDate, startTime, endTime, status, notes, now, id,
    );
    db.exec("COMMIT");
    return getAppointment(id);
  } catch (error) {
    db.exec("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint")) throw new ClinicError("SLOT_UNAVAILABLE", "الوقت الجديد محجوز بالفعل", 409);
    throw error;
  }
}

export function cancelAppointment(id: string) {
  return updateAppointment(id, { status: "cancelled" });
}

export function getStats(doctorId = DEFAULT_DOCTOR_ID, requestedRange = 30): ClinicStats {
  const rangeDays = Math.min(365, Math.max(1, Number(requestedRange) || 30));
  const appointments = listAppointments({ doctorId });
  const now = cairoNow();
  const monthStart = `${now.date.slice(0, 7)}-01`;
  const last7Start = addDays(now.date, -6);
  const last30Start = addDays(now.date, -29);
  const rangeStart = addDays(now.date, -(rangeDays - 1));
  const validAppointments = appointments.filter((item) => item.status !== "cancelled");
  const upcomingItems = validAppointments.filter((item) =>
    item.status !== "completed" && `${item.appointmentDate} ${item.startTime}` > `${now.date} ${now.time}`,
  );
  const outcomes = appointments.filter((item) => item.status === "completed" || item.status === "no_show");
  const completed = outcomes.filter((item) => item.status === "completed").length;
  const noShows = outcomes.filter((item) => item.status === "no_show").length;
  const uniquePatients = new Set(appointments.map((item) => item.patientId));
  const patientRows = getDb().prepare("SELECT created_at FROM patients").all() as Array<{ created_at: string }>;
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayCounts = new Map<number, number>();
  const timeCounts = new Map<string, number>();
  for (const item of validAppointments) {
    const day = new Date(`${item.appointmentDate}T12:00:00Z`).getUTCDay();
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    timeCounts.set(item.startTime, (timeCounts.get(item.startTime) || 0) + 1);
  }
  const busiestDayEntry = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const busiestTimeEntry = [...timeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const sevenDaySeries = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now.date, index - 6);
    return { date, count: validAppointments.filter((item) => item.appointmentDate === date).length };
  });

  return {
    today: validAppointments.filter((item) => item.appointmentDate === now.date).length,
    upcoming: upcomingItems.length,
    completed: appointments.filter((item) => item.status === "completed").length,
    cancelled: appointments.filter((item) => item.status === "cancelled").length,
    patients: uniquePatients.size,
    newPatientsThisMonth: patientRows.filter((item) => dateInCairo(item.created_at) >= monthStart).length,
    patientsToday: new Set(validAppointments.filter((item) => item.appointmentDate === now.date).map((item) => item.patientId)).size,
    newBookings: appointments.filter((item) => dateInCairo(item.createdAt) === now.date).length,
    attendanceRate: outcomes.length ? Math.round((completed / outcomes.length) * 100) : 0,
    noShowRate: outcomes.length ? Math.round((noShows / outcomes.length) * 100) : 0,
    publicBookings: appointments.filter((item) => item.source === "public_booking").length,
    manualBookings: appointments.filter((item) => item.source === "manual").length,
    busiestDay: busiestDayEntry ? dayNames[busiestDayEntry[0]] : "—",
    mostBookedTime: busiestTimeEntry?.[0] || "—",
    last7Days: validAppointments.filter((item) => item.appointmentDate >= last7Start && item.appointmentDate <= now.date).length,
    last30Days: validAppointments.filter((item) => item.appointmentDate >= last30Start && item.appointmentDate <= now.date).length,
    rangeDays,
    rangeAppointments: validAppointments.filter((item) => item.appointmentDate >= rangeStart && item.appointmentDate <= now.date).length,
    nextAppointment: upcomingItems.sort((a, b) => `${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`))[0] || null,
    sevenDaySeries,
  };
}

export const clinicDefaults = { doctorId: DEFAULT_DOCTOR_ID, bookingSlug: DEFAULT_SLUG };

