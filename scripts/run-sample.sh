#!/usr/bin/env bash
set -euo pipefail

# CocoaPods requires a UTF-8 locale. Without one, `pod install` fails inside its
# own error reporter with `Encoding::CompatibilityError`, which hides the real
# error and is very hard to diagnose.
if [[ "${LC_ALL:-${LANG:-}}" != *[Uu][Tt][Ff]*8* ]]; then
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

APP=""
PLATFORM=""
DEVICE=""
DO_SYNC="false"
SYNC_PATCH_TRACKED="false"
SECRETS_FILE=""
INSTALL_DEPS="true"
RN_START_DEV_SERVER="true"

usage() {
  cat <<USAGE
Usage: ./scripts/run-sample.sh --app <name> [options]

Run KRDPASS sample apps from one script.

Required:
  --app <name>            One of: server, flutter, android, ios, react-native, react-native-bare
                          (android-native / ios-native still supported as aliases)

Options:
  --platform <name>       Required for flutter/react-native/react-native-bare: android | ios
  --device <id-or-name>   Device target for flutter/ios/React Native iOS apps
                           (if omitted for flutter, script auto-selects matching platform device)
                           (if omitted for iOS native/React Native apps, script prefers connected iPhone)
  --sync                  Run sync-secrets before launching app
  --sync-patch-tracked    Use --patch-tracked while syncing
  --secrets-file <path>   Secrets file for sync (default: shared/secrets/.env)
  --no-install            Skip dependency install steps (npm install / flutter pub get)
  --no-dev-server         For Expo React Native iOS: skip starting Expo dev server after install
  -h, --help              Show this help

Examples:
  ./scripts/run-sample.sh --app server
  ./scripts/run-sample.sh --app flutter --platform android --sync
  ./scripts/run-sample.sh --app flutter --platform ios --device "My iPhone" --sync
  ./scripts/run-sample.sh --app android --sync
  ./scripts/run-sample.sh --app ios
  ./scripts/run-sample.sh --app react-native --platform ios --device "My iPhone" --sync
  ./scripts/run-sample.sh --app react-native-bare --platform android --sync
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "[run-sample] $*" >&2
}

require_command() {
  local bin="$1"
  command -v "$bin" >/dev/null 2>&1 || die "missing required command '$bin' in PATH"
}

publish_local_android_sdk() {
  local android_core_sdk_dir="$1"
  local local_maven_repo="$2"
  local gradlew="$android_core_sdk_dir/gradlew"

  [[ -x "$gradlew" ]] || die "local Android core SDK has no executable Gradle wrapper: $gradlew"
  info "publishing local Android core SDK to: $local_maven_repo"
  (
    cd "$android_core_sdk_dir"
    ./gradlew :library:publishMavenPublicationToLocalDevelopmentRepository \
      "-PkrdpassLocalMavenRepo=$local_maven_repo"
  )
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || die "--app requires a value"
      APP="$2"
      shift 2
      ;;
    --platform)
      [[ $# -ge 2 ]] || die "--platform requires a value"
      PLATFORM="$2"
      shift 2
      ;;
    --device)
      [[ $# -ge 2 ]] || die "--device requires a value"
      DEVICE="$2"
      shift 2
      ;;
    --sync)
      DO_SYNC="true"
      shift
      ;;
    --sync-patch-tracked)
      DO_SYNC="true"
      SYNC_PATCH_TRACKED="true"
      shift
      ;;
    --secrets-file)
      [[ $# -ge 2 ]] || die "--secrets-file requires a path"
      SECRETS_FILE="$2"
      shift 2
      ;;
    --no-install)
      INSTALL_DEPS="false"
      shift
      ;;
    --no-dev-server)
      RN_START_DEV_SERVER="false"
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

[[ -n "$APP" ]] || die "--app is required"

case "$APP" in
  android) APP="android-native" ;;
  ios) APP="ios-native" ;;
esac

