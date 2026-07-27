// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// When a local SDK checkout exists next to this repository, resolve the package
// from it so Metro picks up local changes instead of the installed copy. Keep
// the path explicit instead of deriving it from node_modules: Metro otherwise
// falls back to the previous install whenever a dev server outlives an npm
// install.
const sdkRoot = path.resolve(projectRoot, '../../krdpass-auth-sdk-react-native');
if (fs.existsSync(sdkRoot)) {
  const singletons = ['react', 'react-native', 'expo-modules-core'];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  config.watchFolders = [...new Set([...(config.watchFolders ?? []), sdkRoot])];
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    'krdpass-auth-react-native': sdkRoot,
    ...Object.fromEntries(singletons.map((name) => [name, path.join(projectRoot, 'node_modules', name)])),
  };
  config.resolver.blockList = [].concat(
    config.resolver.blockList ?? [],
    singletons.map((name) => new RegExp(`${escape(path.join(sdkRoot, 'node_modules', name))}/.*`)),
  );
}

module.exports = config;
