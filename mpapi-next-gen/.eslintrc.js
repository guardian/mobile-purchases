// .eslintrc.js
module.exports = {
	root: true,
	extends: ['@guardian/eslint-config'],
	parserOptions: {
		ecmaVersion: 2020,
		sourceType: 'module',
		project: './tsconfig.json', // Add this for TypeScript support
	},
	// You can add custom rules or overrides here
	rules: {
		// Add any project-specific rules here
		// Note: Guardian's config already includes TypeScript rules
	},
};
