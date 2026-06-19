import { DateTime } from "luxon";

/**
 * Get the current time in a given IANA timezone.
 * Returns hours, minutes, ISO weekday (1=Mon..7=Sun), and formatted date.
 */
export function getCurrentTimeInTimezone(timezone: string): {
  hours: number;
  minutes: number;
  dayOfWeek: number;
  date: string;
} {
  const now = DateTime.now().setZone(timezone);
  return {
    hours: now.hour,
    minutes: now.minute,
    dayOfWeek: now.weekday, // 1=Monday, 7=Sunday
    date: now.toFormat("yyyy-MM-dd"),
  };
}

/**
 * Check if the current hours:minutes exactly match a target "HH:MM" string.
 */
export function isTimeMatch(currentHours: number, currentMinutes: number, targetTime: string): boolean {
  const [h, m] = targetTime.split(":").map(Number);
  return currentHours === h && currentMinutes === m;
}

/**
 * Check if today (given as ISO weekday) is in the active days list.
 */
export function isTodayActiveDay(dayOfWeek: number, activeDays: number[]): boolean {
  return activeDays.includes(dayOfWeek);
}

/**
 * Format a YYYY-MM-DD date string into a human-readable form like "Thursday, April 9".
 */
export function formatDateForDisplay(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr);
  return dt.toFormat("EEEE, MMMM d");
}

/**
 * Return the ISO weekday (1=Monday…7=Sunday) for a YYYY-MM-DD date string.
 */
export function getWeekdayFromDate(dateStr: string): number {
  return DateTime.fromISO(dateStr).weekday;
}

/**
 * Return the Monday (yyyy-MM-dd) of the week containing the given date.
 * If no date is given, uses the current date in the given timezone (or local).
 */
export function getWeekStart(dateStr?: string, timezone?: string): string {
  const dt = dateStr
    ? DateTime.fromISO(dateStr)
    : DateTime.now().setZone(timezone || "local");
  return dt.startOf("week").toFormat("yyyy-MM-dd");
}

/** Add a number of weeks to a yyyy-MM-dd date string, returning yyyy-MM-dd. */
export function addWeeks(dateStr: string, weeks: number): string {
  return DateTime.fromISO(dateStr).plus({ weeks }).toFormat("yyyy-MM-dd");
}

/**
 * Given a week's Monday and a list of ISO weekdays (1=Mon…7=Sun), return the
 * concrete yyyy-MM-dd dates for those weekdays within that week, sorted.
 */
export function datesForWeekdays(weekStart: string, weekdays: number[]): string[] {
  const monday = DateTime.fromISO(weekStart);
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((wd) => monday.plus({ days: wd - 1 }).toFormat("yyyy-MM-dd"));
}

/** Short human label for a date, e.g. "Mon, Apr 9". */
export function formatDateShort(dateStr: string): string {
  return DateTime.fromISO(dateStr).toFormat("ccc, MMM d");
}
