/** Google Calendar event create/update (P3 — events scope, approval-gated). */
import type { Env } from "../env";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  CALENDAR_EVENTS_SCOPE,
  getUserCalendarAccount,
  refreshCalendarAccessToken,
  touchUserCalendarAccountSync,
} from "./user-calendar-accounts";

export function accountHasCalendarEventsScope(scopes: string[]): boolean {
  return scopes.some(
    (scope) =>
      scope === CALENDAR_EVENTS_SCOPE ||
      scope === "https://www.googleapis.com/auth/calendar"
  );
}

type GoogleEventBody = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
};

export type CalendarEventWriteInput = {
  accountId: string;
  summary: string;
  start: string;
  end: string;
  timeZone?: string;
  description?: string;
  location?: string;
  eventId?: string;
};

export async function upsertCalendarEvent(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: CalendarEventWriteInput
): Promise<
  | { eventId: string; htmlLink: string | null; status: "created" | "updated" }
  | { error: string; status: 401 | 403 | 404 | 502 }
> {
  const account = await getUserCalendarAccount(env, auth, input.accountId);
  if (!account) return { error: "calendar_account_not_found", status: 404 };
  if (!accountHasCalendarEventsScope(account.scopes)) {
    return { error: "calendar_events_scope_required", status: 403 };
  }

  const token = await refreshCalendarAccessToken(env, account.refreshToken);
  if ("error" in token) return { error: token.error, status: 401 };

  const body: GoogleEventBody = {
    summary: input.summary.trim(),
    start: { dateTime: input.start, timeZone: input.timeZone ?? "UTC" },
    end: { dateTime: input.end, timeZone: input.timeZone ?? "UTC" },
  };
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.location?.trim()) body.location = input.location.trim();

  const eventId = input.eventId?.trim();
  const path = eventId
    ? `/calendars/primary/events/${encodeURIComponent(eventId)}`
    : "/calendars/primary/events";
  const method = eventId ? "PATCH" : "POST";

  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.id) {
    return { error: json.error?.message ?? "calendar_event_write_failed", status: 502 };
  }

  await touchUserCalendarAccountSync(env, account.id);
  return {
    eventId: json.id,
    htmlLink: json.htmlLink ?? null,
    status: eventId ? "updated" : "created",
  };
}
