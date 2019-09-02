export function msToFormattedString(ms: string): string {
    return new Date(Number.parseInt(ms)).toISOString()
}

export function optionalMsToFormattedString(ms?: string): string | undefined {
    if (ms) {
        return msToFormattedString(ms);
    } else {
        return undefined;
    }
}

export function thirtyMonths(from: Date = new Date()): Date {
    return plusMonths(from, 30);
}

export function dateToSecondTimestamp(date: Date): number {
    return Math.ceil(date.getTime() / 1000);
}

export function plusMonths(from: Date, count: number): Date {
    const newDate = new Date(from.getTime());
    newDate.setUTCMonth(from.getUTCMonth() + count);
    return newDate;
}

export function plusDays(from: Date, count: number): Date {
    const newDate = new Date(from.getTime());
    newDate.setUTCDate(from.getUTCDate() + count);
    return newDate;
}