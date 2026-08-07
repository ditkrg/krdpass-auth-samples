# KRDPASS Bare React Native Example

This is a genuine Expo-free React Native 0.86 example for the KRDPASS Auth SDK.
It exercises React Native autolinking and Codegen directly; it does not install Expo
or Expo Modules.

## Configure local demo values

The shared local configuration is the only source of demo values. Do not copy values
from another sample or put a client secret in this project.

```bash
cd ..
./scripts/sync-secrets.sh --all
```

That reads `shared/secrets/.env`, writes this project's ignored `.env` with the
public runtime configuration, applies the same Android debug signing key, and updates
the Android package, iOS bundle ID/team, and Associated Domain to the registered demo
values. For a clean build that must leave tracked native settings untouched, use
`--no-patch-tracked`; use the normal command before a physical-device sign-in test.

## Install and run

This sample targets React Native SDK `v1.4.0` and Android core `1.4.0`,
both installed from the published release.

```bash
npm install
npm run android
# or
(cd ios && bundle install && bundle exec pod install)
npm run ios
```

Start Metro separately with `npm start` when launching through Xcode. Android requires
the shared registered debug signing key for KRDPASS to accept the calling app. iOS
requires the configured team, bundle ID, and Associated Domain for Universal Links.

The default flow is server-mediated: the reference backend owns PAR and token exchange.
The in-app direct-flow switch is present to exercise the SDK-only PKCE path and should
be used only with an approved public client. Tokens stay in memory and the app never
renders their values.

Redirect validation requires the exact registered HTTPS origin, encoded path,
and fixed query parameters. BFF token exchange sends only `code`,
`codeVerifier`, and `state`; the BFF recovers environment and redirect URI from
server-side PAR state.
