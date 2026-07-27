# Release Governance

This repository contains runnable sample apps for a government-grade OAuth integration and uses strict release controls.

## Required CI Checks

All pull requests to `main` must pass:

- `Repo hygiene`
- `Server (BFF reference)`
- `Android sample`
- `Flutter sample`
- `iOS sample`
- `React Native sample`

These checks are defined in `.github/workflows/ci.yml`. `Repo hygiene` validates that
every platform sample directory is present and that no secrets are committed. The
Android sample resolves its SDK from Maven Central (resolved with `mavenCentral()`,
no token); the iOS, Flutter, and React Native samples resolve their SDKs from git
tags in the corresponding SDK repositories.

## Branch Protection (GitHub Settings)

Configure branch protection on `main`:

- Require pull request before merging
- Require approvals: minimum 1
- Require review from Code Owners
- Require status checks to pass before merging
- Dismiss stale approvals when new commits are pushed
- Require conversation resolution before merge
- Restrict force pushes and branch deletion

## Signed Tag Policy

All release tags must be signed annotated tags.

Create signed tag:

```bash
git tag -s v1.3.0 -m "Release v1.3.0"
git push origin v1.3.0
```

Verify locally:

```bash
git tag -v v1.3.0
```

Before creating a signed tag, ensure your GPG key is configured in GitHub account settings.

## Release Checklist

1. Ensure all required CI checks pass on the release commit.
2. Confirm no secrets are committed (`.env`, private keys, keystores).
3. Run manual mobile callback verification:
   - iOS Universal Link callback flow
   - Android intent callback flow
   - Flutter + React Native example flows
4. Confirm onboarding docs and server reference docs match the current API.
5. Create signed annotated tag and publish release notes.

## Dev-Only Server Reference Policy

`/server` is a development reference, not a production backend.

- Default bind host is `127.0.0.1`.
- It is intentionally simple for integration clarity.
- Production deployments must add authentication, rate limiting, durable state storage, and secret management.
