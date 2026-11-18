import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { UPLOAD_DIR: './.test-uploads' }, // test files never touch real uploads
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false, // tests share one database
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
