/*
This function, is a utility designed to temporarily mock environment variables
(process.env) during the execution of a specific callback function, restoring
the original environment variables afterward—even if the callback fails.

Used in testing environments it tests how code behaves under different
environment configurations without permanently polluting or changing the
global process.env for other tests.
*/

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
