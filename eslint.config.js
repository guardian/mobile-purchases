const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    files: ['typescript/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
    },
  },
  {
    ignores: ['tsc-target/', 'node_modules/', 'dist/', 'coverage/', '**/*.js'],
  },
];
