export interface LocalClock {
  date: string;
  hour: number;
  minute: number;
  second: number;
}

interface ClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function assertValidTimeZone(timeZone: string): string {
  const zone = String(timeZone ?? "").trim();
  if (!zone) throw new Error("Timezone is required");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid IANA timezone: ${zone}`);
  }
  return zone;
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  const zone = assertValidTimeZone(timeZone);
  let value = formatterCache.get(zone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    formatterCache.set(zone, value);
  }
  return value;
}

function clockPartsAt(instantMs: number, timeZone: string): ClockParts {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find(part => part.type === type)?.value;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`Could not resolve ${type} in timezone ${timeZone}`);
    return value;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
}

function sameClock(a: ClockParts, b: ClockParts): boolean {
  return a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second;
}

function zonedClockToDate(parts: ClockParts, timeZone: string): Date | null {
  const zone = assertValidTimeZone(timeZone);
  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  const calendarCheck = new Date(targetAsUtc);
  if (
    calendarCheck.getUTCFullYear() !== parts.year ||
    calendarCheck.getUTCMonth() !== parts.month - 1 ||
    calendarCheck.getUTCDate() !== parts.day ||
    calendarCheck.getUTCHours() !== parts.hour ||
    calendarCheck.getUTCMinutes() !== parts.minute ||
    calendarCheck.getUTCSeconds() !== parts.second
  ) {
    return null;
  }

  let candidate = targetAsUtc;
  for (let i = 0; i < 4; i++) {
    const observed = clockPartsAt(candidate, zone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const offsetMs = observedAsUtc - candidate;
    const next = targetAsUtc - offsetMs;
    if (next === candidate) break;
    candidate = next;
  }

  return sameClock(clockPartsAt(candidate, zone), parts)
    ? new Date(candidate)
    : null;
}

function naiveClock(raw: string): ClockParts | null {
  const vn = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vn) {
    const [, dd, mm, yy, hh = "0", min = "0", ss = "0"] = vn;
    return {
      year: yy.length === 2 ? 2000 + Number(yy) : Number(yy),
      month: Number(mm),
      day: Number(dd),
      hour: Number(hh),
      minute: Number(min),
      second: Number(ss)
    };
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/);
  if (!iso) return null;
  const [, yyyy, mm, dd, hh = "0", min = "0", ss = "0"] = iso;
  return {
    year: Number(yyyy),
    month: Number(mm),
    day: Number(dd),
    hour: Number(hh),
    minute: Number(min),
    second: Number(ss)
  };
}

export function parseSourceTimestamp(value: string, sourceTimezone: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const zone = assertValidTimeZone(sourceTimezone);
  const hasExplicitOffset = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  if (hasExplicitOffset) {
    const instant = new Date(raw);
    return Number.isNaN(instant.valueOf()) ? null : instant;
  }

  const local = naiveClock(raw);
  if (!local) return null;
  return zonedClockToDate(local, zone);
}

export function localBusinessClock(occurredAt: string | Date, timeZone: string): LocalClock {
  const zone = assertValidTimeZone(timeZone);
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid occurredAt instant");
  const parts = clockPartsAt(date.valueOf(), zone);
  return {
    date: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

export function daypartForInstant(occurredAt: string | Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const hour = localBusinessClock(occurredAt, timeZone).hour;
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function previousSameWeekdayDates(date: string, count = 4): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Business date must be YYYY-MM-DD");
  const base = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(base.valueOf()) || base.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid business date");
  }
  return Array.from({ length: count }, (_, index) => {
    const prior = new Date(base);
    prior.setUTCDate(base.getUTCDate() - 7 * (index + 1));
    return prior.toISOString().slice(0, 10);
  });
}
