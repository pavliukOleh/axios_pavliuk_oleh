import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'characterization',
    environment: 'node',
    include: ['tests/characterization/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['lib/core/Axios.js'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/characterization',
      thresholds: { lines: 70 },
    },
  },
});
