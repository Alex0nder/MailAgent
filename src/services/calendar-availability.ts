/** Free/busy windows, conflict detection, slot suggestions (P2.13). */
import type { CalendarEvent } from "./calendar-read";
import {
  addDaysYmd,
  clampInt,
  formatTimeLabel,
  ymdInTimezone,
  zonedWallClockToUtc,
} from "../lib/calendar-time";

export type TimeRange = {
  start: string;
  end: string;
};

export type CalendarAvailabilitySlot = TimeRange & {
  label: string;
};

export type CalendarAvailabilityResult = {
  timeZone: string;
  durationMinutes: number;
  workingHours: { start: number; end: number };
  daysScanned: number;
  busyEvents: number;
  freeSlots: CalendarAvailabilitySlot[];
};

export type CalendarConflictResult = {
  hasConflict: boolean;
  conflicts: Array<{
    proposed: TimeRange;
    overlappingEvents: CalendarEvent[];
  }>;
};

function parseMs(iso: string): number {
  return Date.parse(iso);
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  const aStart = parseMs(a.start);
  const aEnd = parseMs(a.end);
  const bStart = parseMs(b.start);
  const bEnd = parseMs(b.end);
  return aStart < bEnd && bStart < aEnd;
}

function eventToRange(event: CalendarEvent): TimeRange | null {
  if (event.allDay) return null;
  return { start: event.start, end: event.end };
}

function busyRanges(events: CalendarEvent[]): TimeRange[] {
  return events
    .map(eventToRange)
    .filter((range): range is TimeRange => Boolean(range))
    .sort((a, b) => parseMs(a.start) - parseMs(b.start));
}

function mergeBusy(ranges: TimeRange[]): TimeRange[] {
  if (!ranges.length) return [];
  const merged: TimeRange[] = [{ ...ranges[0]! }];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (parseMs(range.start) <= parseMs(last.end)) {
      if (parseMs(range.end) > parseMs(last.end)) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function subtractBusyFromWindow(window: TimeRange, busy: TimeRange[]): TimeRange[] {
  let free: TimeRange[] = [window];
  for (const block of busy) {
    const next: TimeRange[] = [];
    for (const slot of free) {
      if (!overlaps(slot, block)) {
        next.push(slot);
        continue;
      }
      if (parseMs(block.start) > parseMs(slot.start)) {
        next.push({ start: slot.start, end: block.start });
      }
      if (parseMs(block.end) < parseMs(slot.end)) {
        next.push({ start: block.end, end: slot.end });
      }
    }
    free = next;
  }
  return free.filter((slot) => parseMs(slot.end) - parseMs(slot.start) > 0);
}

export function detectCalendarConflicts(
  events: CalendarEvent[],
  proposed: TimeRange[]
): CalendarConflictResult {
  const timedEvents = events.filter((event) => !event.allDay);
  const conflicts = proposed.map((slot) => ({
    proposed: slot,
    overlappingEvents: timedEvents.filter((event) => {
      const range = eventToRange(event);
      return range ? overlaps(slot, range) : false;
    }),
  }));

  return {
    hasConflict: conflicts.some((item) => item.overlappingEvents.length > 0),
    conflicts,
  };
}

export function computeCalendarAvailability(input: {
  events: CalendarEvent[];
  timeZone: string;
  days?: number;
  durationMinutes?: number;
  workingHoursStart?: number;
  workingHoursEnd?: number;
  maxSlots?: number;
  startFrom?: Date;
}): CalendarAvailabilityResult {
  const timeZone = input.timeZone.trim() || "UTC";
  const days = clampInt(Number(input.days ?? 7), 1, 14);
  const durationMinutes = clampInt(Number(input.durationMinutes ?? 30), 15, 240);
  const workingHoursStart = clampInt(Number(input.workingHoursStart ?? 9), 0, 23);
  const workingHoursEnd = clampInt(Number(input.workingHoursEnd ?? 18), 1, 24);
  const maxSlots = clampInt(Number(input.maxSlots ?? 8), 1, 20);
  const startFrom = input.startFrom ?? new Date();
  const durationMs = durationMinutes * 60_000;

  const busy = mergeBusy(busyRanges(input.events));
  const freeSlots: CalendarAvailabilitySlot[] = [];
  let ymd = ymdInTimezone(startFrom, timeZone);

  for (let day = 0; day < days && freeSlots.length < maxSlots; day++) {
    const dayYmd = addDaysYmd(ymd, day);
    const windowStart = zonedWallClockToUtc(dayYmd, workingHoursStart, 0, timeZone);
    const windowEnd = zonedWallClockToUtc(dayYmd, workingHoursEnd, 0, timeZone);
    const dayWindow: TimeRange = {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    };
    const dayBusy = busy.filter((range) => overlaps(range, dayWindow));
    const open = subtractBusyFromWindow(dayWindow, dayBusy);

    for (const slot of open) {
      let cursor = parseMs(slot.start);
      const endMs = parseMs(slot.end);
      while (cursor + durationMs <= endMs && freeSlots.length < maxSlots) {
        const startIso = new Date(cursor).toISOString();
        const endIso = new Date(cursor + durationMs).toISOString();
        freeSlots.push({
          start: startIso,
          end: endIso,
          label: formatTimeLabel(startIso, timeZone),
        });
        cursor += durationMs;
      }
    }
  }

  return {
    timeZone,
    durationMinutes,
    workingHours: { start: workingHoursStart, end: workingHoursEnd },
    daysScanned: days,
    busyEvents: input.events.filter((event) => !event.allDay).length,
    freeSlots,
  };
}
