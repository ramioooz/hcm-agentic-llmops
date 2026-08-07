import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
};

export default config;
