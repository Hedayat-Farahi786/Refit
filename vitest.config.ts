import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['shared/test/**/*.test.ts', 'server/test/unit/**/*.test.ts'],
          environment: 'node',
          // Some unit tests clone small git repos; Windows and macOS runners are slower at that.
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['server/test/integration/**/*.test.ts'],
          passWithNoTests: true,
          environment: 'node',
          testTimeout: 15 * 60_000,
          hookTimeout: 10 * 60_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'slow',
          include: ['server/test/slow/**/*.test.ts'],
          passWithNoTests: true,
          environment: 'node',
          testTimeout: 90 * 60_000,
          hookTimeout: 30 * 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
