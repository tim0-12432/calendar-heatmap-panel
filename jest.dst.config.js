// Dedicated DST test run: Node caches the timezone per process, so the default
// jest.config.js (which forces TZ=UTC) cannot be reused for these tests.
process.env.TZ = 'Europe/Berlin';

module.exports = {
  ...require('./.config/jest.config'),
  // Warning: a *.test.tsx/*.spec.ts file in src/dst-tests/ would also be collected by the default UTC config.
  testMatch: ['<rootDir>/src/dst-tests/**/*.{ts,tsx}'],
};
