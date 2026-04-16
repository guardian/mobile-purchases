import { defineConfig } from '@eslint/config-helpers';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
		plugins: { js },
		extends: ['js/recommended'],
		languageOptions: {
			globals: globals.browser,
			sourceType: 'commonjs',
		},
	},
	...tseslint.configs.recommended,
]);
