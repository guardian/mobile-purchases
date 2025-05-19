import guardian from '@guardian/eslint-config';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules', 'dist', 'server-dist', 'rollup.config.js', 'webpack.*js', 'cdk'],
    },
    ...guardian.configs.recommended,
    ...guardian.configs.jest,
    {
        ignores: ['eslint.config.mjs'],
        languageOptions: {
            globals: {
                ...globals.jest,
                ...globals.browser,
                ...globals.node,
            },
            ecmaVersion: 5,
            sourceType: 'commonjs',
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: './',
            },
        },
        rules: {
            curly: 2
        },
    },
];
