import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
async function source(relative){return readFile(path.join(root,relative),"utf8");}
async function walk(directory){const entries=await readdir(path.join(root,directory),{withFileTypes:true});const files=[];for(const entry of entries){const relative=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await walk(relative));else if(/\.(ts|tsx|js|mjs)$/.test(entry.name))files.push(relative);}return files;}

test("appointment notification email integrations are fully removed",async()=>{const files=[...await walk("app"),...await walk("lib")];const forbidden=/RESEND_API_KEY|RESEND_FROM_EMAIL|\bresend\b|sendEmail|sendAppointmentEmail|sendBookingConfirmation|emailNotification|appointmentReminderEmail|booking-email|notifyBookingSafely/i;for(const file of files)assert.doesNotMatch(await source(file),forbidden,file);});

test("database migration contains persistent, isolated notification storage",async()=>{const sql=await source("prisma/migrations/20260717000300_notifications/migration.sql");for(const table of ["notifications","push_subscriptions","notification_preferences","reminder_deliveries","clinic_users"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));assert.match(sql,/UNIQUE \("appointment_id", "user_id", "interval_minutes"\)/);assert.match(sql,/notifications_user_id_is_read_created_at_idx/);});

test("all required notification and push APIs exist",async()=>{for(const route of ["app/api/notifications/route.ts","app/api/notifications/unread-count/route.ts","app/api/notifications/read-all/route.ts","app/api/notifications/[id]/read/route.ts","app/api/notification-preferences/route.ts","app/api/push/subscribe/route.ts","app/api/push/unsubscribe/route.ts","app/api/push/test/route.ts","app/api/cron/appointment-reminders/route.ts"])assert.ok((await source(route)).length>20,route);});

test("service worker handles push and safe notification clicks without API caching",async()=>{const sw=await source("public/sw.js");assert.match(sw,/addEventListener\("push"/);assert.match(sw,/showNotification/);assert.match(sw,/addEventListener\("notificationclick"/);assert.match(sw,/startsWith\("\/"\)/);assert.doesNotMatch(sw,/addEventListener\("fetch"/);});

test("private VAPID key is never referenced by client components",async()=>{const files=await walk("components");for(const file of files)assert.doesNotMatch(await source(file),/VAPID_PRIVATE_KEY/,file);});

test("appointment events use English digits and Cairo timezone",async()=>{const events=await source("lib/notification-events.ts");assert.match(events,/ar-EG-u-nu-latn/);assert.match(events,/Africa\/Cairo/);assert.doesNotMatch(events,/[٠-٩]/);});
