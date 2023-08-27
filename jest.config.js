/* @ts-check */

/**
 * @type {import('@jest/types').Config.InitialOptions}
 * @see https://jestjs.io/docs/configuration
 */
module.exports = {
  displayName: 'typeorm-fsm',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  coverageDirectory: './coverage',
  reporters: ['default'],
  collectCoverageFrom: ['src/**/*.ts'],
};
