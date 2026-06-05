import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "bin/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Ink uses the new JSX transform — no need to import React in scope.
      "react/react-in-jsx-scope": "off",
      // Ink renders to a terminal, not HTML, so unescaped quotes/apostrophes
      // in display text are fine — escaping them would only hurt readability.
      "react/no-unescaped-entities": "off",
      // Several steps use timer/async-driven state machines that intentionally
      // transition state from within effects.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Disable formatting rules that conflict with Prettier. Keep last.
  prettier,
);
