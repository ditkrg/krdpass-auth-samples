// -------------------------------------------------------------
// Demo-only extra endpoints for app links
// -------------------------------------------------------------

// GET /.well-known/apple-app-site-association - iOS Universal Links
// GET /.well-known/assetlinks.json - Android App Links
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

function setupExtrasRoutes(app) {
    const iosAppIds = resolveIosAppIds();
    
    // iOS AASA
    if (iosAppIds.length > 0) {
        app.get('/.well-known/apple-app-site-association', (_, res) => {
            const aasa = {
                applinks: {
                    details: iosAppIds.map((appId) => ({
                        appID: appId,
                        paths: ['/_krdpass/oauth/callback']
                    }))
                }
            };
            res.set('Content-Type', 'application/json');
            res.json(aasa);
        });
    }

    // Android Asset Links
    const androidTargets = resolveAndroidTargets();

    if (androidTargets.length > 0) {
        app.get('/.well-known/assetlinks.json', (_, res) => {
            const assetLinks = androidTargets.map(({ packageName, fingerprint }) => ({
                relation: ["delegate_permission/common.handle_all_urls"],
                target: {
                    namespace: "android_app",
                    package_name: packageName,
                    sha256_cert_fingerprints: [fingerprint]
                }
            }));
            res.set('Content-Type', 'application/json');
            res.json(assetLinks);
        });
    }
}

export { setupExtrasRoutes };
