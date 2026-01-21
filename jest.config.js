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
    },
    modulePaths: [
        "<rootDir>/src/",
    ],
    preset: "ts-jest/presets/js-with-ts",
    roots: [
        "<rootDir>/tests/",
    ],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json', useESM: true }],
        '^.+\\.js$': 'babel-jest',
    },
    transformIgnorePatterns: [
        "node_modules/(?!(@epicurrents)/)",
    ],
    //testRegex: "(test/.*|(\\.|/)(test|spec))\\.(tsx?)$",
    testRegex: "tests.ts$",
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
