// ESLint 9 flat config for this Expo SDK 55 sample app.
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ["android/", "ios/", "node_modules/"],
  },
]);
