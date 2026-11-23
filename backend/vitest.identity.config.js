import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/identity/*.test.js'],
    env: { UPLOAD_DIR: './.test-uploads' }, // test files never touch real uploads
    globalSetup: ['./test/identity/globalSetup.js'],
    setupFiles: ['./test/identity/setup.js'],
    fileParallelism: false, // tests share one database
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
