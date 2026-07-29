CREATE TABLE IF NOT EXISTS "clinic_users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clinic_id" TEXT NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_users_clinic_id_email_key" ON "clinic_users"("clinic_id", "email");
CREATE INDEX IF NOT EXISTS "clinic_users_email_idx" ON "clinic_users"("email");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "clinic_users"("id") ON DELETE CASCADE,
  "clinic_id" TEXT NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "action_url" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_clinic_id_created_at_idx" ON "notifications"("clinic_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications"("type");

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "clinic_users"("id") ON DELETE CASCADE,
  "clinic_id" TEXT NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT NOT NULL DEFAULT '',
  "device_name" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_enabled_idx" ON "push_subscriptions"("user_id", "enabled");
CREATE INDEX IF NOT EXISTS "push_subscriptions_clinic_id_idx" ON "push_subscriptions"("clinic_id");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE REFERENCES "clinic_users"("id") ON DELETE CASCADE,
  "clinic_id" TEXT NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
  "new_bookings" BOOLEAN NOT NULL DEFAULT true,
  "cancellations" BOOLEAN NOT NULL DEFAULT true,
  "appointment_updates" BOOLEAN NOT NULL DEFAULT true,
  "patient_arrivals" BOOLEAN NOT NULL DEFAULT true,
  "appointment_reminders" BOOLEAN NOT NULL DEFAULT true,
  "reminder_minutes" INTEGER NOT NULL DEFAULT 30 CHECK ("reminder_minutes" IN (15, 30, 60)),
  "push_enabled" BOOLEAN NOT NULL DEFAULT true,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "notification_preferences_clinic_id_idx" ON "notification_preferences"("clinic_id");

CREATE TABLE IF NOT EXISTS "reminder_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "appointment_id" TEXT NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "clinic_users"("id") ON DELETE CASCADE,
  "clinic_id" TEXT NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
  "interval_minutes" INTEGER NOT NULL,
  "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("appointment_id", "user_id", "interval_minutes")
);
CREATE INDEX IF NOT EXISTS "reminder_deliveries_clinic_id_delivered_at_idx" ON "reminder_deliveries"("clinic_id", "delivered_at" DESC);

INSERT INTO "clinic_users" ("id", "clinic_id", "email", "name")
SELECT 'clinic_user_' || "id", "id", COALESCE(NULLIF("email", ''), 'local@alreem.clinic'), "name"
FROM "doctors"
ON CONFLICT ("clinic_id", "email") DO NOTHING;

INSERT INTO "notification_preferences" ("id", "user_id", "clinic_id")
SELECT 'notification_preferences_' || "id", "id", "clinic_id"
FROM "clinic_users"
ON CONFLICT ("user_id") DO NOTHING;
