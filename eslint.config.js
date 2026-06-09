import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import unusedImports from 'eslint-plugin-unused-imports'

// Mirrors the monorepo's TUI (one-tui) ESLint setup — @eslint/js + typescript-eslint
// + eslint-plugin-unused-imports — with the React/react-hooks plugins this Ink app needs.
// Formatting is handled by oxfmt, so no stylistic/Prettier ESLint rules are configured.
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'bin/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Ink uses the new JSX transform — no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      // Ink renders to a terminal, not HTML, so unescaped quotes/apostrophes
      // in display text are fine — escaping them would only hurt readability.
      'react/no-unescaped-entities': 'off',
      // Several steps use timer/async-driven state machines that intentionally
      // transition state from within effects.
      'react-hooks/set-state-in-effect': 'off',
      // Use the unused-imports plugin (monorepo convention) instead of the core
      // rule, so unused imports auto-fix and unused vars warn (ignoring _-prefix).
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  }
)
