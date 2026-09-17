import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { ALIASES } from './vite.shared.mjs'

export default defineConfig({
    resolve: {
        alias: [
            // The core package and the logger are replaced by mocks, so a unit test neither builds
            // core nor reaches its runtime singletons.
            {
                find: '@epicurrents/core',
                replacement: fileURLToPath(new URL('tests/mocks/epicurrents-core', import.meta.url)),
            },
            {
                find: 'scoped-event-log',
                replacement: fileURLToPath(new URL('tests/mocks/scoped-event-log.ts', import.meta.url)),
            },
            ...ALIASES,
        ],
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reportsDirectory: 'tests/coverage',
        },
    },
})
