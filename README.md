# KRDPASS Auth samples

Runnable sample apps for Sign in with KRDPASS on Android, iOS, Flutter and React Native,
plus a Node.js backend-for-frontend reference. Use them to see the app-to-app flow end to
end before wiring it into your own app.

The SDKs are not in this repository. Each sample installs the published release:

| Platform | Sample | SDK | Installed as |
| --- | --- | --- | --- |
| Android | [`android`](android) | [krdpass-auth-sdk-android](https://github.com/ditkrg/krdpass-auth-sdk-android) | Maven Central `krd.pass:krdpass-auth:1.5.0` |
| iOS | [`ios`](ios) | [krdpass-auth-sdk-ios](https://github.com/ditkrg/krdpass-auth-sdk-ios) | Swift Package Manager, exact `1.5.0`, or CocoaPods tag `v1.5.0` |
| Flutter | [`flutter`](flutter) | [krdpass-auth-sdk-flutter](https://github.com/ditkrg/krdpass-auth-sdk-flutter) | git dependency `ref: v1.5.0` |
| React Native (Expo) | [`react-native`](react-native) | [krdpass-auth-sdk-react-native](https://github.com/ditkrg/krdpass-auth-sdk-react-native) | git dependency `#v1.5.0` |
| React Native (bare) | [`react-native-bare`](react-native-bare) | same | git dependency `#v1.5.0` |
| Backend reference | [`server`](server) | n/a | Node.js |

## Where to start

1. [Integration guide](docs/INTEGRATION.md), for the end-to-end picture.
2. Your platform's SDK README, linked above, for installation and API.
3. The matching sample here, to see it working.
4. [`server`](server/README.md), if you are building the server-mediated flow.

To build and run the samples, see [docs/BUILDING.md](docs/BUILDING.md).

## Getting access

KRDPASS credentials are approval-based, not self-service. Email `integration@pass.krd` to
onboard; each SDK README lists what to send for that platform.

Never embed a `client_secret` in a mobile app. For production, use the server-mediated flow
with a backend-for-frontend, as demonstrated in [`server`](server).

Security policy and vulnerability reporting: [docs/SECURITY.md](docs/SECURITY.md).

## Reference

- [Protocol specification](docs/specs/sdk-auth-api.md), the shared contract all four SDKs implement.
- [Token storage](docs/TOKEN-STORAGE.md), because no SDK persists tokens for you.
- [DIT Digital Service Manual](https://docs.digital.gov.krd/software-development/04-interoperability/10-krdpass), official KRDPASS policy.

## License

MIT, see [LICENSE](LICENSE).
