/**
 * @format
 */

// Polyfills global.crypto.getRandomValues. Must stay the first import: the SDK
// throws if that global is missing, and imports run in source order.
import 'react-native-get-random-values';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
