#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="${KRD_SECRETS_FILE:-$ROOT_DIR/shared/secrets/.env}"
TARGET="${KRD_SYNC_TARGET:-all}"
CLI_PATCH_TRACKED=""

usage() {
  cat <<USAGE
Usage: ./scripts/sync-secrets.sh [options]

Sync local secrets/config into SDK sample apps.

Options:
  --android                Configure Android-only paths/patches.
  --ios                    Configure iOS-only paths/patches.
  --all                    Configure both Android and iOS (default).
  --platform <name>        One of: all, android, ios.
  --secrets-file <path>    Use a custom secrets file (default: shared/secrets/.env).
  --patch-tracked          Force patching tracked sample files for local run.
  --no-patch-tracked       Force skipping tracked file patching.
  -h, --help               Show this help.

Environment overrides:
  KRD_SECRETS_FILE         Same as --secrets-file.
  KRD_SYNC_TARGET          Same as --platform.
  PATCH_TRACKED_DEMO_FILES If set in secrets file, controls tracked-file patching.

Platform wrappers:
  ./scripts/sync-secrets-android.sh
  ./scripts/sync-secrets-ios.sh
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "[sync-secrets] $*" >&2
}

require_command() {
  local bin="$1"
  command -v "$bin" >/dev/null 2>&1 || die "missing required command '$bin' in PATH"
}

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    die "missing required var '$key' in $SECRETS_FILE"
  fi
}

csv_append_unique() {
  local csv="${1:-}"
  local value="${2:-}"
  local part=""
  local cleaned=""
  local out=()

  [[ -n "$value" ]] || {
    printf "%s" "$csv"
    return 0
  }

  IFS=',' read -r -a parts <<< "$csv"
  for part in "${parts[@]+"${parts[@]}"}"; do
    cleaned="$(printf "%s" "$part" | xargs)"
    [[ -n "$cleaned" ]] || continue
    out+=("$cleaned")
  done

  for part in "${out[@]+"${out[@]}"}"; do
    if [[ "$part" == "$value" ]]; then
      printf "%s" "$(IFS=,; echo "${out[*]}")"
      return 0
    fi
  done

  out+=("$value")
  printf "%s" "$(IFS=,; echo "${out[*]}")"
}

