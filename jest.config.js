/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],

  // Enable Jest globals (important!)
  injectGlobals: true,

  // Modern way to configure ts-jest (no longer using globals)
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          target: 'ESNext',
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          strict: true,
          isolatedModules: true,
          verbatimModuleSyntax: false, // Important: disable this for Jest
        },
      },
    ],
  },

  // Test file patterns
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.ts'],

  // Module name mapping for ESM imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Transform ignore patterns
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],

  // Collect coverage from source files
  collectCoverageFrom: ['src/**/*.ts', '!src/dev_only/**', '!src/playground.ts', '!src/**/*.d.ts'],

  // Coverage thresholds (optional)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Verbose output for better debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Test timeout
  testTimeout: 10000,

  // Setup files (if needed)
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
