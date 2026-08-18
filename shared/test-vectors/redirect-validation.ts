/*
 * The redirect-response check the vectors in redirect-validation.json describe.
 *
 * Both React Native samples run the same vectors on different test runners, so the
 * check itself lives here once rather than being copy-pasted into each suite. The
 * runners load the JSON their own way and pass its rule list in.
 */

function queryParameters(url: URL): Map<string, string[]> {
  const parameters = new Map<string, string[]>();
  for (const [name, value] of url.searchParams) {
    parameters.set(name, [...(parameters.get(name) ?? []), value]);
  }
  return parameters;
}

function sameValues(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

export function isExactRedirectResponse(
  input: string,
  configuredRedirectUri: string,
  securityResponseParameters: Set<string>,
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
      if (!securityResponseParameters.has(name)) continue;
      if (values.some((value) => value.trim() === '')) return false;
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
