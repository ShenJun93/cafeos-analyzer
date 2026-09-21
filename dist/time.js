const formatterCache = new Map();
function formatter(timeZone) {
    const zone = assertIanaTimeZone(timeZone);
    const cached = formatterCache.get(zone);
    if (cached)
        return cached;
    const created = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });
    formatterCache.set(zone, created);
    return created;
}
export function assertIanaTimeZone(timeZone) {
    const zone = String(timeZone ?? "").trim();
    if (!zone)
        throw new Error("IANA timezone is required");
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date(0));
    }
    catch {
        throw new Error(`Invalid IANA timezone: ${zone}`);
    }
    return zone;
}
export function zonedDateTimeParts(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf()))
        throw new Error("Invalid instant");
    const result = {};
    for (const part of formatter(timeZone).formatToParts(date)) {
        if (part.type === "year")
            result.year = Number(part.value);
        else if (part.type === "month")
            result.month = Number(part.value);
        else if (part.type === "day")
            result.day = Number(part.value);
        else if (part.type === "hour")
            result.hour = Number(part.value);
        else if (part.type === "minute")
            result.minute = Number(part.value);
        else if (part.type === "second")
            result.second = Number(part.value);
    }
    return result;
}
function wallClockEpoch(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}
function sameWallClock(a, b) {
    return a.year === b.year &&
        a.month === b.month &&
        a.day === b.day &&
        a.hour === b.hour &&
        a.minute === b.minute &&
        a.second === b.second;
}
function validCalendarParts(parts) {
    const probe = new Date(wallClockEpoch(parts));
    return probe.getUTCFullYear() === parts.year &&
        probe.getUTCMonth() === parts.month - 1 &&
        probe.getUTCDate() === parts.day &&
        probe.getUTCHours() === parts.hour &&
        probe.getUTCMinutes() === parts.minute &&
        probe.getUTCSeconds() === parts.second;
}
function offsetAt(instantMs, timeZone) {
    const truncated = Math.trunc(instantMs / 1000) * 1000;
    return wallClockEpoch(zonedDateTimeParts(new Date(truncated), timeZone)) - truncated;
}
export function wallClockToInstant(parts, timeZone) {
    const zone = assertIanaTimeZone(timeZone);
    if (!validCalendarParts(parts))
        throw new Error("Invalid local date/time");
    const desired = wallClockEpoch(parts);
    const offsets = new Set();
    for (const delta of [-172_800_000, -86_400_000, 0, 86_400_000, 172_800_000]) {
        offsets.add(offsetAt(desired + delta, zone));
    }
    const candidates = new Set();
    for (const offset of offsets) {
        const candidate = desired - offset;
        if (sameWallClock(zonedDateTimeParts(new Date(candidate), zone), parts)) {
            candidates.add(candidate);
        }
    }
    if (candidates.size === 0) {
        throw new Error(`Local time does not exist in timezone ${zone}`);
    }
    if (candidates.size > 1) {
        throw new Error(`Local time is ambiguous in timezone ${zone}`);
    }
    return new Date([...candidates][0]);
}
const EXPLICIT_INSTANT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
export function parseSourceTimestamp(value, sourceTimezone) {
    const raw = value.trim();
    if (!raw)
        return null;
    if (EXPLICIT_INSTANT_RE.test(raw)) {
        const instant = new Date(raw);
        return Number.isNaN(instant.valueOf()) ? null : instant;
    }
    const vn = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (vn) {
        const [, dd, mm, yy, hh = "0", min = "0", ss = "0"] = vn;
        const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
        if (!sourceTimezone)
            throw new Error("sourceTimezone is required for naive timestamps");
        try {
            return wallClockToInstant({
                year,
                month: Number(mm),
                day: Number(dd),
                hour: Number(hh),
                minute: Number(min),
                second: Number(ss)
            }, sourceTimezone);
        }
        catch {
            return null;
        }
    }
    const isoNaive = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (isoNaive) {
        const [, yyyy, mm, dd, hh = "0", min = "0", ss = "0"] = isoNaive;
        if (!sourceTimezone)
            throw new Error("sourceTimezone is required for naive timestamps");
        try {
            return wallClockToInstant({
                year: Number(yyyy),
                month: Number(mm),
                day: Number(dd),
                hour: Number(hh),
                minute: Number(min),
                second: Number(ss)
            }, sourceTimezone);
        }
        catch {
            return null;
        }
    }
    return null;
}
export function businessDate(value, timeZone) {
    const p = zonedDateTimeParts(value, timeZone);
    return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function daypartForInstant(value, timeZone) {
    const hour = zonedDateTimeParts(value, timeZone).hour;
    if (hour < 11)
        return "morning";
    if (hour < 17)
        return "afternoon";
    return "evening";
}
