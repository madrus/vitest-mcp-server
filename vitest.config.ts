import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'json', 'html'],
      reportOnFailure: true,
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'vitest.config.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 73,
          statements: 73,
        },
        // Specific thresholds for critical logic files
        'src/tools/**': {
          branches: 60,
          functions: 70,
          lines: 80,
          statements: 80,
        },
        'src/utils/**': {
          branches: 80,
          functions: 65,
          lines: 80,
          statements: 80,
        },
        // Entry point file - lower threshold as it's mainly setup/glue code
        'src/index.ts': {
          branches: 50,
          functions: 100,
          lines: 30,
          statements: 30,
        },
      },
      all: true,
      skipFull: false,
    },
  },
})
