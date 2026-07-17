import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://localhost:3000";
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${path}: ${response.status} ${payload.message || ""}`);
  return payload.data;
}

const testDate = "2026-07-24";
const original = await request("/api/schedule");
let appointmentId = null;
const exceptionIds = [];

async function saveFriday(startTime, isActive = true) {
  const schedules = original.schedules.map((day) => day.dayOfWeek === 5
    ? { ...day, isActive, startTime, endTime: "12:00", slotDuration: 30, breakMinutes: 0 }
    : day);
  return request("/api/schedule", {
    method: "PUT",
    body: JSON.stringify({
      bookingEnabled: original.doctor.bookingEnabled,
      maxDaily: original.doctor.maxDaily,
      minLeadHours: original.doctor.minLeadHours,
      maxFutureDays: original.doctor.maxFutureDays,
      schedules,
    }),
  });
}

async function availability() {
  return request(`/api/availability?date=${testDate}&_=${Date.now()}`);
}

try {
  await saveFriday("06:00", false);
  assert.deepEqual(await availability(), [], "disabled Friday must have no slots");

  await saveFriday("06:00");
  assert.equal((await availability())[0]?.startTime, "06:00", "Friday must begin at saved 06:00");
  assert.equal((await request("/api/schedule")).schedules.find((day) => day.dayOfWeek === 5).startTime, "06:00");

  await saveFriday("10:00");
  assert.equal((await availability())[0]?.startTime, "10:00", "edited Friday must begin at 10:00");

  await saveFriday("06:00");
  const appointment = await request("/api/appointments", {
    method: "POST",
    body: JSON.stringify({ patientName: "اختبار الجدول", patientPhone: "01012345678", appointmentDate: testDate, startTime: "06:30", notes: "اختبار تلقائي" }),
  });
  appointmentId = appointment.id;
  const afterBooking = (await availability()).map((slot) => slot.startTime);
  assert.equal(afterBooking.includes("06:30"), false);
  assert.equal(afterBooking.includes("06:00"), true);
  assert.equal(afterBooking.includes("07:00"), true);

  const withBreak = await request("/api/schedule", {
    method: "POST",
    body: JSON.stringify({ date: testDate, type: "break", startTime: "08:00", endTime: "09:00", reason: "اختبار" }),
  });
  const breakItem = withBreak.exceptions.at(-1); exceptionIds.push(breakItem.id);
  const afterBreak = (await availability()).map((slot) => slot.startTime);
  assert.equal(afterBreak.includes("08:00"), false); assert.equal(afterBreak.includes("08:30"), false);
  await request(`/api/schedule?id=${breakItem.id}`, { method: "DELETE" }); exceptionIds.pop();

  const withClosure = await request("/api/schedule", {
    method: "POST",
    body: JSON.stringify({ date: testDate, type: "closed", reason: "اختبار" }),
  });
  const closure = withClosure.exceptions.at(-1); exceptionIds.push(closure.id);
  assert.deepEqual(await availability(), []);
  await request(`/api/schedule?id=${closure.id}`, { method: "DELETE" }); exceptionIds.pop();

  console.log("schedule API integration: 9 scenarios passed");
} finally {
  if (appointmentId) await request(`/api/appointments/${appointmentId}`, { method: "DELETE" }).catch(() => {});
  for (const id of exceptionIds) await request(`/api/schedule?id=${id}`, { method: "DELETE" }).catch(() => {});
  await request("/api/schedule", {
    method: "PUT",
    body: JSON.stringify({
      bookingEnabled: original.doctor.bookingEnabled,
      maxDaily: original.doctor.maxDaily,
      minLeadHours: original.doctor.minLeadHours,
      maxFutureDays: original.doctor.maxFutureDays,
      schedules: original.schedules,
    }),
  });
}
