/** Daily agenda digest from calendar events (P2.15). */
import type { CalendarEvent } from "./calendar-read";
import { formatTimeLabel, ymdInTimezone, zonedWallClockToUtc } from "../lib/calendar-time";

export type CalendarAgendaItem = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  label: string;
  location: string | null;
  hasConflict: boolean;
};

export type CalendarAgendaResult = {
  accountId: string;
  accountEmail: string;
  date: string;
  timeZone: string;
  generatedAt: string;
  eventCount: number;
  conflictCount: number;
  items: CalendarAgendaItem[];
  summary: string;
};

function eventRange(event: CalendarEvent): { start: string; end: string } {
  return { start: event.start, end: event.end };
}

export function buildCalendarAgenda(input: {
  accountId: string;
  accountEmail: string;
  date: string;
  timeZone: string;
  events: CalendarEvent[];
}): CalendarAgendaResult {
  const timeZone = input.timeZone.trim() || "UTC";
  const date = input.date.trim() || ymdInTimezone(new Date(), timeZone);
  const sorted = [...input.events].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start)
  );

  const timedRanges = sorted.filter((event) => !event.allDay).map(eventRange);
  const conflictSet = new Set<string>();
  for (let i = 0; i < timedRanges.length; i++) {
    for (let j = i + 1; j < timedRanges.length; j++) {
      const a = timedRanges[i]!;
      const b = timedRanges[j]!;
      if (Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)) {
        conflictSet.add(sorted[i]!.id);
        conflictSet.add(sorted[j]!.id);
      }
    }
  }

  const items: CalendarAgendaItem[] = sorted.map((event) => ({
    id: event.id,
    summary: event.summary,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    label: event.allDay ? `${date} (all day)` : formatTimeLabel(event.start, timeZone),
    location: event.location,
    hasConflict: conflictSet.has(event.id),
  }));

  const conflictCount = conflictSet.size;
  const summary =
    items.length === 0
      ? `No events scheduled for ${date}.`
      : `${items.length} event(s) on ${date}` +
        (conflictCount ? `; ${conflictCount} with overlap conflicts.` : ".");

  return {
    accountId: input.accountId,
    accountEmail: input.accountEmail,
    date,
    timeZone,
    generatedAt: new Date().toISOString(),
    eventCount: items.length,
    conflictCount,
    items,
    summary,
  };
}

export function agendaDayBounds(
  date: string,
  timeZone: string
): { timeMin: string; timeMax: string } {
  return {
    timeMin: zonedWallClockToUtc(date, 0, 0, timeZone).toISOString(),
    timeMax: zonedWallClockToUtc(date, 23, 59, timeZone).toISOString(),
  };
}

/** Filter events that start on the given local date in timezone. */
export function filterEventsForLocalDate(
  events: CalendarEvent[],
  date: string,
  timeZone: string
): CalendarEvent[] {
  return events.filter((event) => {
    if (event.allDay && event.start.startsWith(date)) return true;
    const localDate = ymdInTimezone(new Date(event.start), timeZone);
    return localDate === date;
  });
}

