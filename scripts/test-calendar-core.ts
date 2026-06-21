/** Unit tests: calendar availability + meeting suggest (no network). */
import assert from "node:assert/strict";
import { computeCalendarAvailability, detectCalendarConflicts } from "../src/services/calendar-availability.ts";
import { suggestMeetingSlots } from "../src/services/calendar-meeting-suggest.ts";
import type { CalendarEvent } from "../src/services/calendar-read.ts";
import { ymdInTimezone } from "../src/lib/calendar-time.ts";

const today = ymdInTimezone(new Date(), "UTC");
const events: CalendarEvent[] = [
  {
    id: "e1",
    summary: "Standup",
    description: null,
    location: null,
    start: `${today}T10:00:00.000Z`,
    end: `${today}T10:30:00.000Z`,
    allDay: false,
    status: "confirmed",
    htmlLink: null,
  },
];

const availability = computeCalendarAvailability({
  events,
  timeZone: "UTC",
  days: 1,
  durationMinutes: 30,
  workingHoursStart: 9,
  workingHoursEnd: 12,
  maxSlots: 5,
});

assert.ok(availability.freeSlots.length >= 1);

const conflicts = detectCalendarConflicts(events, [
  {
    start: `${today}T10:15:00.000Z`,
    end: `${today}T11:00:00.000Z`,
  },
]);
assert.equal(conflicts.hasConflict, true);
assert.equal(conflicts.conflicts[0]?.overlappingEvents.length, 1);

const suggestions = suggestMeetingSlots({
  events,
  messages: [
    {
      subject: "Project sync",
      text: "Can we schedule a 30 minute call this week?",
      from: "peer@example.com",
    },
  ],
  timeZone: "UTC",
  days: 1,
});

assert.ok(suggestions.suggestions.length > 0);
assert.equal(suggestions.parsedFromThread.meetingKeywords, true);

console.log("test-calendar-core OK");
