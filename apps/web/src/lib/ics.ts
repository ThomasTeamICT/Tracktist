/** Minimal RFC 5545 iCalendar generation for "add to calendar" (brief §6.4). */

export interface IcsEvent {
  uid: string;
  title: string;
  /** ISO `YYYY-MM-DD` local date. */
  date: string;
  /** Local `HH:mm`, optional → all-day event. */
  startTime?: string | null;
  venue?: string;
  city?: string;
  country?: string;
  url?: string;
  description?: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildEventIcs(e: IcsEvent): string {
  const location = [e.venue, e.city, e.country].filter(Boolean).join(", ");
  const dt = e.date.replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tracktist//Live Music Radar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@tracktist.app`,
    `SUMMARY:${esc(e.title)}`,
  ];

  if (e.startTime && /^\d{2}:\d{2}$/.test(e.startTime)) {
    const start = `${dt}T${e.startTime.replace(":", "")}00`;
    // Default 3-hour show window.
    const endHour = String((Number(e.startTime.slice(0, 2)) + 3) % 24).padStart(2, "0");
    const end = `${dt}T${endHour}${e.startTime.slice(3, 5)}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
  }

  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