is_simulator_udid() {
  local maybe_id="$1"
  [[ -n "$maybe_id" ]] || return 1
  xcrun simctl list devices available --json | node -e '
    const fs = require("fs");
    const needle = String(process.argv[1] || "").toLowerCase();
    if (!needle) process.exit(1);
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    const devicesByRuntime = data.devices || {};
    for (const runtime of Object.keys(devicesByRuntime)) {
      for (const d of devicesByRuntime[runtime] || []) {
        const available = d && d.isAvailable !== false;
        if (!available) continue;
        if (String(d.udid || "").toLowerCase() === needle) {
          process.exit(0);
        }
      }
    }
    process.exit(1);
  ' "$maybe_id"
}

resolve_simulator_udid() {
  local query="$1"
  xcrun simctl list devices available --json | node -e '
    const fs = require("fs");
    const query = String(process.argv[1] || "").trim().toLowerCase();
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    const devicesByRuntime = data.devices || {};

    const all = [];
    for (const runtime of Object.keys(devicesByRuntime)) {
      for (const d of devicesByRuntime[runtime] || []) {
        if (!d || d.isAvailable === false) continue;
        all.push({ ...d, runtime });
      }
    }

    const byUdid = (id) =>
      all.find((d) => String(d.udid || "").toLowerCase() === String(id || "").toLowerCase());
    const byNameContains = (needle) =>
      all.find((d) => String(d.name || "").toLowerCase().includes(needle));

    let chosen = null;
    if (query) {
      chosen = byUdid(query) || byNameContains(query);
      if (!chosen) {
        process.stdout.write("");
        process.exit(0);
      }
      process.stdout.write(String(chosen.udid || ""));
      process.exit(0);
    }

    const booted = all.find((d) => String(d.state || "").toLowerCase() === "booted");
    const bootedIPhone = all.find(
      (d) =>
        String(d.state || "").toLowerCase() === "booted" &&
        String(d.name || "").toLowerCase().includes("iphone")
    );
    const anyIPhone = all.find((d) => String(d.name || "").toLowerCase().includes("iphone"));
    chosen = bootedIPhone || booted || anyIPhone || all[0] || null;
    process.stdout.write(String(chosen?.udid || ""));
  ' "$query"
}

resolve_physical_ios_device() {
  local query="$1"
  xcrun xcdevice list | node -e '
    const fs = require("fs");
    const query = String(process.argv[1] || "").trim().toLowerCase();
    const raw = fs.readFileSync(0, "utf8");
    let devices = [];
    try {
      devices = JSON.parse(raw);
    } catch {
      process.stdout.write("");
      process.exit(0);
    }

    const iosPhysical = devices.filter((d) => {
      if (!d) return false;
      if (d.simulator === true) return false;
      if (d.available === false) return false;
      const platform = String(d.platform || "").toLowerCase();
      return platform.includes("iphoneos") || platform.includes("ios");
    });

    const exactById = (needle) =>
      iosPhysical.find(
        (d) => String(d.identifier || "").toLowerCase() === String(needle || "").toLowerCase()
      );
    const exactByName = (needle) =>
      iosPhysical.find(
        (d) => String(d.name || "").toLowerCase() === String(needle || "").toLowerCase()
      );
    const containsByName = (needle) =>
      iosPhysical.find((d) => String(d.name || "").toLowerCase().includes(String(needle || "")));

    let chosen = null;
    if (query) {
      chosen = exactById(query) || exactByName(query) || containsByName(query);
    } else {
      const usbIPhone = iosPhysical.find((d) => {
        const iface = String(d.interface || "").toLowerCase();
        const name = String(d.name || "").toLowerCase();
        return iface === "usb" && name.includes("iphone");
      });
      const anyIPhone = iosPhysical.find((d) => String(d.name || "").toLowerCase().includes("iphone"));
      chosen = usbIPhone || anyIPhone || iosPhysical[0] || null;
    }

    process.stdout.write(String(chosen?.identifier || ""));
  ' "$query"
}

detect_android_package() {
  local gradle_file="$1"
  perl -ne '
    if (/applicationId\s*=\s*"([^"]+)"/) { print $1; exit 0; }
    if (/applicationId\s+\x27([^\x27]+)\x27/) { print $1; exit 0; }
  ' "$gradle_file"
}

