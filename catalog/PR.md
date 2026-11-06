## Add helm to the plugin catalog

**helm** — a quieter Hermes Desktop with a crew view. Owner submission (rule 5): I own https://github.com/P0GL0L/hermes-helm.

### What it adds
- Three themes (Helm Dark / Graphite / Paper) with terminal palettes and a small scoped customCSS layer.
- A *Customize look* page and Settings → Plugins → Helm (themes, chips, composer robot, Messaging-row toggle, the app's density and text-scale settings, JSON export/import).
- Status-bar chips: sessions working; focused session cost and context.
- **Bots board** (`⌘⌥B`): every profile as a rendered, customizable robot whose face is its live status (reply waiting / working / idle), read from the bot's own persisted sessions. Needs-you-first sorting and filters, latest session with *Resume*, *New chat*, recent spend, profile-folder button.
- **Composer robot**: who you are talking to, left of the composer.

### Disclosure (rule 13)
- Desktop half: SDK areas only. JS never queries or edits app markup. The themes' customCSS targets four `data-slot` names (validate will warn on `[data-slot]` in CSS text — that is this file, by design, like other theme entries).
- Reads `host.profiles.list()`, `host.listPersistedSessions` (recent session rows per bot, in memory only), `host.state`. Writes only its own `ctx.storage` and, on request, the app's `sessionListDensity` / `chatTextScale`.
- Dashboard half: read-only FastAPI router serving the bundled PNGs (`/api/plugins/helm/sprites/*`), fixed-pattern names, no writes.
- Agent half registers nothing. No network, shell, credentials or telemetry. No self-updater.
- `tools/render/` holds the Blender script that produced the PNGs (source, not executed by Hermes). No binaries.

### Checks
- `hermes plugins validate` output: (pasted below)
- Tested on macOS, Hermes Desktop 0.23.0: install, gateway restart, rendered board, look editor, theme switch, composer robot.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01F1DXuWjUkUGYSqHhtAutEe
