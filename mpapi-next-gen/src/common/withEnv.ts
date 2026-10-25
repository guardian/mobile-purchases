export const withEnv = async <T>(
	env: Record<string, string>,
	callback: () => Promise<T> | T,
): Promise<T> => {
	const original: Record<string, string | undefined> = {};
	for (const key of Object.keys(env)) {
		original[key] = process.env[key];
	}

	Object.assign(process.env, env);

	try {
		return await callback();
	} finally {
		for (const key of Object.keys(env)) {
			if (original[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original[key];
			}
		}
	}
};
