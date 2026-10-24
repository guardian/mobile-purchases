export const withEnv = async (
	env: Record<string, string>,
	callback: () => unknown,
) => {
	const oldEnv = process.env;
	process.env = env;

	await callback();

	process.env = oldEnv;
};
