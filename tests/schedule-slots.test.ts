import assert from "node:assert/strict";
import test from "node:test";
import { generateAvailabilitySlots } from "../lib/schedule-slots.ts";
import type { Schedule, ScheduleException } from "../lib/clinic-types.ts";

const friday = (patch: Partial<Schedule> = {}): Schedule => ({
  id: "schedule_5", doctorId: "doctor_reem", dayOfWeek: 5,
  startTime: "06:00", endTime: "12:00", slotDuration: 30, breakMinutes: 0, isActive: true,
  ...patch,
});
const exception = (patch: Partial<ScheduleException>): ScheduleException => ({
  id: "exception_test", doctorId: "doctor_reem", date: "2026-07-24", type: "break",
  startTime: "08:00", endTime: "09:00", reason: "", ...patch,
});
const slots = (schedule: Schedule, options: { booked?: string[]; exceptions?: ScheduleException[] } = {}) =>
  generateAvailabilitySlots({ schedule, date: "2026-07-24", maxDaily: 30, bookedStartTimes: options.booked, exceptions: options.exceptions });

test("Friday disabled returns no slots", () => assert.deepEqual(slots(friday({ isActive: false })), []));
test("Friday enabled at 06:00 starts exactly at 06:00", () => assert.equal(slots(friday())[0]?.startTime, "06:00"));
test("editing Friday from 09:00 to 06:00 uses 06:00", () => assert.equal(slots(friday({ startTime: "06:00" }))[0]?.startTime, "06:00"));
test("editing Friday from 06:00 to 10:00 uses 10:00", () => assert.equal(slots(friday({ startTime: "10:00" }))[0]?.startTime, "10:00"));
test("booked 06:30 is excluded without hiding adjacent slots", () => {
  assert.deepEqual(slots(friday(), { booked: ["06:30"] }).slice(0, 2).map((item) => item.startTime), ["06:00", "07:00"]);
});
test("break 08:00-09:00 excludes overlapping slots", () => {
  const result = slots(friday(), { exceptions: [exception({})] }).map((item) => item.startTime);
  assert.equal(result.includes("08:00"), false); assert.equal(result.includes("08:30"), false); assert.equal(result.includes("09:00"), true);
});
test("closed exception removes only the requested date slots", () => {
  assert.deepEqual(slots(friday(), { exceptions: [exception({ type: "closed", startTime: null, endTime: null })] }), []);
  assert.equal(generateAvailabilitySlots({ schedule: friday(), date: "2026-07-31", maxDaily: 30 })[0]?.startTime, "06:00");
});
