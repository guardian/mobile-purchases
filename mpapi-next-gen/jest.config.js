module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/*.test.ts'],
	transform: {
		// Explicitly tell ts-jest to process both TS files and JS files from excluded node_modules
		'^.+\\.[jt]sx?$': 'ts-jest',
	},
	transformIgnorePatterns: [
		// Exclude @guardian from the ignore list so it undergoes transformation
		'/node_modules/(?!@guardian/)',
	],
};
