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

Use `EncryptedSharedPreferences` with `MasterKey.KeyScheme.AES256_GCM`.

Do not use plain `SharedPreferences`: it is world-readable on a rooted device
and is included in cloud backups by default.

Consider `setUserAuthenticationRequired` on the master key when the token grants
access to sensitive citizen data.

## iOS

Use the Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.

The `ThisDeviceOnly` suffix is the part that matters: it excludes the item from
iCloud Keychain sync, so a compromised Apple ID does not yield the token. Do not
use `kSecAttrAccessibleAlways` or any accessibility class without the
`ThisDeviceOnly` suffix.

## Flutter

Use `flutter_secure_storage`, configured explicitly:

```dart
const storage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);
```

Both options are required. Without `encryptedSharedPreferences: true` the
Android implementation falls back to plain preferences, and without
`first_unlock_this_device` the iOS item syncs to iCloud Keychain.

## React Native

Use `expo-secure-store` (Expo) or `react-native-keychain` (bare).

Do not use `AsyncStorage`. It is unencrypted plain text on both platforms and is
included in device backups.

## Related

- [Security Policy](SECURITY.md)
- [Integration Guide](INTEGRATION.md)
