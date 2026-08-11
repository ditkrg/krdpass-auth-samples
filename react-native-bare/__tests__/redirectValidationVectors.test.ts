/*
 * This is an executable consumer of the shared redirect contract. The actual
 * validation belongs to the SDK and authorization server; keeping this fixture
 * here prevents the sample documentation from drifting back to host-only rules.
 */
import {isExactRedirectResponse} from '../../shared/test-vectors/redirect-validation';

const redirectVectors =
  require('../../shared/test-vectors/redirect-validation.json') as {
    configuredRedirectUri: string;
    rule: {securityResponseParameters: string[]};
    vectors: Array<{
      id: string;
      configuredRedirectUri?: string;
      input: string;
      expected: boolean;
    }>;
  };

// Read from the contract rather than restated here, so a parameter added to the
// shared file starts being enforced without an edit on this side.
const SECURITY_RESPONSE_PARAMETERS = new Set(
  redirectVectors.rule.securityResponseParameters,
);

describe('shared redirect validation vectors', () => {
  test.each(redirectVectors.vectors)('$id', vector => {
    expect(
      isExactRedirectResponse(
        vector.input,
        vector.configuredRedirectUri ?? redirectVectors.configuredRedirectUri,
        SECURITY_RESPONSE_PARAMETERS,
      ),
    ).toBe(vector.expected);
  });
});
