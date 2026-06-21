/** Orchestration: calendar availability, agenda, meeting suggest (P2). */
import type { Env } from "../env";
import { zonedWallClockToUtc, ymdInTimezone } from "../lib/calendar-time";
import {
  agendaDayBounds,
  buildCalendarAgenda,
  filterEventsForLocalDate,
  type CalendarAgendaResult,
} from "./calendar-agenda";
import {
  computeCalendarAvailability,
  detectCalendarConflicts,
  type CalendarAvailabilityResult,
  type CalendarConflictResult,
  type TimeRange,
} from "./calendar-availability";
import { loadCalendarEventsInRange, listCalendarEvents } from "./calendar-read";
import {
  suggestMeetingSlots,
  type MeetingSuggestResult,
} from "./calendar-meeting-suggest";
import { getUserCalendarAccount } from "./user-calendar-accounts";
import type { WorkspaceMailMessage } from "./workspace-agent";
import type { WorkspaceReminderAuth } from "./workspace-reminders";

async function loadAccountEmail(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<
  | { ok: true; accountEmail: string }
  | { ok: false; status: 404; error: string }
> {
  const account = await getUserCalendarAccount(env, auth, accountId);
  if (!account) return { ok: false, status: 404, error: "calendar_account_not_found" };
  return { ok: true, accountEmail: account.email };
}

function rangeFromDays(timeZone: string, days: number): { timeMin: string; timeMax: string } {
  const now = new Date();
  const startYmd = ymdInTimezone(now, timeZone);
  const endYmd = ymdInTimezone(
    new Date(now.getTime() + days * 86_400_000),
    timeZone
  );
  return {
    timeMin: zonedWallClockToUtc(startYmd, 0, 0, timeZone).toISOString(),
    timeMax: zonedWallClockToUtc(endYmd, 23, 59, timeZone).toISOString(),
  };
}

export async function getCalendarAvailability(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    timeZone?: string;
    days?: number;
    durationMinutes?: number;
    workingHoursStart?: number;
    workingHoursEnd?: number;
    maxSlots?: number;
  }
): Promise<CalendarAvailabilityResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  const account = await loadAccountEmail(env, auth, accountId);
  if (!account.ok) return { error: account.error, status: account.status };

  const timeZone = input.timeZone?.trim() || "UTC";
  const days = input.days ?? 7;
  const { timeMin, timeMax } = rangeFromDays(timeZone, days);
  const events = await loadCalendarEventsInRange(env, auth, {
    accountId,
    timeMin,
    timeMax,
  });
  if ("error" in events) return events;

  return computeCalendarAvailability({
    events,
    timeZone,
    days,
    durationMinutes: input.durationMinutes,
    workingHoursStart: input.workingHoursStart,
    workingHoursEnd: input.workingHoursEnd,
    maxSlots: input.maxSlots,
  });
}

export async function checkCalendarConflicts(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    proposed: TimeRange[];
    bufferMinutes?: number;
  }
): Promise<CalendarConflictResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  if (!input.proposed.length) {
    return { hasConflict: false, conflicts: [] };
  }

  const starts = input.proposed.map((slot) => Date.parse(slot.start));
  const ends = input.proposed.map((slot) => Date.parse(slot.end));
  const bufferMs = Math.max(Number(input.bufferMinutes ?? 0), 0) * 60_000;
  const timeMin = new Date(Math.min(...starts) - bufferMs).toISOString();
  const timeMax = new Date(Math.max(...ends) + bufferMs).toISOString();

  const events = await loadCalendarEventsInRange(env, auth, {
    accountId,
    timeMin,
    timeMax,
  });
  if ("error" in events) return events;

  return detectCalendarConflicts(events, input.proposed);
}

export async function buildCalendarDailyAgenda(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; date?: string; timeZone?: string }
): Promise<CalendarAgendaResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  const account = await loadAccountEmail(env, auth, accountId);
  if (!account.ok) return { error: account.error, status: account.status };

  const timeZone = input.timeZone?.trim() || "UTC";
  const date = input.date?.trim() || ymdInTimezone(new Date(), timeZone);
  const bounds = agendaDayBounds(date, timeZone);
  const events = await loadCalendarEventsInRange(env, auth, {
    accountId,
    timeMin: bounds.timeMin,
    timeMax: bounds.timeMax,
    maxEvents: 100,
  });
  if ("error" in events) return events;

  return buildCalendarAgenda({
    accountId,
    accountEmail: account.accountEmail,
    date,
    timeZone,
    events: filterEventsForLocalDate(events, date, timeZone),
  });
}

export async function suggestCalendarMeetingFromThread(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    messages?: WorkspaceMailMessage[];
    timeZone?: string;
    durationMinutes?: number;
    days?: number;
    maxSuggestions?: number;
  }
): Promise<MeetingSuggestResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  const timeZone = input.timeZone?.trim() || "UTC";
  const days = input.days ?? 7;
  const { timeMin, timeMax } = rangeFromDays(timeZone, days);

  const events = await loadCalendarEventsInRange(env, auth, {
    accountId,
    timeMin,
    timeMax,
  });
  if ("error" in events) return events;

  return suggestMeetingSlots({
    events,
    messages: input.messages,
    timeZone,
    durationMinutes: input.durationMinutes,
    days,
    maxSuggestions: input.maxSuggestions,
  });
}

export async function listCalendarEventsForAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    timeMin: string;
    timeMax: string;
    maxResults?: number;
    pageToken?: string;
  }
) {
  return listCalendarEvents(env, auth, input);
}
