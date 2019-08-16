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
    const newDate = new Date(from.getTime());
    newDate.setMonth(from.getMonth() + 30);
    return newDate;
}

export function dateToSecondTimestamp(date: Date): number {
    return Math.ceil(date.getTime() / 1000);
}