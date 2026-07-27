import Config from 'react-native-config';
import type { KrdpassEnvironment } from 'krdpass-auth-react-native';

function requireConfig(name: keyof typeof Config): string {
  const value = Config[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Run the shared secrets sync first.`,
    );
  }
  return value;
}

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export const BACKEND_URL = trimTrailingSlashes(
  requireConfig('BACKEND_URL'),
);

export const CLIENT_ID = requireConfig('CLIENT_ID');

export const REDIRECT_URI =
  Config.REDIRECT_URI?.trim() ||
  `${BACKEND_URL}/_krdpass/oauth/callback`;

const environment = requireConfig('KRD_ENVIRONMENT');
if (environment !== 'development' && environment !== 'production') {
  throw new Error('KRD_ENVIRONMENT must be development or production.');
}

export const ENVIRONMENT: KrdpassEnvironment = environment;
