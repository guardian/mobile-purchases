import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";

export default [
  // TypeScript files configuration
  {
    files: ["typescript/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        node: true,
        jest: true,
      },
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    rules: {
      // Start with recommended rules
      ...typescriptPlugin.configs.recommended.rules,
      
      // Customize to your preferences
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      "dist/**",
      "tsc-target/**",
      "node_modules/**",
      "coverage/**",
      "**/*.js",
      "**/*.cjs", 
      "**/*.mjs",
      "webpack.config.js",
      "jest.config.js",
    ],
  },
];
