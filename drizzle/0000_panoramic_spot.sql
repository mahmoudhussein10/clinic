CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`patient_name` text NOT NULL,
	`patient_phone` text NOT NULL,
	`appointment_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_active_doctor_slot` ON `appointments` (`doctor_id`,`appointment_date`,`start_time`) WHERE "appointments"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX `appointment_date_idx` ON `appointments` (`doctor_id`,`appointment_date`);--> statement-breakpoint
CREATE INDEX `appointment_phone_idx` ON `appointments` (`patient_phone`);--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`specialization` text NOT NULL,
	`phone` text NOT NULL,
	`clinic_name` text NOT NULL,
	`booking_slug` text NOT NULL,
	`timezone` text DEFAULT 'Africa/Cairo' NOT NULL,
	`booking_enabled` integer DEFAULT true NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`max_daily` integer DEFAULT 20 NOT NULL,
	`min_lead_hours` integer DEFAULT 2 NOT NULL,
	`max_future_days` integer DEFAULT 60 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctors_booking_slug_unique` ON `doctors` (`booking_slug`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_phone_unique` ON `patients` (`phone`);--> statement-breakpoint
CREATE TABLE `schedule_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`slot_duration` integer NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_doctor_day` ON `schedules` (`doctor_id`,`day_of_week`);