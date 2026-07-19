// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// When the SDK is installed from a registry or git, the default config is all we need.
// During SDK development it is a `file:` dependency instead. npm symlinks it to a local
// checkout outside this project, which Metro cannot see by default. Detect that case and
// wire it up: watch the checkout, and keep the app's node_modules as the single source of
// the shared native singletons (the checkout carries its own copies for its test suite).
const sdkLink = path.join(projectRoot, 'node_modules', 'krdpass-auth-react-native');
if (fs.existsSync(sdkLink) && fs.lstatSync(sdkLink).isSymbolicLink()) {
  const sdkRoot = fs.realpathSync(sdkLink);
  const singletons = ['react', 'react-native', 'expo-modules-core'];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  config.watchFolders = [sdkRoot];
  config.resolver.extraNodeModules = Object.fromEntries(
    singletons.map((name) => [name, path.join(projectRoot, 'node_modules', name)]),
  );
  config.resolver.blockList = [].concat(
    config.resolver.blockList ?? [],
    singletons.map((name) => new RegExp(`${escape(path.join(sdkRoot, 'node_modules', name))}/.*`)),
  );
}

module.exports = config;
