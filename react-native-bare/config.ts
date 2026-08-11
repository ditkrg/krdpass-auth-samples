import Config from 'react-native-config';
import type { KrdpassEnvironment } from 'krdpass-auth-react-native';

/**
 * The values shipped in `.env.example`. They exist so the file has a shape to
 * copy, never so the app can run against them: `your-backend.example.com` does
 * not resolve, and the failure would surface as a network error three screens
 * later instead of as the config mistake it is.
 */
const PLACEHOLDERS = new Set([
  'your-client-id',
  'https://your-backend.example.com',
  'https://your-backend.example.com/_krdpass/oauth/callback',
]);

function requireConfig(name: keyof typeof Config): string {
  const value = Config[name]?.trim();
  if (!value || PLACEHOLDERS.has(value)) {
    throw new Error(
      `KRDPASS demo config missing: ${name}. ` +
        'Copy react-native-bare/.env.example to react-native-bare/.env and fill it in, ' +
        'or run ./scripts/sync-secrets.sh from the repository root.',
    );
  }
  return value;
}

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export const BACKEND_URL = trimTrailingSlashes(requireConfig('BACKEND_URL'));

export const CLIENT_ID = requireConfig('CLIENT_ID');

// A redirect URI left at its placeholder counts as unset, so it falls back to
// the path under the backend URL that was just validated rather than sending
// the sign-in at your-backend.example.com.
const redirectOverride = Config.REDIRECT_URI?.trim();

export const REDIRECT_URI =
  redirectOverride && !PLACEHOLDERS.has(redirectOverride)
    ? redirectOverride
    : `${BACKEND_URL}/_krdpass/oauth/callback`;

const environment = requireConfig('KRD_ENVIRONMENT');
if (environment !== 'development' && environment !== 'production') {
  throw new Error('KRD_ENVIRONMENT must be development or production.');
}

export const ENVIRONMENT: KrdpassEnvironment = environment;