resolve_repo_path() {
  local path="$1"
  if [[ "$path" == /* ]]; then
    printf "%s" "$path"
  else
    printf "%s" "$ROOT_DIR/$path"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --android)
      TARGET="android"
      shift
      ;;
    --ios)
      TARGET="ios"
      shift
      ;;
    --all)
      TARGET="all"
      shift
      ;;
    --platform)
      [[ $# -ge 2 ]] || die "--platform requires a value (all|android|ios)"
      TARGET="$2"
      shift 2
      ;;
    --secrets-file)
      [[ $# -ge 2 ]] || die "--secrets-file requires a path"
      SECRETS_FILE="$2"
      shift 2
      ;;
    --patch-tracked)
      CLI_PATCH_TRACKED="true"
      shift
      ;;
    --no-patch-tracked)
      CLI_PATCH_TRACKED="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1 (run with --help)"
      ;;
  esac
done

TARGET_ANDROID="false"
TARGET_IOS="false"
case "$TARGET" in
  all)
    TARGET_ANDROID="true"
    TARGET_IOS="true"
    ;;
  android)
    TARGET_ANDROID="true"
    ;;
  ios)
    TARGET_IOS="true"
    ;;
  *)
    die "invalid target '$TARGET' (expected: all|android|ios)"
    ;;
esac

if [[ ! -f "$SECRETS_FILE" ]]; then
  die "missing secrets file: $SECRETS_FILE (create it from: $ROOT_DIR/shared/secrets/.env.example)"
fi

# shellcheck disable=SC1090
set -a
source "$SECRETS_FILE"
set +a

# Preserve whatever DEMO_ANDROID_SHA256 the secrets file set, before the Android
# keystore flow below overwrites the variable for the current run.
SECRETS_DEMO_ANDROID_SHA256="${DEMO_ANDROID_SHA256:-}"

PATCH_TRACKED_DEMO_FILES="${PATCH_TRACKED_DEMO_FILES:-true}"
if [[ -n "$CLI_PATCH_TRACKED" ]]; then
  PATCH_TRACKED_DEMO_FILES="$CLI_PATCH_TRACKED"
fi

# Required for all flows because we generate server env + client envs.
require_var BACKEND_URL
require_var REDIRECT_URI
require_var CLIENT_ID
require_var CLIENT_SECRET
require_var RSA_PRIVATE_KEY

# Tooling requirements.
require_command node
require_command perl
if [[ "$TARGET_ANDROID" == "true" ]]; then
  require_command keytool
fi

KRD_ENVIRONMENT="${KRD_ENVIRONMENT:-development}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
DEMO_EXTRAS="${DEMO_EXTRAS:-true}"
DEMO_ANDROID_PACKAGE_NAME="${DEMO_ANDROID_PACKAGE_NAME:-krd.pass.auth.demo}"
DEMO_IOS_BUNDLE_ID="${DEMO_IOS_BUNDLE_ID:-$DEMO_ANDROID_PACKAGE_NAME}"

if [[ "$DEMO_EXTRAS" == "true" ]] && [[ "$TARGET_IOS" == "true" ]] && [[ -z "${DEMO_IOS_APP_IDS:-}" ]] && [[ -z "${DEMO_IOS_TEAM_ID:-}" ]]; then
  info "WARN: DEMO_EXTRAS=true but DEMO_IOS_TEAM_ID/DEMO_IOS_APP_IDS is not set in $SECRETS_FILE"
fi

backend_host="$(node -e "try{console.log(new URL(process.env.BACKEND_URL).host)}catch(e){process.exit(1)}")" \
  || die "BACKEND_URL must be a valid URL: $BACKEND_URL"

redirect_host="$(node -e "try{console.log(new URL(process.env.REDIRECT_URI).host)}catch(e){process.exit(1)}")" \
  || die "REDIRECT_URI must be a valid URL: $REDIRECT_URI"

if [[ "$backend_host" != "$redirect_host" ]]; then
  info "WARN: BACKEND_URL host ($backend_host) != REDIRECT_URI host ($redirect_host)"
fi

# Always ensure redirect host is allowed for local testing.
ALLOWED_REDIRECT_HOSTS="$(csv_append_unique "${ALLOWED_REDIRECT_HOSTS:-}" "$redirect_host")"

SHARED_KEYSTORE="$ROOT_DIR/shared/secrets/krdpass-demo.keystore"
SHARED_ALIAS="krdpass-demo"
SHARED_STORE_PASS="krdpass-demo"
SHARED_KEY_PASS="krdpass-demo"

get_sha256_from_keystore() {
  local keystore="$1"
  local alias="$2"
  local storepass="$3"
  keytool -list -v -keystore "$keystore" -alias "$alias" -storepass "$storepass" 2>/dev/null \
    | grep "SHA256:" | head -1 | sed 's/.*SHA256: *//' | tr -d ' \r\n' | tr '[:lower:]' '[:upper:]'
}

ensure_shared_keystore() {
  if [[ -f "$SHARED_KEYSTORE" ]]; then
    return 0
  fi
  info "creating shared demo keystore at $SHARED_KEYSTORE"
  mkdir -p "$(dirname "$SHARED_KEYSTORE")"
  keytool -genkey -v -keystore "$SHARED_KEYSTORE" -alias "$SHARED_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$SHARED_STORE_PASS" -keypass "$SHARED_KEY_PASS" \
    -dname "CN=KRDPASS Demo, OU=Demo, O=KRDPASS, L=KRD, ST=KRD, C=KRD"
}

ANDROID_KEYSTORE_PATH_FINAL=""
ANDROID_KEYSTORE_ALIAS_FINAL=""
ANDROID_KEYSTORE_PASSWORD_FINAL=""
ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL=""
DEMO_ANDROID_SHA256=""

if [[ "$TARGET_ANDROID" == "true" ]]; then
  if [[ -n "${ANDROID_KEYSTORE_PATH:-}" ]]; then
    require_var ANDROID_KEYSTORE_ALIAS
    require_var ANDROID_KEYSTORE_PASSWORD
    require_var ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD
    ANDROID_KEYSTORE_PATH_FINAL="$(resolve_repo_path "$ANDROID_KEYSTORE_PATH")"
    [[ -f "$ANDROID_KEYSTORE_PATH_FINAL" ]] || die "ANDROID_KEYSTORE_PATH does not exist: $ANDROID_KEYSTORE_PATH_FINAL"
    ANDROID_KEYSTORE_ALIAS_FINAL="$ANDROID_KEYSTORE_ALIAS"
    ANDROID_KEYSTORE_PASSWORD_FINAL="$ANDROID_KEYSTORE_PASSWORD"
    ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL="$ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD"
    DEMO_ANDROID_SHA256="$(get_sha256_from_keystore "$ANDROID_KEYSTORE_PATH_FINAL" "$ANDROID_KEYSTORE_ALIAS_FINAL" "$ANDROID_KEYSTORE_PASSWORD_FINAL")"
    if [[ -z "$DEMO_ANDROID_SHA256" ]]; then
      die "could not read SHA256 from keystore $ANDROID_KEYSTORE_PATH_FINAL (check alias/password)"
    fi
    info "using configured Android keystore; SHA256: $DEMO_ANDROID_SHA256"
  else
    ensure_shared_keystore
    ANDROID_KEYSTORE_PATH_FINAL="$SHARED_KEYSTORE"
    ANDROID_KEYSTORE_ALIAS_FINAL="$SHARED_ALIAS"
    ANDROID_KEYSTORE_PASSWORD_FINAL="$SHARED_STORE_PASS"
    ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL="$SHARED_KEY_PASS"
    DEMO_ANDROID_SHA256="$(get_sha256_from_keystore "$SHARED_KEYSTORE" "$SHARED_ALIAS" "$SHARED_STORE_PASS")"
    if [[ -z "$DEMO_ANDROID_SHA256" ]]; then
      die "could not read SHA256 from shared keystore"
    fi
    info "using shared demo keystore; SHA256: $DEMO_ANDROID_SHA256"
  fi

  DEMO_ANDROID_APP_LINKS="${DEMO_ANDROID_APP_LINKS:-$DEMO_ANDROID_PACKAGE_NAME|$DEMO_ANDROID_SHA256}"
else
  # iOS-only mode: keep Android values from secrets if provided, do not force Android keystore setup.
  DEMO_ANDROID_SHA256="$SECRETS_DEMO_ANDROID_SHA256"
  DEMO_ANDROID_APP_LINKS="${DEMO_ANDROID_APP_LINKS:-}"
  if [[ -z "$DEMO_ANDROID_APP_LINKS" ]] && [[ -n "$DEMO_ANDROID_PACKAGE_NAME" ]] && [[ -n "$DEMO_ANDROID_SHA256" ]]; then
    DEMO_ANDROID_APP_LINKS="$DEMO_ANDROID_PACKAGE_NAME|$DEMO_ANDROID_SHA256"
  fi
fi

mkdir -p "$ROOT_DIR/server"
mkdir -p "$ROOT_DIR/flutter"
mkdir -p "$ROOT_DIR/react-native"
if [[ "$TARGET_ANDROID" == "true" ]]; then
  mkdir -p "$ROOT_DIR/android"
fi

info "sync target: $TARGET"
info "secrets file: $SECRETS_FILE"

info "writing server/.env"
cat > "$ROOT_DIR/server/.env" <<EOF_ENV
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
HOST=$HOST
PORT=$PORT

CLIENT_ID=$CLIENT_ID
CLIENT_SECRET=$CLIENT_SECRET
RSA_PRIVATE_KEY="$RSA_PRIVATE_KEY"

DEMO_EXTRAS=$DEMO_EXTRAS
DEMO_IOS_APP_IDS=${DEMO_IOS_APP_IDS:-}
DEMO_IOS_TEAM_ID=${DEMO_IOS_TEAM_ID:-}
DEMO_IOS_BUNDLE_ID=$DEMO_IOS_BUNDLE_ID
DEMO_ANDROID_APP_LINKS=$DEMO_ANDROID_APP_LINKS
DEMO_ANDROID_PACKAGE_NAME=$DEMO_ANDROID_PACKAGE_NAME
DEMO_ANDROID_SHA256=$DEMO_ANDROID_SHA256

ALLOWED_REDIRECT_HOSTS=$ALLOWED_REDIRECT_HOSTS
EOF_ENV

if [[ "$TARGET_ANDROID" == "true" ]]; then
  info "writing android/config.properties"
  cat > "$ROOT_DIR/android/config.properties" <<EOF_ANDROID_CONFIG
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
backendUrl=$BACKEND_URL
redirectUri=$REDIRECT_URI
clientId=$CLIENT_ID
environment=$KRD_ENVIRONMENT
EOF_ANDROID_CONFIG
else
  info "skipping native Android sample config (target=$TARGET)"
fi

info "writing flutter/.env"
cat > "$ROOT_DIR/flutter/.env" <<EOF_FLUTTER_ENV
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
CLIENT_ID=$CLIENT_ID
REDIRECT_URI=$REDIRECT_URI
BACKEND_URL=$BACKEND_URL
ENVIRONMENT=$KRD_ENVIRONMENT
EOF_FLUTTER_ENV

info "writing react-native/.env"
cat > "$ROOT_DIR/react-native/.env" <<EOF_RN_ENV
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
EXPO_PUBLIC_BACKEND_URL=$BACKEND_URL
EXPO_PUBLIC_REDIRECT_URI=$REDIRECT_URI
EXPO_PUBLIC_CLIENT_ID=$CLIENT_ID
EXPO_PUBLIC_ENVIRONMENT=$KRD_ENVIRONMENT
EOF_RN_ENV

# -----------------------------------------------------------------------------
# Android signing: write key.properties for all Android/Flutter/RN demos (one key)
# -----------------------------------------------------------------------------
if [[ "$TARGET_ANDROID" == "true" ]]; then
  KEYSTORE_ABS="$ANDROID_KEYSTORE_PATH_FINAL"
  [[ -f "$KEYSTORE_ABS" ]] || die "resolved Android keystore path does not exist: $KEYSTORE_ABS"

  info "writing Android signing key.properties (all Android examples use the same key)"

  mkdir -p "$ROOT_DIR/android"
  cat > "$ROOT_DIR/android/key.properties" <<EOF_ANDROID_KEY
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
storeFile=$KEYSTORE_ABS
storePassword=$ANDROID_KEYSTORE_PASSWORD_FINAL
keyAlias=$ANDROID_KEYSTORE_ALIAS_FINAL
keyPassword=$ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL
EOF_ANDROID_KEY

  mkdir -p "$ROOT_DIR/flutter/android"
  cat > "$ROOT_DIR/flutter/android/key.properties" <<EOF_FLUTTER_KEY
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
storeFile=$KEYSTORE_ABS
storePassword=$ANDROID_KEYSTORE_PASSWORD_FINAL
keyAlias=$ANDROID_KEYSTORE_ALIAS_FINAL
keyPassword=$ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL
EOF_FLUTTER_KEY

  mkdir -p "$ROOT_DIR/react-native/android"
  cat > "$ROOT_DIR/react-native/android/key.properties" <<EOF_RN_KEY
# Generated by scripts/sync-secrets.sh. DO NOT COMMIT.
storeFile=$KEYSTORE_ABS
storePassword=$ANDROID_KEYSTORE_PASSWORD_FINAL
keyAlias=$ANDROID_KEYSTORE_ALIAS_FINAL
keyPassword=$ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD_FINAL
EOF_RN_KEY
else
  info "skipping Android keystore/key.properties generation (target=$TARGET)"
fi

# -----------------------------------------------------------------------------
# Patch associated-domain placeholders + app IDs in tracked sample files
# -----------------------------------------------------------------------------
DOMAIN_LINE="applinks:$redirect_host"

patch_entitlements() {
  local path="$1"
  if [[ -f "$path" ]]; then
    info "patching associated domain in $(realpath "$path")"
    perl -0777 -i -pe "s/applinks:[^<\\s]+/$DOMAIN_LINE/g" "$path"
  fi
}

detect_android_package() {
  local gradle_file="$1"
  perl -ne '
    if (/namespace\s*=\s*"([^"]+)"/) { print $1; exit 0; }
    if (/namespace\s+\x27([^\x27]+)\x27/) { print $1; exit 0; }
  ' "$gradle_file"
}

patch_android_gradle_ids() {
  local gradle_file="$1"
  local new_pkg="$2"
  [[ -f "$gradle_file" ]] || return 0

  if [[ "$gradle_file" == *.kts ]]; then
    NEW_PKG="$new_pkg" perl -0777 -i -pe '
      BEGIN { $pkg = $ENV{NEW_PKG}; }
      s{(namespace\s*=\s*")[^"]+(")}{$1 . $pkg . $2}ge;
      s{(applicationId\s*=\s*")[^"]+(")}{$1 . $pkg . $2}ge;
    ' "$gradle_file"
  else
    NEW_PKG="$new_pkg" perl -0777 -i -pe '
      BEGIN { $pkg = $ENV{NEW_PKG}; }
      s{(namespace\s+\x27)[^\x27]+(\x27)}{$1 . $pkg . $2}ge;
      s{(applicationId\s+\x27)[^\x27]+(\x27)}{$1 . $pkg . $2}ge;
    ' "$gradle_file"
  fi
}

patch_android_source_tree() {
  local src_root="$1"
  local old_pkg="$2"
  local new_pkg="$3"
  [[ -d "$src_root" ]] || return 0
  [[ -n "$old_pkg" ]] || return 0
  [[ "$old_pkg" != "$new_pkg" ]] || return 0

  while IFS= read -r -d '' file; do
    OLD_PKG="$old_pkg" NEW_PKG="$new_pkg" perl -i -pe 's/\Q$ENV{OLD_PKG}\E/$ENV{NEW_PKG}/g' "$file"
  done < <(find "$src_root" -type f \( -name "*.kt" -o -name "*.java" \) -print0)
}

patch_ios_pbxproj_ids() {
  local pbxproj="$1"
  local bundle_id="$2"
  local team_id="${3:-}"
  local keep_runner_tests="${4:-false}"
  [[ -f "$pbxproj" ]] || return 0

  info "patching bundle identifiers in $(realpath "$pbxproj")"
  IOS_BUNDLE_ID="$bundle_id" IOS_TEAM_ID="$team_id" KEEP_RUNNER_TESTS="$keep_runner_tests" perl -0777 -i -pe '
    BEGIN {
      $bundle = $ENV{IOS_BUNDLE_ID};
      $team = $ENV{IOS_TEAM_ID};
      $keepTests = $ENV{KEEP_RUNNER_TESTS} eq "true";
    }
    s{
      PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);
    }{
      my $current = $1;
      my $next = ($keepTests && $current =~ /RunnerTests$/) ? "$bundle.RunnerTests" : $bundle;
      "PRODUCT_BUNDLE_IDENTIFIER = $next;";
    }gex;
    s{DEVELOPMENT_TEAM = [^;]+;}{DEVELOPMENT_TEAM = $team;}g if defined($team) && length($team) > 0;
  ' "$pbxproj"
}

patch_rn_app_json() {
  local app_json="$1"
  local domain_line="$2"
  local android_package="$3"
  local ios_bundle_id="$4"
  local ios_team_id="$5"
  local patch_android="$6"
  local patch_ios="$7"
  [[ -f "$app_json" ]] || return 0

  info "patching React Native app.json"
  node - "$app_json" "$domain_line" "$android_package" "$ios_bundle_id" "$ios_team_id" "$patch_android" "$patch_ios" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const domainLine = process.argv[3];
const androidPackage = process.argv[4];
const iosBundleId = process.argv[5];
const iosTeamId = process.argv[6];
const patchAndroid = process.argv[7] === 'true';
const patchIos = process.argv[8] === 'true';

const data = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!data.expo) data.expo = {};
if (!data.expo.ios) data.expo.ios = {};
if (!data.expo.android) data.expo.android = {};

if (patchAndroid) {
  data.expo.android.package = androidPackage;
}

if (patchIos) {
  data.expo.ios.bundleIdentifier = iosBundleId;
  data.expo.ios.associatedDomains = [domainLine];
  if (iosTeamId) {
    data.expo.ios.appleTeamId = iosTeamId;
  } else {
    delete data.expo.ios.appleTeamId;
  }
}

fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
NODE
}

if [[ "$PATCH_TRACKED_DEMO_FILES" == "true" ]]; then
  if [[ "$TARGET_ANDROID" == "true" ]]; then
    ANDROID_SAMPLE_GRADLE="$ROOT_DIR/android/app/build.gradle.kts"
    FLUTTER_SAMPLE_GRADLE="$ROOT_DIR/flutter/android/app/build.gradle.kts"
    RN_SAMPLE_GRADLE="$ROOT_DIR/react-native/android/app/build.gradle"

    for gradle_file in "$ANDROID_SAMPLE_GRADLE" "$FLUTTER_SAMPLE_GRADLE" "$RN_SAMPLE_GRADLE"; do
      if [[ -f "$gradle_file" ]]; then
        current_pkg="$(detect_android_package "$gradle_file")"
        patch_android_gradle_ids "$gradle_file" "$DEMO_ANDROID_PACKAGE_NAME"
        case "$gradle_file" in
          "$ANDROID_SAMPLE_GRADLE")
            patch_android_source_tree "$ROOT_DIR/android/app/src" "$current_pkg" "$DEMO_ANDROID_PACKAGE_NAME"
            ;;
          "$FLUTTER_SAMPLE_GRADLE")
            patch_android_source_tree "$ROOT_DIR/flutter/android/app/src" "$current_pkg" "$DEMO_ANDROID_PACKAGE_NAME"
            ;;
          "$RN_SAMPLE_GRADLE")
            patch_android_source_tree "$ROOT_DIR/react-native/android/app/src" "$current_pkg" "$DEMO_ANDROID_PACKAGE_NAME"
            ;;
        esac
      fi
    done
  fi

  if [[ "$TARGET_IOS" == "true" ]]; then
    patch_ios_pbxproj_ids "$ROOT_DIR/ios/demo-krdpass-auth.xcodeproj/project.pbxproj" "$DEMO_IOS_BUNDLE_ID" "${DEMO_IOS_TEAM_ID:-}" "false"
    patch_ios_pbxproj_ids "$ROOT_DIR/flutter/ios/Runner.xcodeproj/project.pbxproj" "$DEMO_IOS_BUNDLE_ID" "${DEMO_IOS_TEAM_ID:-}" "true"
    patch_ios_pbxproj_ids "$ROOT_DIR/react-native/ios/krdpassauthreactnativeexample.xcodeproj/project.pbxproj" "$DEMO_IOS_BUNDLE_ID" "${DEMO_IOS_TEAM_ID:-}" "false"

    patch_entitlements "$ROOT_DIR/ios/demo-krdpass-auth/demo-krdpass-auth.entitlements"
    patch_entitlements "$ROOT_DIR/flutter/ios/Runner/Runner.entitlements"
    patch_entitlements "$ROOT_DIR/react-native/ios/krdpassauthreactnativeexample/krdpassauthreactnativeexample.entitlements"

    IOS_SCHEME="$ROOT_DIR/ios/demo-krdpass-auth.xcodeproj/xcshareddata/xcschemes/demo-krdpass-auth.xcscheme"
    if [[ -f "$IOS_SCHEME" ]]; then
      info "patching iOS scheme env vars (KRD_CLIENT_ID / KRD_BACKEND_URL / KRD_REDIRECT_URI)"
      CLIENT_ID="$CLIENT_ID" BACKEND_URL="$BACKEND_URL" REDIRECT_URI="$REDIRECT_URI" perl -0777 -i -pe '
      BEGIN { $c=$ENV{CLIENT_ID}; $b=$ENV{BACKEND_URL}; $r=$ENV{REDIRECT_URI}; }
      s{(key\s*=\s*"KRD_CLIENT_ID"\s*\n\s*value\s*=\s*")[^"]*("\s*\n\s*isEnabled)}{$1$c$2}g;
      s{(key\s*=\s*"KRD_BACKEND_URL"\s*\n\s*value\s*=\s*")[^"]*("\s*\n\s*isEnabled)}{$1$b$2}g;
      s{(key\s*=\s*"KRD_REDIRECT_URI"\s*\n\s*value\s*=\s*")[^"]*("\s*\n\s*isEnabled)}{$1$r$2}g;
    ' "$IOS_SCHEME"
    fi

    # Scheme env vars only apply when Xcode launches the app. Patch the Config.swift
    # defaults too so icon-tap / devicectl launches use the real values on device.
    IOS_CONFIG="$ROOT_DIR/ios/demo-krdpass-auth/Config.swift"
    if [[ -f "$IOS_CONFIG" ]]; then
      info "patching Config.swift defaults (backendUrl / redirectUri / clientId)"
      CLIENT_ID="$CLIENT_ID" BACKEND_URL="$BACKEND_URL" REDIRECT_URI="$REDIRECT_URI" perl -0777 -i -pe '
      BEGIN { $c=$ENV{CLIENT_ID}; $b=$ENV{BACKEND_URL}; $r=$ENV{REDIRECT_URI}; }
      s{(env\("KRD_BACKEND_URL", default: ")[^"]*("\))}{$1$b$2};
      s{("KRD_REDIRECT_URI", default: ")[^"]*("\))}{$1$r$2};
      s{(env\("KRD_CLIENT_ID", default: ")[^"]*("\))}{$1$c$2};
    ' "$IOS_CONFIG"
    fi
  fi

  RN_APP_JSON="$ROOT_DIR/react-native/app.json"
  patch_rn_app_json "$RN_APP_JSON" "$DOMAIN_LINE" "$DEMO_ANDROID_PACKAGE_NAME" "$DEMO_IOS_BUNDLE_ID" "${DEMO_IOS_TEAM_ID:-}" "$TARGET_ANDROID" "$TARGET_IOS"
else
  info "skipping tracked file patching (set PATCH_TRACKED_DEMO_FILES=false or pass --no-patch-tracked)"
fi

chmod 600 "$ROOT_DIR/server/.env" 2>/dev/null || true
chmod 600 "$SECRETS_FILE" 2>/dev/null || true

echo ""
info "sync completed"
if [[ "$TARGET_ANDROID" == "true" ]]; then
  echo "  Android package: $DEMO_ANDROID_PACKAGE_NAME"
  echo "  Android SHA256:  $DEMO_ANDROID_SHA256"
  echo "  Android keystore: $ANDROID_KEYSTORE_PATH_FINAL"
  echo "  Add this fingerprint to CAS allow list for $DEMO_ANDROID_PACKAGE_NAME"
fi
if [[ "$TARGET_IOS" == "true" ]]; then
  echo "  iOS bundle id: $DEMO_IOS_BUNDLE_ID"
  if [[ -n "${DEMO_IOS_TEAM_ID:-}" ]]; then
    echo "  iOS team id:   $DEMO_IOS_TEAM_ID"
  else
    echo "  iOS team id:   (not set; set DEMO_IOS_TEAM_ID for device signing + AASA appID)"
  fi
fi
echo ""

info "done"
