module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/backend/'],
  // The first test in a suite pays the React Native babel-transform cost, which
  // exceeds jest's default 5s timeout on cold-cache CI runners (passes locally).
  testTimeout: 20000,
};
