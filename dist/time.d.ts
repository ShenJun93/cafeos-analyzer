export interface LocalDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}
export declare function assertIanaTimeZone(timeZone: string): string;
export declare function zonedDateTimeParts(value: Date | string, timeZone: string): LocalDateTimeParts;
export declare function wallClockToInstant(parts: LocalDateTimeParts, timeZone: string): Date;
export declare function parseSourceTimestamp(value: string, sourceTimezone?: string): Date | null;
export declare function businessDate(value: Date | string, timeZone: string): string;
export declare function daypartForInstant(value: Date | string, timeZone: string): "morning" | "afternoon" | "evening";