detect_android_install_task() {
  local gradle_projects_output=""
  gradle_projects_output="$(./gradlew projects --console=plain 2>/dev/null)" || true

  local candidate=""
  candidate="$(printf "%s" "$gradle_projects_output" | sed -n "s/.*Project '\\(:[^']*app\\)'.*/\\1/p" | head -1)"

  if [[ -n "$candidate" ]]; then
    printf "%s:installDebug" "$candidate"
    return 0
  fi

  if ./gradlew -q :app:help >/dev/null 2>&1; then
    printf "%s" ":app:installDebug"
    return 0
  fi

  printf "%s" "installDebug"
}

detect_ios_bundle_id() {
  local pbxproj="$1"
  perl -ne '
    if (/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/) {
      my $v = $1;
      $v =~ s/\s+//g;
      next if $v =~ /RunnerTests$/;
      print $v;
      exit 0;
    }
  ' "$pbxproj"
}

read_ios_scheme_env_value() {
  local scheme_file="$1"
  local key="$2"
  [[ -f "$scheme_file" ]] || {
    printf "%s" ""
    return 0
  }
  IOS_SCHEME_KEY="$key" perl -0777 -ne '
    my $k = $ENV{IOS_SCHEME_KEY};
    if (/<EnvironmentVariable\b(?=[^>]*\bkey\s*=\s*"\Q$k\E")(?=[^>]*\bisEnabled\s*=\s*"YES")[^>]*\bvalue\s*=\s*"([^"]*)"/s) {
      print $1;
      exit 0;
    }
  ' "$scheme_file"
}

is_metro_running() {
  local port="${1:-8081}"
  command -v curl >/dev/null 2>&1 || return 1
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/status" 2>/dev/null | grep -q "packager-status:running"
}

stop_sample_metro_on_port() {
  local port="${1:-8081}"

  command -v lsof >/dev/null 2>&1 || return 0
  local pids=""
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  [[ -n "$pids" ]] || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    local proc_cmd=""
    proc_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$proc_cmd" == *"$ROOT_DIR/react-native/"* || "$proc_cmd" == *"$ROOT_DIR/react-native-bare/"* ]]; then
      info "stopping existing sample Metro process on :${port} (pid=$pid)"
      kill "$pid" 2>/dev/null || true
    fi
  done <<< "$pids"
}

resolve_flutter_device_id_for_platform() {
  local platform="$1"
  local devices_json=""
  local target_prefix=""

  case "$platform" in
    android) target_prefix="android" ;;
    ios) target_prefix="ios" ;;
    *) die "unsupported flutter platform '$platform'" ;;
  esac

  devices_json="$(flutter devices --machine)" || die "failed to list flutter devices"

  local selected_id=""
  selected_id="$(printf "%s" "$devices_json" | node -e '
    const fs = require("fs");
    const targetPrefix = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    let devices = [];
    try {
      devices = JSON.parse(raw);
    } catch {
      process.stdout.write("");
      process.exit(0);
    }
    const supported = devices.filter((d) => d && d.isSupported !== false);
    const exact = supported.find((d) => String(d.targetPlatform || "").toLowerCase() === targetPrefix);
    const prefix = supported.find((d) => String(d.targetPlatform || "").toLowerCase().startsWith(targetPrefix));
    const chosen = exact || prefix;
    process.stdout.write(chosen?.id || "");
  ' "$target_prefix")"

  [[ -n "$selected_id" ]] || die "no Flutter device found for platform '$platform' (run 'flutter devices')"
  printf "%s" "$selected_id"
}

run_sync_for_target() {
  local sync_target="$1"
  local sync_cmd=("$ROOT_DIR/scripts/sync-secrets.sh" "--platform" "$sync_target")

  if [[ -n "$SECRETS_FILE" ]]; then
    sync_cmd+=("--secrets-file" "$SECRETS_FILE")
  fi

  if [[ "$SYNC_PATCH_TRACKED" == "true" ]]; then
    sync_cmd+=("--patch-tracked")
  fi

  info "running sync: ${sync_cmd[*]}"
  "${sync_cmd[@]}"
}

