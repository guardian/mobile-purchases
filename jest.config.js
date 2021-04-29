module.exports = {
    "roots": [
        "typescript/src",
        "typescript/tests"
    ],
    "preset": "ts-jest/presets/js-with-ts",
    "transform": {
        "^.+\\.tsx?$": "ts-jest"
    },
    transformIgnorePatterns: ['node_modules/(?!@guardian)']
}
