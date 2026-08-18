import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    BACKEND_URL: 'https://demo.example.com',
    CLIENT_ID: 'demo-client',
    KRD_ENVIRONMENT: 'development',
    REDIRECT_URI: 'https://demo.example.com/callback',
  },
}));

jest.mock('krdpass-auth-react-native', () => ({
  __esModule: true,
  KrdpassScopes: {
    citizen_identity: 'citizen_identity',
    offline_access: 'offline_access',
    openid: 'openid',
    profile: 'profile',
  },
  authenticate: jest.fn(),
  generatePkcePair: jest.fn(),
  generateState: jest.fn(),
  getUserInfo: jest.fn(),
  initialize: jest.fn(),
  isAuthResultError: jest.fn(),
  refreshTokens: jest.fn(),
  revokeToken: jest.fn(),
  signIn: jest.fn(),
  verifyToken: jest.fn(),
}));

import App from '../App';

const { initialize } = jest.requireMock('krdpass-auth-react-native') as {
  initialize: jest.Mock;
};

test('initializes the SDK from shared public configuration and renders', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });

  expect(initialize).toHaveBeenCalledWith({
    clientId: 'demo-client',
    environment: 'development',
    redirectUri: 'https://demo.example.com/callback',
  });
});
