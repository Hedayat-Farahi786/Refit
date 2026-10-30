import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'fixtures/**', 'data/**', 'workspaces/**', 'web/.angular/**', '**/*.d.ts', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The engine stays framework-neutral: only the stack registry may import a stack adapter.
    files: ['server/src/**/*.ts'],
    ignores: ['server/src/stacks/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/stacks/angular/**', '**/stacks/angular'],
              message: 'Engine code must not import a stack adapter directly. Go through stacks/registry.ts and the StackAdapter interface.',
            },
          ],
        },
      ],
    },
  },
  {
    // Angular components rely on decorators and DI; consistent-type-imports would break injection tokens.
    files: ['web/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
