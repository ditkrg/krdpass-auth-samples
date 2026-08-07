import type { KrdpassEnvironment } from 'krdpass-auth-react-native';

/**
 * Every read of `process.env` below is a literal `process.env.EXPO_PUBLIC_*`
 * property access, and that is not a style preference.
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
function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
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

export const REDIRECT_URI =
  process.env.EXPO_PUBLIC_REDIRECT_URI?.trim() ||
  `${BACKEND_URL}/_krdpass/oauth/callback`;

// Keep the public Expo name aligned with the source-of-truth
// shared/secrets/.env key. Accept the earlier name during local migration so
// existing developers do not silently switch environments.
const environment =
  process.env.EXPO_PUBLIC_KRD_ENVIRONMENT?.trim() ??
  process.env.EXPO_PUBLIC_ENVIRONMENT?.trim();

export const ENVIRONMENT: KrdpassEnvironment =
  (environment as KrdpassEnvironment) ?? 'development';
