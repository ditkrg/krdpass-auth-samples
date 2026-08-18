import type { KrdpassEnvironment } from 'krdpass-auth-react-native';

/**
 * Every read of `process.env` below has to be a literal
 * `process.env.EXPO_PUBLIC_*` property access.
 *
 * babel-preset-expo inlines `EXPO_PUBLIC_*` values at build time by rewriting
 * the literal property accesses it can see in the source. A computed lookup
 * (`process.env[name]`) is invisible to that transform, so it survives into the
 * bundle and is evaluated at runtime, where `@expo/metro-config` only populates
 * `process.env` when `options.dev` is true. The result is a module that works in
 * development and throws during module evaluation in every release build, taking
 * the app to a white screen before the first render.
 *
 * So: no helper that takes a variable name, no loop over a list of keys, no
 * destructuring of `process.env`. Spell each one out.
 */

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

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || PLACEHOLDERS.has(trimmed)) {
    throw new Error(
      `KRDPASS demo config missing: ${name}. ` +
        'Copy react-native/.env.example to react-native/.env and fill it in, ' +
        'or run ./scripts/sync-secrets.sh from the repository root.',
    );
  }
  return trimmed;
}

export const BACKEND_URL = required(
  'EXPO_PUBLIC_BACKEND_URL',
  process.env.EXPO_PUBLIC_BACKEND_URL,
).replace(/\/+$/, '');

export const CLIENT_ID = required(
  'EXPO_PUBLIC_CLIENT_ID',
  process.env.EXPO_PUBLIC_CLIENT_ID,
);

// A redirect URI left at its placeholder counts as unset, so it falls back to
// the path under the backend URL that was just validated rather than sending
// the sign-in at your-backend.example.com.
const redirectOverride = process.env.EXPO_PUBLIC_REDIRECT_URI?.trim();

export const REDIRECT_URI =
  redirectOverride && !PLACEHOLDERS.has(redirectOverride)
    ? redirectOverride
    : `${BACKEND_URL}/_krdpass/oauth/callback`;

// Required, with no default: defaulting to development would point a misconfigured
// release build at the development CAS instead of failing.
const environment = required(
  'EXPO_PUBLIC_KRD_ENVIRONMENT',
  process.env.EXPO_PUBLIC_KRD_ENVIRONMENT,
);
if (environment !== 'development' && environment !== 'production') {
  throw new Error(
    'EXPO_PUBLIC_KRD_ENVIRONMENT must be development or production.',
  );
}

export const ENVIRONMENT: KrdpassEnvironment = environment;
