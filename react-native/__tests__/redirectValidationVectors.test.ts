/*
 * This is an executable consumer of the shared redirect contract. The actual
 * validation belongs to the SDK and authorization server; keeping this fixture
 * here prevents the sample documentation from drifting back to host-only rules.
 *
 * It runs on node:test rather than a test framework because it exercises no
 * React Native surface at all: URL parsing and a JSON fixture. That keeps the
 * Expo sample's dependency list to what the app itself needs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isExactRedirectResponse } from '../../shared/test-vectors/redirect-validation.ts';

type RedirectVectors = {
  configuredRedirectUri: string;
  rule: { securityResponseParameters: string[] };
  vectors: {
    id: string;
    configuredRedirectUri?: string;
    input: string;
    expected: boolean;
  }[];
};

const redirectVectors = JSON.parse(
  readFileSync(
    new URL('../../shared/test-vectors/redirect-validation.json', import.meta.url),
    'utf8',
  ),
) as RedirectVectors;

// Read from the contract rather than restated here, so a parameter added to the
// shared file starts being enforced without an edit on this side.
const SECURITY_RESPONSE_PARAMETERS = new Set(
  redirectVectors.rule.securityResponseParameters,
);

for (const vector of redirectVectors.vectors) {
  test(`shared redirect validation vector: ${vector.id}`, () => {
    assert.equal(
      isExactRedirectResponse(
        vector.input,
        vector.configuredRedirectUri ?? redirectVectors.configuredRedirectUri,
        SECURITY_RESPONSE_PARAMETERS,
      ),
      vector.expected,
    );
  });
}
