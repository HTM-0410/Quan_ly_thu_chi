/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // DB tests dùng chung 1 user thật → chạy tuần tự để tránh race condition.
    // UI tests dùng mock → có thể chạy parallel nếu muốn.
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
});