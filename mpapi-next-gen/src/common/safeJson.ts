export function safeJsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, v) => {
		if (typeof v === 'bigint') {
			// DynamoDB N values unmarshalled as bigint -> emit as bare number literal
			// (matches what a JS number would have serialized to pre-regression)
			return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
		}
		return v;
	});
}