run_server() {
  require_command npm
  local dir="$ROOT_DIR/server"
  cd "$dir"

  if [[ "$INSTALL_DEPS" == "true" ]] && [[ ! -d node_modules ]]; then
    info "installing server dependencies (npm install)"
    npm install
  fi

  info "starting server"
  npm start
}

run_flutter() {
  require_command flutter
  require_command node
  [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "flutter requires --platform android|ios"

  local dir="$ROOT_DIR/flutter"
  cd "$dir"

  if [[ "$INSTALL_DEPS" == "true" ]]; then
    info "running flutter pub get"
    flutter pub get
  fi

  local selected_device="$DEVICE"
  if [[ -z "$selected_device" ]]; then
    selected_device="$(resolve_flutter_device_id_for_platform "$PLATFORM")"
    info "auto-selected flutter $PLATFORM device: $selected_device"
  fi

  local cmd=(flutter run -d "$selected_device")

  info "running: ${cmd[*]}"
  if [[ "$PLATFORM" == "android" ]]; then
    local android_core_sdk_dir="${ORG_GRADLE_PROJECT_krdpassSdkDir:-$ROOT_DIR/../krdpass-auth-sdk-android}"
    if [[ -d "$android_core_sdk_dir" ]]; then
      info "using local Android core SDK: $android_core_sdk_dir"
      ORG_GRADLE_PROJECT_krdpassSdkDir="$android_core_sdk_dir" "${cmd[@]}"
      return
    fi
  fi
  "${cmd[@]}"
}

run_android_native() {
  require_command adb
  local dir="$ROOT_DIR/android"
  cd "$dir"

  local android_core_sdk_dir="${ORG_GRADLE_PROJECT_krdpassSdkDir:-$ROOT_DIR/../krdpass-auth-sdk-android}"
  if [[ -d "$android_core_sdk_dir" ]]; then
    info "using local Android core SDK: $android_core_sdk_dir"
    export ORG_GRADLE_PROJECT_krdpassSdkDir="$android_core_sdk_dir"
  fi

  local install_task=""
  install_task="$(detect_android_install_task)"
  info "installing debug APK via task: $install_task"
  ./gradlew "$install_task"

  local package_name
  package_name="$(detect_android_package "$dir/app/build.gradle.kts")"
  [[ -n "$package_name" ]] || package_name="krd.pass.auth.demo"

  info "launching package: $package_name"
  adb shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1 >/dev/null
}

run_ios_native() {
  require_command xcodebuild
  require_command xcrun
  require_command node

  local dir="$ROOT_DIR/ios"
  local project="$dir/demo-krdpass-auth.xcodeproj"
  local scheme="demo-krdpass-auth"
  local scheme_file="$project/xcshareddata/xcschemes/$scheme.xcscheme"
  local pbxproj="$project/project.pbxproj"
  local bundle_id
  bundle_id="$(detect_ios_bundle_id "$pbxproj")"
  [[ -n "$bundle_id" ]] || bundle_id="krd.pass.auth.demo"

  local derived_data="$dir/build/run-sample-derived"
  mkdir -p "$derived_data"
  local ios_app_name="demo-krdpass-auth.app"

  local use_simulator="true"
  local destination=""
  local sim_udid=""
  local physical_device_id=""
  local ios_device_ref=""
  local env_client_id=""
  local env_backend_url=""
  local env_redirect_uri=""
  local env_environment=""
  local launch_env_json=""

  env_client_id="${KRD_CLIENT_ID:-$(read_ios_scheme_env_value "$scheme_file" "KRD_CLIENT_ID")}"
  env_backend_url="${KRD_BACKEND_URL:-$(read_ios_scheme_env_value "$scheme_file" "KRD_BACKEND_URL")}"
  env_redirect_uri="${KRD_REDIRECT_URI:-$(read_ios_scheme_env_value "$scheme_file" "KRD_REDIRECT_URI")}"
  env_environment="${KRD_ENVIRONMENT:-$(read_ios_scheme_env_value "$scheme_file" "KRD_ENVIRONMENT")}"
  [[ -n "$env_environment" ]] || env_environment="development"

  [[ -n "$env_client_id" ]] || die "missing KRD_CLIENT_ID for iOS launch (set env var or update $scheme_file)"
  [[ -n "$env_backend_url" ]] || die "missing KRD_BACKEND_URL for iOS launch (set env var or update $scheme_file)"
  [[ -n "$env_redirect_uri" ]] || die "missing KRD_REDIRECT_URI for iOS launch (set env var or update $scheme_file)"

  launch_env_json="$(node -e '
    const [clientId, backendUrl, redirectUri, environment] = process.argv.slice(1);
    const env = {
      KRD_CLIENT_ID: clientId,
      KRD_BACKEND_URL: backendUrl,
      KRD_REDIRECT_URI: redirectUri,
      KRD_ENVIRONMENT: environment
    };
    process.stdout.write(JSON.stringify(env));
  ' "$env_client_id" "$env_backend_url" "$env_redirect_uri" "$env_environment")"

  if [[ -n "$DEVICE" ]]; then
    if is_simulator_udid "$DEVICE"; then
      sim_udid="$DEVICE"
      destination="id=$sim_udid"
      ios_device_ref="$sim_udid"
    else
      physical_device_id="$(resolve_physical_ios_device "$DEVICE")"
      if [[ -n "$physical_device_id" ]]; then
        use_simulator="false"
        destination="id=$physical_device_id"
        ios_device_ref="$physical_device_id"
      elif [[ "$DEVICE" =~ ^[A-Fa-f0-9-]{16,}$ ]]; then
        use_simulator="false"
        destination="id=$DEVICE"
        ios_device_ref="$DEVICE"
      else
        sim_udid="$(resolve_simulator_udid "$DEVICE")"
        [[ -n "$sim_udid" ]] || die "could not resolve iOS device or simulator for '$DEVICE'"
        destination="id=$sim_udid"
        ios_device_ref="$sim_udid"
      fi
    fi
  else
    physical_device_id="$(resolve_physical_ios_device "")"
    if [[ -n "$physical_device_id" ]]; then
      use_simulator="false"
      destination="id=$physical_device_id"
      ios_device_ref="$physical_device_id"
      info "auto-selected physical iOS device: $physical_device_id"
    else
      sim_udid="$(resolve_simulator_udid "")"
      [[ -n "$sim_udid" ]] || die "no available iOS simulator found"
      destination="id=$sim_udid"
      ios_device_ref="$sim_udid"
      info "no physical iOS device detected; using simulator: $sim_udid"
    fi
  fi

  info "building iOS native sample (destination: $destination)"
  xcodebuild \
    -project "$project" \
    -scheme "$scheme" \
    -configuration Debug \
    -derivedDataPath "$derived_data" \
    -destination "$destination" \
    build

  if [[ "$use_simulator" == "true" ]]; then
    [[ -n "$sim_udid" ]] || sim_udid="$(resolve_simulator_udid "$DEVICE")"
    xcrun simctl boot "$sim_udid" >/dev/null 2>&1 || true

    local app_path
    local sim_products_dir="$derived_data/Build/Products/Debug-iphonesimulator"
    app_path="$derived_data/Build/Products/Debug-iphonesimulator/$ios_app_name"
    if [[ ! -d "$app_path" ]]; then
      if [[ -d "$sim_products_dir" ]]; then
        app_path="$(find "$sim_products_dir" -maxdepth 2 -type d -name "$ios_app_name" | head -1)"
      else
        app_path=""
      fi
    fi
    [[ -n "$app_path" ]] || die "could not locate built .app in $derived_data"

    info "installing app on simulator $sim_udid"
    xcrun simctl install "$sim_udid" "$app_path"

    info "launching app ($bundle_id) on simulator $sim_udid"
    SIMCTL_CHILD_KRD_CLIENT_ID="$env_client_id" \
    SIMCTL_CHILD_KRD_BACKEND_URL="$env_backend_url" \
    SIMCTL_CHILD_KRD_REDIRECT_URI="$env_redirect_uri" \
    SIMCTL_CHILD_KRD_ENVIRONMENT="$env_environment" \
      xcrun simctl launch "$sim_udid" "$bundle_id"
  else
    if xcrun devicectl --help >/dev/null 2>&1; then
      local app_path
      local device_products_dir="$derived_data/Build/Products/Debug-iphoneos"
      app_path="$derived_data/Build/Products/Debug-iphoneos/$ios_app_name"
      if [[ ! -d "$app_path" ]]; then
        if [[ -d "$device_products_dir" ]]; then
          app_path="$(find "$device_products_dir" -maxdepth 2 -type d -name "$ios_app_name" | head -1)"
        else
          app_path=""
        fi
      fi
      if [[ -n "$app_path" ]]; then
        info "using iOS device app bundle: $app_path"
        info "installing app on iOS device $ios_device_ref"
        xcrun devicectl device install app --device "$ios_device_ref" "$app_path"
        info "launching app ($bundle_id) on iOS device $ios_device_ref"
        xcrun devicectl device process launch \
          --device "$ios_device_ref" \
          --environment-variables "$launch_env_json" \
          --terminate-existing \
          "$bundle_id"
      else
        info "build succeeded but .app path not found for install"
      fi
    else
      info "built for device id=$ios_device_ref. Install/launch with Xcode or devicectl."
    fi
  fi
}

run_react_native() {
  require_command npx
  [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "react-native requires --platform android|ios"

  local dir="$ROOT_DIR/react-native"
  cd "$dir"

  if [[ "$INSTALL_DEPS" == "true" ]] && [[ ! -d node_modules ]]; then
    info "installing React Native example dependencies (npm install)"
    npm install
  fi

  local selected_device="$DEVICE"
  if [[ "$PLATFORM" == "ios" && -z "$selected_device" ]]; then
    selected_device="$(resolve_physical_ios_device "")"
    if [[ -n "$selected_device" ]]; then
      info "auto-selected physical iOS device for React Native: $selected_device"
    else
      info "no physical iOS device detected for React Native; Expo will choose a simulator/device"
    fi
  fi

  if [[ "$PLATFORM" == "ios" ]]; then
    stop_sample_metro_on_port "8081"
    sleep 1
  else
    # React Native autolinking caches absolute paths. Regenerate it in case the
    # repository has moved since the previous Android build.
    local autolinking_cache="$dir/android/build/generated/autolinking"
    if [[ -d "$autolinking_cache" ]]; then
      info "removing generated Android autolinking cache"
      rm -rf -- "$autolinking_cache"
    fi
  fi

  local cmd=(npx expo "run:$PLATFORM")
  if [[ "$PLATFORM" == "ios" && -n "$selected_device" ]]; then
    cmd+=("--device" "$selected_device")
    cmd+=("--configuration" "Debug")
    cmd+=("--port" "8081")
  fi

  info "running: ${cmd[*]}"
  if [[ "$PLATFORM" == "android" ]]; then
    local android_core_sdk_dir="${ORG_GRADLE_PROJECT_krdpassSdkDir:-$ROOT_DIR/../krdpass-auth-sdk-android}"
    if [[ -d "$android_core_sdk_dir" ]]; then
      info "using local Android core SDK: $android_core_sdk_dir"
      local local_maven_repo="${ORG_GRADLE_PROJECT_krdpassLocalMavenRepo:-$android_core_sdk_dir/build/local-maven}"
      publish_local_android_sdk "$android_core_sdk_dir" "$local_maven_repo"
      ORG_GRADLE_PROJECT_krdpassLocalMavenRepo="$local_maven_repo" env -u CI "${cmd[@]}"
      return
    fi
  fi
  env -u CI "${cmd[@]}"

  if [[ "$PLATFORM" == "ios" ]]; then
    if [[ "$RN_START_DEV_SERVER" != "true" ]]; then
      info "skipping Expo dev server (--no-dev-server)"
      return 0
    fi

    if is_metro_running "8081"; then
      info "Expo/Metro dev server is already running on http://127.0.0.1:8081"
    else
      info "starting Expo dev server for iOS dev client (tunnel)"
      env -u CI npx expo start --dev-client --tunnel --port 8081
    fi
  fi
}

run_react_native_bare() {
  require_command npx
  [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "react-native-bare requires --platform android|ios"

  local dir="$ROOT_DIR/react-native-bare"
  cd "$dir"

  if [[ "$INSTALL_DEPS" == "true" ]] && [[ ! -d node_modules ]]; then
    info "installing bare React Native example dependencies (npm install)"
    npm install
  fi

  local selected_device="$DEVICE"
  if [[ "$PLATFORM" == "ios" ]]; then
    stop_sample_metro_on_port "8081"
    sleep 1
    if [[ -z "$selected_device" ]]; then
      selected_device="$(resolve_physical_ios_device "")"
    fi
    if [[ -n "$selected_device" ]]; then
      info "using bare React Native iOS device: $selected_device"
    fi
    local hermes_podspec="$dir/ios/Pods/Local Podspecs/hermes-engine.podspec.json"
    if [[ -f "$hermes_podspec" ]] &&
      ! grep -qF "$dir/node_modules/hermes-compiler" "$hermes_podspec"; then
      info "removing stale iOS Pods cache"
      rm -rf -- "$dir/ios/Pods" "$dir/ios/build/generated"
    fi
  else
    # React Native autolinking caches absolute paths. Regenerate it in case the
    # repository has moved since the previous Android build.
    local autolinking_cache="$dir/android/build/generated/autolinking"
    if [[ -d "$autolinking_cache" ]]; then
      info "removing generated Android autolinking cache"
      rm -rf -- "$autolinking_cache"
    fi
  fi

  local cmd=(npx react-native "run-$PLATFORM")
  if [[ "$PLATFORM" == "ios" && "$INSTALL_DEPS" == "true" ]]; then
    cmd+=(--force-pods)
  fi
  if [[ "$PLATFORM" == "ios" && -n "$selected_device" ]]; then
    cmd+=(--device "$selected_device")
  fi

  info "running: ${cmd[*]}"
  if [[ "$PLATFORM" == "android" ]]; then
    local android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    [[ -d "$android_sdk" ]] || die "Android SDK not found; set ANDROID_HOME or ANDROID_SDK_ROOT"
    local android_core_sdk_dir="${ORG_GRADLE_PROJECT_krdpassSdkDir:-$ROOT_DIR/../krdpass-auth-sdk-android}"
    if [[ -d "$android_core_sdk_dir" ]]; then
      info "using local Android core SDK: $android_core_sdk_dir"
      local local_maven_repo="${ORG_GRADLE_PROJECT_krdpassLocalMavenRepo:-$android_core_sdk_dir/build/local-maven}"
      publish_local_android_sdk "$android_core_sdk_dir" "$local_maven_repo"
      ANDROID_HOME="$android_sdk" \
      ANDROID_SDK_ROOT="$android_sdk" \
      ORG_GRADLE_PROJECT_krdpassLocalMavenRepo="$local_maven_repo" \
        env -u CI "${cmd[@]}"
    else
      ANDROID_HOME="$android_sdk" ANDROID_SDK_ROOT="$android_sdk" env -u CI "${cmd[@]}"
    fi
  else
    env -u CI "${cmd[@]}"
  fi
}

case "$APP" in
  server)
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "all"
    fi
    run_server
    ;;
  flutter)
    [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "flutter requires --platform android|ios"
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "$PLATFORM"
    fi
    run_flutter
    ;;
  android-native)
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "android"
    fi
    run_android_native
    ;;
  ios-native)
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "ios"
    fi
    run_ios_native
    ;;
  react-native)
    [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "react-native requires --platform android|ios"
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "$PLATFORM"
    fi
    run_react_native
    ;;
  react-native-bare)
    [[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "react-native-bare requires --platform android|ios"
    if [[ "$DO_SYNC" == "true" ]]; then
      run_sync_for_target "$PLATFORM"
    fi
    run_react_native_bare
    ;;
  *)
    die "invalid --app '$APP'"
    ;;
esac
