CREATE TABLE "doctors" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "specialization" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "clinic_name" TEXT NOT NULL,
  "booking_slug" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
  "booking_enabled" BOOLEAN NOT NULL DEFAULT true,
  "address" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "max_daily" INTEGER NOT NULL DEFAULT 20,
  "min_lead_hours" INTEGER NOT NULL DEFAULT 2,
  "max_future_days" INTEGER NOT NULL DEFAULT 90,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patients" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
  "id" TEXT NOT NULL,
  "doctor_id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "patient_name" TEXT NOT NULL,
  "patient_phone" TEXT NOT NULL,
  "appointment_date" DATE NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "notes" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
  CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT
);

CREATE TABLE "schedules" (
  "id" TEXT NOT NULL,
  "doctor_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "slot_duration" INTEGER NOT NULL DEFAULT 30,
  "break_minutes" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
  CONSTRAINT "schedules_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "schedules_duration_check" CHECK ("slot_duration" > 0)
);

CREATE TABLE "schedule_exceptions" (
  "id" TEXT NOT NULL,
  "doctor_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" TEXT NOT NULL,
  "start_time" VARCHAR(5),
  "end_time" VARCHAR(5),
  "reason" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_exceptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
  CONSTRAINT "schedule_exceptions_type_check" CHECK ("type" IN ('closed', 'break'))
);

CREATE UNIQUE INDEX "doctors_booking_slug_key" ON "doctors"("booking_slug");
CREATE UNIQUE INDEX "patients_phone_key" ON "patients"("phone");
CREATE UNIQUE INDEX "schedules_doctor_id_day_of_week_key" ON "schedules"("doctor_id", "day_of_week");
CREATE UNIQUE INDEX "unique_active_doctor_slot" ON "appointments"("doctor_id", "appointment_date", "start_time") WHERE "status" <> 'cancelled';
CREATE INDEX "appointments_doctor_id_appointment_date_idx" ON "appointments"("doctor_id", "appointment_date");
CREATE INDEX "appointments_patient_phone_idx" ON "appointments"("patient_phone");
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");
CREATE INDEX "schedule_exceptions_doctor_id_date_idx" ON "schedule_exceptions"("doctor_id", "date");

INSERT INTO "doctors" ("id", "name", "specialization", "phone", "clinic_name", "booking_slug", "timezone", "booking_enabled", "address", "bio", "max_daily", "min_lead_hours", "max_future_days")
VALUES ('doctor_reem', 'د. ريم', 'طب عام ومتابعة', '201000000000', 'عيادة الريم', 'alreem-clinic', 'Africa/Cairo', true, 'القاهرة، مصر', 'رعاية طبية منظمة ومواعيد دقيقة بدون انتظار.', 20, 2, 90);

INSERT INTO "schedules" ("id", "doctor_id", "day_of_week", "start_time", "end_time", "slot_duration", "break_minutes", "is_active") VALUES
('schedule_0', 'doctor_reem', 0, '09:00', '17:00', 30, 0, true),
('schedule_1', 'doctor_reem', 1, '09:00', '17:00', 30, 0, true),
('schedule_2', 'doctor_reem', 2, '09:00', '17:00', 30, 0, true),
('schedule_3', 'doctor_reem', 3, '09:00', '17:00', 30, 0, true),
('schedule_4', 'doctor_reem', 4, '09:00', '17:00', 30, 0, true),
('schedule_5', 'doctor_reem', 5, '09:00', '17:00', 30, 0, false),
('schedule_6', 'doctor_reem', 6, '09:00', '17:00', 30, 0, true);
