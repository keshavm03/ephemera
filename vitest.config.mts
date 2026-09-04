import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const config = defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

export default config;
