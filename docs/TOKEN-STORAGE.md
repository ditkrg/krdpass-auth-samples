# Token Storage

## The SDKs never persist tokens

None of the four KRDPASS Auth SDKs writes an access token, ID token, or refresh
token to disk. Every result is returned to your code in memory and nothing is
cached, so uninstalling the SDK layer removes no stored credential.

That is deliberate. Storage policy depends on your threat model, your backup
posture, and whether you gate access behind device authentication, and the SDK
cannot make that decision for you.

It also means persistence is your responsibility. If you keep a refresh token
across launches, use the platform's encrypted store with the settings below.

## Android

Encrypt the token with a key held in the Android Keystore, and store the
ciphertext. The key never leaves the Keystore, so a copied file is useless.

Do not use plain `SharedPreferences`: it is world-readable on a rooted device
and is included in cloud backups by default.

Do not reach for `androidx.security:security-crypto` either. Every API in it
(`EncryptedSharedPreferences`, `EncryptedFile`, `MasterKey`, `MasterKeys`) was
deprecated in 1.1.0, in favour of the platform APIs and direct Android Keystore
use. It still works, but it is not what to build on now.

When the token grants access to sensitive citizen data, require user
authentication to unlock the key (`setUserAuthenticationRequired` on the
`KeyGenParameterSpec`).

## iOS

Use the Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.

The `ThisDeviceOnly` suffix is the part that matters: it excludes the item from
iCloud Keychain sync, so a compromised Apple ID does not yield the token. Do not
use `kSecAttrAccessibleAlways` or any accessibility class without the
`ThisDeviceOnly` suffix.

## Flutter

Use `flutter_secure_storage`, setting the iOS accessibility class explicitly:

```dart
const storage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
);
```

`first_unlock_this_device` is the part you have to ask for. Without it the iOS
item syncs to iCloud Keychain and the refresh token leaves the device.

The Android side needs no options as of `flutter_secure_storage` 10.x: the
default `AndroidOptions()` wraps the key with
`RSA/ECB/OAEPWithSHA-256AndMGF1Padding` and stores with `AES/GCM/NoPadding`.
Do not pass `AndroidOptions(encryptedSharedPreferences: true)`: 10.0.0 moved off
the deprecated Jetpack Security library and removed that parameter outright, so
it is a compile error, not a deprecation warning.

## React Native

Use `expo-secure-store` (Expo) or `react-native-keychain` (bare).

Do not use `AsyncStorage`. It is unencrypted plain text on both platforms and is
included in device backups.

## Related

- [Security Policy](SECURITY.md)
- [Integration Guide](INTEGRATION.md)
