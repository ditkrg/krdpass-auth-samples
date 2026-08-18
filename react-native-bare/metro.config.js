const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const fs = require('fs');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;

// When a local SDK checkout exists next to this repository, resolve the package
// from it so Metro picks up local changes instead of the installed copy, and a
// reset Metro cache cannot switch back to a stale npm/Git installation.
const sdkRoot = path.resolve(projectRoot, '../../krdpass-auth-sdk-react-native');
const singletons = ['react', 'react-native'];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = fs.existsSync(sdkRoot)
  ? {
      watchFolders: [sdkRoot],
      resolver: {
        extraNodeModules: {
          'krdpass-auth-react-native': sdkRoot,
          ...Object.fromEntries(singletons.map((name) => [name, path.join(projectRoot, 'node_modules', name)])),
        },
        blockList: singletons.map(
          (name) => new RegExp(`${escape(path.join(sdkRoot, 'node_modules', name))}/.*`),
        ),
      },
    }
  : {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
