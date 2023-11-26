const path = require('path')

module.exports = {
    rootDir: path.resolve(__dirname, './'),
    coverageDirectory: "<rootDir>/tests/coverage/",
    extensionsToTreatAsEsm: ['.ts', '.vue'],
    globals: {
        "vue3-jest": {
            "tsconfig": false
        },
        'ts-jest': {
            useESM: true,
            tsconfig: {
                "target": "es2020",
                "module": "esnext",
                "lib": [
                    "es5", "es6", "esnext",
                    "dom", "webworker"
                ],
                "strict": true,
                "noImplicitReturns": true,
                "moduleResolution": "node",
                "baseUrl": "./",
                "paths": {
                    "CONFIG/*": ["src/config/*"],
                    "ROOT/*": ["src/*"],
                    "TYPES/*": ["src/types/*"],
                }
            }
        },
    },
    moduleFileExtensions: [
        "js",
        "ts",
        "json",
        "vue",
    ],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1", // Jest-spesific
        "^CONFIG/(.*)$": "<rootDir>/src/config/$1",
        "^ROOT/(.*)$": "<rootDir>/src/$1",
        "^TYPES/(.*)$": "<rootDir>/src/types/$1",
    },
    modulePaths: [
        "<rootDir>/src/",
    ],
    roots: [
        "<rootDir>/tests/",
    ],
    snapshotSerializers: [
        "jest-serializer-vue",
    ],
    transform: {
        "^.+\\.js$": "babel-jest",
        "^.+\\.ts$": "ts-jest",
        "^.+\\.vue$": "vue3-jest",
    },
    transformIgnorePatterns: [
        "node_modules/(?!(@babel)/)",
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
