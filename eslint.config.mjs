import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-*/**', // D153: the staging admin portal's build folder
      '**/.expo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/server/src/generated/**',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // CLI scripts and config files may print to stdout.
    files: ['**/scripts/**', '**/prisma/seed.ts', '**/*.config.{js,mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
