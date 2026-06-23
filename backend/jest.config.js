module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '/__tests__/.*\\.test\\.js$',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    'config/**/*.js',
    '!node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 90,
      lines: 90,
      functions: 90,
      branches: 70,
    },
  },
  testTimeout: 15000,
};
