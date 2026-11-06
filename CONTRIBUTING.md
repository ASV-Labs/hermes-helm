# Contributing to helm

helm is maintained by [ASV Labs](https://asv-labs.com). Issues and pull requests are welcome.

## Before you start

- **Bugs.** Open a [bug report](https://github.com/ASV-Labs/hermes-helm/issues/new?template=bug.yml) and include:
  - your Hermes version (`hermes --version`)
  - your OS
  - the line from **Helm: diagnostics** (`⌘K`)
- **Features.** Open a [feature request](https://github.com/ASV-Labs/hermes-helm/issues/new?template=feature.yml) first, so we can agree on the shape before you write code.
- **Security.** Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Ground rules

These keep helm admissible to the official Hermes plugin catalog.

- **SDK surfaces only.** The desktop half may import only `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`. Don't query, observe or rewrite the app's DOM. Styling the app goes through the theme's `customCSS`.
- **Public gateway calls only.** Use only the calls the app itself makes. If you add a new one, disclose it in the README's *Privacy and permissions* section in the same PR.
- **Nothing happens without the user.** helm must never approve, deny, answer or send on its own.
- **No network calls, telemetry, credentials or self-updating code.**
- **Inline styles for helm's own surfaces.** The app's Tailwind doesn't compile plugin code, so only utility classes the app already ships will render.

## Developing

```bash
# live: the app hot-reloads the desktop half on save
cp -R . ~/.hermes/desktop-plugins/helm/

node --check desktop/plugin.js
cd tests && npm ci && npm test       # SDK mock: loads the plugin, renders every contribution
python3 tests/test_plugin_api.py     # the sprite router
hermes plugins validate .            # catalog admission checks
bash tools/screens/render.sh         # if you changed a surface shown in the README
```

## Pull requests

- Keep each PR to one change, and update `CHANGELOG.md`.
- Add or extend a test in `tests/smoke.mjs` for behaviour you change.
- If you change how something works for users, update the matching guide in `docs/guides/`.
- CI must pass.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
