# Security Policy

## Supported Versions

We take security seriously and actively maintain the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in the KRDPASS SDK suite, please help us by reporting it responsibly.

### How to Report

Please **DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report security vulnerabilities by emailing:
**security@pass.krd**

### What to Include

When reporting a security vulnerability, please include:

1. **Description**: A clear description of the vulnerability
2. **Steps to Reproduce**: Detailed steps to reproduce the issue
3. **Impact**: What an attacker could achieve by exploiting this vulnerability
4. **Environment**: SDK name/version, platform version, device information
5. **Proof of Concept**: If possible, include a proof of concept

### Our Commitment

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide a more detailed response within 7 days indicating our next steps
- We will keep you informed about our progress throughout the process
- We will credit you (with your permission) when the vulnerability is disclosed

## Security Best Practices

### For Users of the SDKs

- Always use the latest version of each SDK
- Validate all input and output data
- Implement proper error handling
- Use HTTPS for all network communications
- Store sensitive data securely
- Keep your app's dependencies up to date
- Treat `../server` as dev-only reference code

### For Contributors

- Follow secure coding practices
- Validate all inputs and outputs
- Use parameterized queries when applicable
- Implement proper error handling
- Avoid logging sensitive information
- Keep dependencies up to date

## Security Features

The KRDPASS SDKs include several security features:

- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception
- **Pushed Authorization Requests (PAR)**: Securely initiates authorization requests
- **State Parameter**: Prevents CSRF attacks
- **HTTPS Only**: All communication is encrypted
- **Input Validation**: Validates all input parameters
- **Safe Logging**: Production-safe logging controls (no sensitive data logged)

### Sensitive Data Protection

The SDKs are designed to never log sensitive information:

- **Authorization Codes**: Never logged or exposed in toString()
- **Access Tokens**: Redacted in toString() methods
- **PKCE Values**: Redacted in toString() methods
- **OAuth URLs**: Sanitized in log messages
- **Client Credentials**: Not stored or logged

## Contact

For security-related questions or concerns:
- Email: security@pass.krd
- General Support: integration@pass.krd

Release governance policy is documented in `../.github/RELEASE_GOVERNANCE.md`.
