import type { AvailabilitySlot, Schedule, ScheduleException } from "./clinic-types";

export type SlotGenerationInput = {
  schedule: Schedule;
  exceptions?: ScheduleException[];
  bookedStartTimes?: Iterable<string>;
  maxDaily: number;
  date: string;
  now?: { date: string; time: string };
  minLeadHours?: number;
};

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function generateAvailabilitySlots({
  schedule,
  exceptions = [],
  bookedStartTimes = [],
  maxDaily,
  date,
  now,
  minLeadHours = 0,
}: SlotGenerationInput): AvailabilitySlot[] {
  if (!schedule.isActive || exceptions.some((item) => item.type === "closed")) return [];

  const booked = new Set(bookedStartTimes);
  if (booked.size >= maxDaily) return [];

  const firstMinute = timeToMinutes(schedule.startTime);
  const closingMinute = timeToMinutes(schedule.endTime);
  const step = schedule.slotDuration + schedule.breakMinutes;
  if (step <= 0 || closingMinute <= firstMinute) return [];

  const earliestToday = now && date === now.date
    ? timeToMinutes(now.time) + minLeadHours * 60
    : -1;
  const slots: AvailabilitySlot[] = [];

  for (let start = firstMinute; start + schedule.slotDuration <= closingMinute; start += step) {
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(start + schedule.slotDuration);
    if (booked.has(startTime) || start < earliestToday) continue;

    const overlapsBreak = exceptions.some((item) => item.type === "break" && item.startTime && item.endTime
      && start < timeToMinutes(item.endTime)
      && start + schedule.slotDuration > timeToMinutes(item.startTime));
    if (!overlapsBreak) slots.push({ startTime, endTime });
  }

  return slots.slice(0, Math.max(0, maxDaily - booked.size));
}
