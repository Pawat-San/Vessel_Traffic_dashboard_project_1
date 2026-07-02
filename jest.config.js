module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/database/migrations/**',
    '!src/database/seeds/**',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10
    }
  },
  verbose: true,
  testMatch: ['**/tests/**/*.test.js']
};
