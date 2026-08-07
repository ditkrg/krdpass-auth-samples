/*
 * This is an executable consumer of the shared redirect contract. The actual
 * validation belongs to the SDK and authorization server; keeping this fixture
 * here prevents the sample documentation from drifting back to host-only rules.
 */
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

function queryParameters(url: URL): Map<string, string[]> {
  const parameters = new Map<string, string[]>();
  for (const [name, value] of url.searchParams) {
    parameters.set(name, [...(parameters.get(name) ?? []), value]);
  }
  return parameters;
}

function sameValues(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function isExactRedirectResponse(
  input: string,
  configuredRedirectUri: string,
): boolean {
  try {
    const configured = new URL(configuredRedirectUri);
    const response = new URL(input);

    if (
      configured.protocol !== 'https:' ||
      response.protocol !== 'https:' ||
      !configured.hostname ||
      !response.hostname ||
      configured.username ||
      configured.password ||
      response.username ||
      response.password ||
      configured.hash ||
      response.hash ||
      configured.hostname !== response.hostname ||
      configured.port !== response.port ||
      configured.pathname !== response.pathname
    ) {
      return false;
    }

    const configuredParameters = queryParameters(configured);
    const responseParameters = queryParameters(response);

    for (const [name, values] of configuredParameters) {
      const responseValues = responseParameters.get(name);
      if (!responseValues || !sameValues(values, responseValues)) return false;
    }

    for (const [name, values] of responseParameters) {
      if (configuredParameters.has(name)) continue;
      if (values.length !== 1) return false;
    }

    // A security response parameter that is present but blank carries no value and is
    // malformed. `?iss` with no '=' and `?iss=` both arrive here as an empty string.
    // error_description and error_uri are not on the list: they are display strings, so a
    // blank one is cosmetic and must not fail an otherwise valid callback.
    for (const [name, values] of responseParameters) {
      if (!SECURITY_RESPONSE_PARAMETERS.has(name)) continue;
      if (values.some(value => value.trim() === '')) return false;
    }

    // Both code and error is ambiguous. Rejecting it means the order in which an
    // implementation happens to test the two branches can never decide the outcome.
    if (responseParameters.has('code') && responseParameters.has('error')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

describe('shared redirect validation vectors', () => {
  test.each(redirectVectors.vectors)('$id', vector => {
    expect(
      isExactRedirectResponse(
        vector.input,
        vector.configuredRedirectUri ?? redirectVectors.configuredRedirectUri,
      ),
    ).toBe(vector.expected);
  });
});
