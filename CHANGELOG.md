# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-07-22

### Changed

- Upgrade the Android, Flutter, React Native, Expo, and Node dependency stacks
  to their latest mutually compatible versions.
- Consume React Native SDK 1.1.3, whose Expo plugin migrates stale native iOS
  core tags during prebuild.
- Consume Flutter SDK 1.1.2, avoiding Flutter's legacy Kotlin plugin injection
  while using AGP 9 built-in Kotlin.
- Migrate the Flutter iOS sample from CocoaPods to SwiftPM and align its
  deployment target with the SDK's iOS 15.5 minimum.
- Add reproducible lockfiles, Expo Doctor validation, and explicit Dependabot
  compatibility boundaries for coordinated platform upgrades.

## [1.0.0] - 2026-07-02

### Added

- Initial release of the KRDPASS sample apps for Android, iOS, Flutter, and React Native, plus a Node.js backend (BFF) reference.
- Comprehensive documentation, example applications, and reference backend implementation.
