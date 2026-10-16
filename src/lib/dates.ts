/** Calendar days in Philippine time (UTC+8, no daylight saving), as YYYY-MM-DD. */
export const manilaDay = (d: Date = new Date()): string =>
  d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** A YYYY-MM-DD day moved by whole days. */
export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return manilaDay(d);
}

/** Start (inclusive) and end (exclusive) of a Manila day, as ISO timestamps. */
export function dayRange(day: string): { from: string; to: string } {
  return {
    from: new Date(`${day}T00:00:00+08:00`).toISOString(),
    to: new Date(`${shiftDay(day, 1)}T00:00:00+08:00`).toISOString(),
  };
}

/** The last `days` Manila days, today included. */
export function lastDaysRange(days: number): { from: string; to: string } {
  const today = manilaDay();
  return { from: dayRange(shiftDay(today, -(days - 1))).from, to: dayRange(today).to };
}

/** "Sat, Sep 27, 3:00 PM" in Philippine time. */
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
