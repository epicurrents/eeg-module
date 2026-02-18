const path = require('path')

module.exports = {
    rootDir: path.resolve(__dirname, './'),
    coverageDirectory: "<rootDir>/tests/coverage/",
    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: [
        "js",
        "ts",
        "json",
    ],
    moduleNameMapper: {
        "^#runtime$": "<rootDir>/src/runtime/index.ts",
        "^#root/(.*)$": "<rootDir>/$1",
        "^#(.*)$": "<rootDir>/src/$1",
        "^@epicurrents/core(.*)$": "<rootDir>/tests/mocks/epicurrents-core$1",
        "^scoped-event-log$": "<rootDir>/tests/mocks/scoped-event-log.ts",
    },
    modulePaths: [
        "<rootDir>/src/",
    ],
    preset: "ts-jest/presets/js-with-ts",
    roots: [
        "<rootDir>/tests/",
    ],
    globals: {
        'ts-jest': {
            tsconfig: '<rootDir>/tsconfig.test.json',
            diagnostics: false,
            useESM: true
        }
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json', useESM: true }],
        '^.+\\.js$': 'babel-jest',
    },
    transformIgnorePatterns: [
        "node_modules/(?!(@epicurrents)/)",
    ],
    //testRegex: "(test/.*|(\\.|/)(test|spec))\\.(tsx?)$",
    testRegex: "\\.test\\.ts$",
    testEnvironment: "jsdom",
    testEnvironmentOptions: {
        browsers: [
            "chrome",
            "firefox",
            "safari"
        ],
        url: "http://localhost/"
    }
}
