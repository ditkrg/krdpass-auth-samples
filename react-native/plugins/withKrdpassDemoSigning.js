const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// KRDPASS shared demo signing';
const defaultDebugSigning = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

function withKrdpassDemoSigning(config) {
  return withAppBuildGradle(config, (buildGradleConfig) => {
    const contents = buildGradleConfig.modResults.contents;
    if (contents.includes(marker)) {
      return buildGradleConfig;
    }

    if (!contents.includes(defaultDebugSigning)) {
      throw new Error(
        'Unable to configure KRDPASS demo signing: Expo Android signing template changed.',
      );
    }

    const signingConfig = `    ${marker}
    // sync-secrets.sh writes this ignored file from the shared registered demo key.
    // A normal clone still builds with Expo's default debug key when it is absent.
    def krdpassDemoKeyPropertiesFile = rootProject.file('key.properties')
    def krdpassDemoKeyProperties = new Properties()
    if (krdpassDemoKeyPropertiesFile.exists()) {
        krdpassDemoKeyProperties.load(new FileInputStream(krdpassDemoKeyPropertiesFile))
    }

    signingConfigs {
        debug {
            if (krdpassDemoKeyPropertiesFile.exists()) {
                storeFile file(krdpassDemoKeyProperties['storeFile'])
                storePassword krdpassDemoKeyProperties['storePassword']
                keyAlias krdpassDemoKeyProperties['keyAlias']
                keyPassword krdpassDemoKeyProperties['keyPassword']
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`;

    buildGradleConfig.modResults.contents = contents.replace(
      defaultDebugSigning,
      signingConfig,
    );
    return buildGradleConfig;
  });
}

module.exports = withKrdpassDemoSigning;
