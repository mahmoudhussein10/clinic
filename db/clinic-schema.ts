import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const doctors = sqliteTable("doctors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialization: text("specialization").notNull(),
  phone: text("phone").notNull(),
  clinicName: text("clinic_name").notNull(),
  bookingSlug: text("booking_slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Africa/Cairo"),
  bookingEnabled: integer("booking_enabled", { mode: "boolean" }).notNull().default(true),
  address: text("address").notNull().default(""),
  bio: text("bio").notNull().default(""),
  maxDaily: integer("max_daily").notNull().default(20),
  minLeadHours: integer("min_lead_hours").notNull().default(2),
  maxFutureDays: integer("max_future_days").notNull().default(60),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const patients = sqliteTable("patients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  doctorId: text("doctor_id").notNull().references(() => doctors.id),
  patientId: text("patient_id").notNull().references(() => patients.id),
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone").notNull(),
  appointmentDate: text("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status", { enum: ["pending", "confirmed", "completed", "cancelled", "no_show"] }).notNull(),
  notes: text("notes").notNull().default(""),
  source: text("source", { enum: ["public_booking", "manual", "whatsapp"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("unique_active_doctor_slot").on(table.doctorId, table.appointmentDate, table.startTime).where(sql`${table.status} <> 'cancelled'`),
  index("appointment_date_idx").on(table.doctorId, table.appointmentDate),
  index("appointment_phone_idx").on(table.patientPhone),
]);

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  doctorId: text("doctor_id").notNull().references(() => doctors.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  slotDuration: integer("slot_duration").notNull(),
  breakMinutes: integer("break_minutes").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("unique_doctor_day").on(table.doctorId, table.dayOfWeek)]);

export const scheduleExceptions = sqliteTable("schedule_exceptions", {
  id: text("id").primaryKey(),
  doctorId: text("doctor_id").notNull().references(() => doctors.id),
  date: text("date").notNull(),
  type: text("type", { enum: ["closed", "break"] }).notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

