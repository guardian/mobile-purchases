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