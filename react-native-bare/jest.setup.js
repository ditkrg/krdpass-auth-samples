/* eslint-env jest */
// The SDK resolves its TurboModule at import time (TurboModuleRegistry.getEnforcing), which
// throws under Jest because no native runtime is registered. Stub that one module so a test
// can import the SDK for its pure-JS helpers, such as makeTokenResult. Every other native
// module still goes to the real registry: React Native's own Dimensions and DeviceInfo need
// it, and a blanket stub takes them down with it.
//
// Tests that exercise SDK methods still mock those methods themselves.
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => {
  const actual = jest.requireActual(
    'react-native/Libraries/TurboModule/TurboModuleRegistry',
  );
  return {
    ...actual,
    getEnforcing: name =>
      name === 'KrdpassAuthReactNative' ? {} : actual.getEnforcing(name),
  };
});
