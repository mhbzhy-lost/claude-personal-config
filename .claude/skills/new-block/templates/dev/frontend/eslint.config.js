// Flat config for jsx-a11y static checks on component/frontend/src.
// Scope is intentionally minimal: a11y rules only — no style / formatting
// opinions here. WCAG runtime checks live in examples/basic/a11y.spec.ts
// (see component/SKILL.md "a11y 测试要求").
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import a11y from 'eslint-plugin-jsx-a11y';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'jsx-a11y': a11y,
    },
    rules: {
      ...a11y.configs.recommended.rules,
      // Type-check noise from eslint base (TS handles these properly).
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
