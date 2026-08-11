// Demo-only app-link documents: /.well-known/apple-app-site-association (iOS
// Universal Links) and /.well-known/assetlinks.json (Android App Links). They
// are static once configured, so this module returns the payloads and
// server.js owns the routing.
const parseCommaList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const resolveIosAppIds = () => {
  const fromMulti = parseCommaList(process.env.DEMO_IOS_APP_IDS);
  if (fromMulti.length > 0) {
    return fromMulti;
  }

  const teamId = process.env.DEMO_IOS_TEAM_ID;
  const bundleId = process.env.DEMO_IOS_BUNDLE_ID;
  if (teamId && bundleId) {
    return [`${teamId}.${bundleId}`];
  }

  return [];
};

const resolveAndroidTargets = () => {
  const multiTargets = parseCommaList(process.env.DEMO_ANDROID_APP_LINKS)
    .map((entry) => {
      const [packageName, fingerprint] = entry.split('|').map((part) => part?.trim());
      if (!packageName || !fingerprint) return null;
      return { packageName, fingerprint };
    })
    .filter(Boolean);

  if (multiTargets.length > 0) {
    return multiTargets;
  }

  const androidPackage = process.env.DEMO_ANDROID_PACKAGE_NAME;
  const androidFingerprint = process.env.DEMO_ANDROID_SHA256;
  if (androidPackage && androidFingerprint) {
    return [{ packageName: androidPackage, fingerprint: androidFingerprint }];
  }

  return [];
};

// Returns { path: jsonPayload } for the app-link documents this process is
// configured to serve. An unconfigured platform contributes no route at all.
export const resolveExtrasRoutes = () => {
  const routes = {};

  const iosAppIds = resolveIosAppIds();
  if (iosAppIds.length > 0) {
    routes['/.well-known/apple-app-site-association'] = {
      applinks: {
        details: iosAppIds.map((appId) => ({
          appID: appId,
          paths: ['/_krdpass/oauth/callback'],
        })),
      },
    };
  }

  const androidTargets = resolveAndroidTargets();
  if (androidTargets.length > 0) {
    routes['/.well-known/assetlinks.json'] = androidTargets.map(({ packageName, fingerprint }) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint],
      },
    }));
  }

  return routes;
};
