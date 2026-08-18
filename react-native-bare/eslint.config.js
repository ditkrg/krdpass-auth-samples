// ESLint 9 flat config for this bare React Native 0.86 sample.
//
// @react-native/eslint-config/flat already applies eslint-config-prettier, so
// the formatting rules that would fight Prettier are off without listing it
// again here.
//
// package.json overrides eslint-plugin-ft-flow to ^3: the ^2 range the upstream
// config asks for calls context.getAllComments(), which ESLint 9 removed, and
// loading any rule from it aborts the whole run.
const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  ...reactNativeConfig,
  {
    // The upstream config gives Jest globals to test files and __tests__/, which
    // does not cover the setup file Jest loads before them.
    files: ['jest.setup.js'],
    languageOptions: {globals: {jest: 'readonly'}},
  },
  {
    ignores: ['android/', 'ios/', 'node_modules/'],
  },
];
