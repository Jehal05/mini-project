import { defineConfig } from 'vitest/config'

// Monitoring, detection and emergency tests. The identity/hospital tests have their own config
// (vitest.identity.config.js) because they reset a shared database between tests.
export default defineConfig({ test: { include: ['test/*.test.js'] } })
