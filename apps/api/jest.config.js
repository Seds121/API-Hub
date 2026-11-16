/** @type {import('jest').Config} */
const base = { preset: 'ts-jest', testEnvironment: 'node', transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: { warnOnly: false } }] } };
module.exports = {
  testTimeout: 30000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'], setupFiles: ['<rootDir>/test/env.ts'] },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'], setupFiles: ['<rootDir>/test/env.ts'], globalSetup: '<rootDir>/test/global-setup.ts', globalTeardown: '<rootDir>/test/global-teardown.ts' },
  ],
};
