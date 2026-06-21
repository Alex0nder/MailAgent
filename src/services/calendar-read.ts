/** Google Calendar API read-only: events list (P2). */
import type { Env } from "../env";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  getUserCalendarAccount,
  refreshCalendarAccessToken,
  touchUserCalendarAccountSync,
} from "./user-calendar-accounts";

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  status: string | null;
  htmlLink: string | null;
};

type GoogleEventDate = { date?: string; dateTime?: string; timeZone?: string };
type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
};
type GoogleEventsList = {
  items?: GoogleEvent[];
  nextPageToken?: string;
};

function parseEventDate(value?: GoogleEventDate): { iso: string; allDay: boolean } | null {
  if (!value) return null;
  if (value.dateTime) return { iso: new Date(value.dateTime).toISOString(), allDay: false };
  if (value.date) return { iso: `${value.date}T00:00:00.000Z`, allDay: true };
  return null;
}

export function mapGoogleCalendarEvent(raw: GoogleEvent): CalendarEvent | null {
  if (!raw.id) return null;
  const start = parseEventDate(raw.start);
  const end = parseEventDate(raw.end);
  if (!start || !end) return null;
  return {
    id: raw.id,
    summary: raw.summary?.trim() || "(no title)",
    description: raw.description?.trim() || null,
    location: raw.location?.trim() || null,
    start: start.iso,
    end: end.iso,
    allDay: start.allDay || end.allDay,
    status: raw.status?.trim() || null,
    htmlLink: raw.htmlLink?.trim() || null,
  };
}

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = new URL(`https://www.googleapis.com/calendar/v3${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.error?.message ?? json.error?.status ?? "calendar_api_error",
    };
  }
  return { ok: true, data: json };
}

async function withCalendarAccess<T>(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string,
  fn: (accessToken: string) => Promise<T>
): Promise<T | { error: string; status: 401 | 404 | 502 }> {
  const account = await getUserCalendarAccount(env, auth, accountId);
  if (!account) return { error: "calendar_account_not_found", status: 404 };

  const token = await refreshCalendarAccessToken(env, account.refreshToken);
  if ("error" in token) return { error: token.error, status: 401 };

  try {
    const result = await fn(token.accessToken);
    await touchUserCalendarAccountSync(env, account.id);
    return result;
  } catch {
    return { error: "calendar_api_unreachable", status: 502 };
  }
}

export async function listCalendarEvents(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    maxResults?: number;
    pageToken?: string;
  }
): Promise<
  | { events: CalendarEvent[]; nextPageToken: string | null }
  | { error: string; status: 401 | 404 | 502 }
> {
  const calendarId = encodeURIComponent(input.calendarId?.trim() || "primary");
  const result = await withCalendarAccess(env, auth, input.accountId, async (accessToken) => {
    const listed = await calendarFetch<GoogleEventsList>(
      accessToken,
      `/calendars/${calendarId}/events`,
      {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: Math.min(Math.max(input.maxResults ?? 50, 1), 100),
        pageToken: input.pageToken,
      }
    );
    if (!listed.ok) throw new Error(listed.error);
    const events = (listed.data.items ?? [])
      .map(mapGoogleCalendarEvent)
      .filter((event): event is CalendarEvent => Boolean(event));
    return {
      events,
      nextPageToken: listed.data.nextPageToken ?? null,
    };
  });

  if ("error" in result) return result;
  return result;
}

export async function loadCalendarEventsInRange(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    timeMin: string;
    timeMax: string;
    maxEvents?: number;
  }
): Promise<CalendarEvent[] | { error: string; status: 401 | 404 | 502 }> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  const cap = Math.min(Math.max(input.maxEvents ?? 100, 1), 250);

  while (events.length < cap) {
    const batch = await listCalendarEvents(env, auth, {
      accountId: input.accountId,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      maxResults: Math.min(100, cap - events.length),
      pageToken,
    });
    if ("error" in batch) return batch;
    events.push(...batch.events);
    if (!batch.nextPageToken) break;
    pageToken = batch.nextPageToken;
  }

  return events.slice(0, cap);
}
