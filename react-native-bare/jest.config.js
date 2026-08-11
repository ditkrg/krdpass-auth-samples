module.exports = {
  preset: '@react-native/jest-preset',
  // The redirect vector suite imports ../../shared, which sits outside this
  // package, so Babel's runtime helpers have to be resolvable from there too.
  modulePaths: ['<rootDir>/node_modules'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
