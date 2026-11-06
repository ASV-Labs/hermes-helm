# helm

A quieter Hermes Desktop, as a plugin. Same app, same rail, same sidebar — helm changes how it looks and adds three things Hermes doesn't show you: what's working, what the session costs, and a Bots board where every bot is a small robot you can customize.

```
hermes plugins install P0GL0L/hermes-helm
hermes plugins enable helm
```

Then in Hermes Desktop: **Settings → Plugins → Desktop plugins → enable helm**, pick **Helm Dark** in the theme picker (or run *Helm: use Helm Dark* from ⌘K).

## What you get

| | |
|---|---|
| **Three themes** | Helm Dark (cyan accent), Helm Graphite (no hue), Helm Paper (warm light). Each ships a terminal palette and a small CSS layer that removes the noise texture, calms the profile rail, tracks the tab labels, and flattens the composer. |
| **Status-bar chips** | *N working* — how many sessions are mid-turn, from the app's own busy map. *$0.42 · 18% ctx* — cost and context of the session you're looking at. Each can be turned off. |
| **Bots board** | `⌘⌥B` or the sidebar row. Every profile as a card with a robot look, model, skill count, a *Chat* button that opens its Bot Mode chat, and a *Look* editor: antenna/ears, face, chest module, tool, back accessory, colour. The face is the status: focused eyes while working. |
| **Settings page** | Settings → Plugins → Helm: theme, chips, hide the Messaging row, session-list density and chat text scale (the app's own settings, surfaced), export/import everything as JSON. |

## What it will not do

- Restyle the transcript's message bubbles beyond what a theme can.
- Reorder the sidebar's Pinned / Recents / Cron sections.
- Replace the built-in Bots tab. The board sits beside it and opens chats through it.
- Touch Bot Mode's own avatars. Looks live in helm's plugin storage.

## Surviving updates

helm lives in `~/.hermes/desktop-plugins/helm/` (or `plugins/helm/desktop/`), which `hermes update` never touches. It uses only `@hermes/plugin-sdk` areas; the one app-DOM dependency is the themes' `customCSS`, which targets `data-slot` names the app ships. If a release renames one, that rule stops applying and the palette alone remains. Preferences are in `ctx.storage` under `hermes.plugin.helm.`; **Export** copies them as JSON.

Requires Hermes Desktop ≥ 0.22.0. Tested on 0.23.0 (macOS).

## Disclosure

Desktop-only. The agent half (`__init__.py`) registers nothing: no tools, hooks, commands or settings. No network requests. No shell. Reads the profile list through `host.profiles.list()` (the same endpoint the profile rail uses) and the app's busy/usage state through `host.state`. Writes only to its own plugin storage and, when you change them on its settings page, the app's `sessionListDensity` and `chatTextScale` settings.

## Development

```
node --check desktop/plugin.js
cd tests && npm install && npm test     # loads the plugin against an SDK mock and renders every contribution
hermes plugins validate .
```

Drop the folder into `~/.hermes/desktop-plugins/helm/` and the app hot-reloads it on save.

MIT · Charles Bonetti / ASV Labs
