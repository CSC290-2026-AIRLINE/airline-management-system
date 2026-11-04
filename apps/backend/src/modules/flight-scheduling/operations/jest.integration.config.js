// Jest config for schedule-approval.integration.spec.ts only. The generated Prisma client imports its own files with a ".js" ending, which
// the default config cannot resolve to the .ts files, so it maps them. Run from apps/backend (see the spec's header).
const path = require('node:path')

const src = path.resolve(__dirname, '../../..')

module.exports = {
  rootDir: src,
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'schedule-approval\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
}
