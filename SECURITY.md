# Security policy

## Reporting a vulnerability

Report vulnerabilities **privately** through GitHub: open the [Security tab](https://github.com/ASV-Labs/hermes-helm/security) and choose **Report a vulnerability**. Please don't open a public issue.

Include:

- the version of helm (`plugin.yaml`, or **Helm: diagnostics**)
- your Hermes version
- steps to reproduce
- what an attacker could achieve

We'll acknowledge your report, keep you updated while we work on it, and credit you in the release notes unless you'd rather stay anonymous.

## Scope

helm is a Hermes Desktop plugin. In scope:

- `desktop/plugin.js` — for example, anything that sends, approves or answers without a user's click, or leaks session data outside the app.
- `dashboard/plugin_api.py` — for example, path traversal or serving anything other than the bundled sprites.

Vulnerabilities in Hermes itself belong with Nous Research. See the [Hermes security policy](https://github.com/NousResearch/hermes-agent/security).

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✓ |
| < 1.0 | — |
