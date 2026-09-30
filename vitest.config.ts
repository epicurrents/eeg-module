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
            // The core mocks are test scaffolding, not this package's code; counted as source they
            // report a coverage figure that does not describe what the package ships.
            exclude: ['tests/**'],
        },
    },
})
