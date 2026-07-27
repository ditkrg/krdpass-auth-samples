jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    BACKEND_URL: 'https://bff.example.com',
    CLIENT_ID: 'demo-client',
    KRD_ENVIRONMENT: 'development',
    REDIRECT_URI: 'https://client.example.com/callback',
  },
}));

import { AuthBackendService } from '../services/AuthBackendService';

describe('AuthBackendService token exchange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends only code, codeVerifier, and state to the BFF', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access-token',
          expiresIn: 300,
          tokenType: 'Bearer',
        }),
        { status: 200 },
      ),
    );

    await AuthBackendService.exchangeToken({
      code: 'authorization-code',
      codeVerifier: 'verifier',
      environment: 'production',
      redirectUri: 'https://attacker.example/callback',
      state: 'state',
    } as Parameters<typeof AuthBackendService.exchangeToken>[0]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bff.example.com/oauth/token');
    expect(request?.method).toBe('POST');
    expect(JSON.parse(String(request?.body))).toEqual({
      code: 'authorization-code',
      codeVerifier: 'verifier',
      state: 'state',
    });
  });
});
