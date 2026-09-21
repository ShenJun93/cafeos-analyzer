export interface LocalClock {
    date: string;
    hour: number;
    minute: number;
    second: number;
}
export declare function assertValidTimeZone(timeZone: string): string;
export declare function parseSourceTimestamp(value: string, sourceTimezone: string): Date | null;
export declare function localBusinessClock(occurredAt: string | Date, timeZone: string): LocalClock;
export declare function daypartForInstant(occurredAt: string | Date, timeZone: string): "morning" | "afternoon" | "evening";
export declare function previousSameWeekdayDates(date: string, count?: number): string[];
