/*
 * This is an executable consumer of the shared redirect contract. The actual
 * validation belongs to the SDK and authorization server; keeping this fixture
 * here prevents the sample documentation from drifting back to host-only rules.
 */
const redirectVectors =
  require('../../shared/test-vectors/redirect-validation.json') as {
    configuredRedirectUri: string;
    vectors: Array<{
      id: string;
      configuredRedirectUri?: string;
      input: string;
      expected: boolean;
    }>;
  };

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
