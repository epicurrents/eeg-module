import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    resolve: {
        alias: [
        { find: '@epicurrents/core', replacement: fileURLToPath(new URL('tests/mocks/epicurrents-core', import.meta.url)) },
        { find: 'scoped-event-log', replacement: fileURLToPath(new URL('tests/mocks/scoped-event-log.ts', import.meta.url)) },
        { find: '#runtime', replacement: fileURLToPath(new URL('src/runtime/index.ts', import.meta.url)) },
        // Both #runtime and #config are remapped to dist by the package's own `imports` field, which
        // resolves ahead of a generic alias, so a test run would otherwise need a prior build to reach
        // the JSON assets.
        { find: '#config', replacement: fileURLToPath(new URL('src/config', import.meta.url)) },
            { find: '#root/', replacement: fileURLToPath(new URL('./', import.meta.url)) },
            { find: '#', replacement: fileURLToPath(new URL('src/', import.meta.url)) },
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
