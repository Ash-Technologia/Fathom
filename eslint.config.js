// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "eslint.config.js",
      "prettier.config.js",
      "vitest.config.ts",
      "tests/fixtures/**",
    ],
  }
);
