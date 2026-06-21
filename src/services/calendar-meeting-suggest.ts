/** Meeting slot suggestions from email thread context + calendar availability (P2.14). */
import type { WorkspaceMailMessage } from "./workspace-agent";
import type { CalendarEvent } from "./calendar-read";
import {
  computeCalendarAvailability,
  type CalendarAvailabilitySlot,
} from "./calendar-availability";
import { formatTimeLabel } from "../lib/calendar-time";

export type MeetingSuggestion = CalendarAvailabilitySlot & {
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type MeetingSuggestResult = {
  durationMinutes: number;
  timeZone: string;
  parsedFromThread: {
    durationMinutes: number | null;
    meetingKeywords: boolean;
  };
  suggestions: MeetingSuggestion[];
};

const MEETING_RE =
  /\b(meet(?:ing)?|call|sync|catch up|schedule|availability|time slot|calendar invite|zoom|teams|google meet)\b/i;
const DURATION_RE =
  /\b(\d{1,2})\s*(?:-|–)?\s*(minute|min|minutes|hour|hours|hr|hrs)\b/i;

function joinedThreadText(messages?: WorkspaceMailMessage[]): string {
  return (messages ?? [])
    .map((message) => [message.subject, message.text].filter(Boolean).join(" "))
    .join("\n")
    .trim();
}

export function parseMeetingDurationMinutes(text: string, fallback = 30): number {
  const match = text.match(DURATION_RE);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "";
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  if (unit.startsWith("hour") || unit.startsWith("hr")) {
    return Math.min(amount * 60, 240);
  }
  return Math.min(amount, 240);
}

export function suggestMeetingSlots(input: {
  events: CalendarEvent[];
  messages?: WorkspaceMailMessage[];
  timeZone: string;
  durationMinutes?: number;
  days?: number;
  maxSuggestions?: number;
}): MeetingSuggestResult {
  const threadText = joinedThreadText(input.messages);
  const meetingKeywords = MEETING_RE.test(threadText);
  const parsedDuration = threadText ? parseMeetingDurationMinutes(threadText) : null;
  const durationMinutes = input.durationMinutes ?? parsedDuration ?? 30;
  const timeZone = input.timeZone.trim() || "UTC";

  const availability = computeCalendarAvailability({
    events: input.events,
    timeZone,
    days: input.days ?? 7,
    durationMinutes,
    maxSlots: Math.min(Math.max(input.maxSuggestions ?? 5, 1), 10),
  });

  const confidence: MeetingSuggestion["confidence"] = meetingKeywords ? "high" : "medium";
  const reason = meetingKeywords
    ? "meeting_language_in_thread"
    : "general_availability_from_calendar";

  const suggestions: MeetingSuggestion[] = availability.freeSlots.map((slot) => ({
    ...slot,
    reason,
    confidence,
  }));

  return {
    durationMinutes,
    timeZone,
    parsedFromThread: {
      durationMinutes: parsedDuration,
      meetingKeywords,
    },
    suggestions,
  };
}

export function formatMeetingSuggestions(result: MeetingSuggestResult): string {
  if (!result.suggestions.length) {
    return "No open slots found in the requested window.";
  }
  return result.suggestions
    .map(
      (slot, index) =>
        `${index + 1}. ${formatTimeLabel(slot.start, result.timeZone)} (${slot.confidence})`
    )
    .join("\n");
}
