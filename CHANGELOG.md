# Changelog

## 0.5.0 — 2026-11-06

The Desk: a home for the whole app.

- **Desk** (`/helm/desk`, `⌘⌥H`, sidebar row under *New session*, opens at launch): greeting and crew status sentence; a prompt that hands work to any bot (robot picker, ↵ sends, *Draft* fills the new chat unsent, never sends before the app has switched to that bot); **Continue**, **Needs you** with inline reply-as-draft, **Today** from scheduled jobs; shortcuts and live totals.
- **Continue strip** above the composer on a fresh chat.
- Backend: `GET /desk/today` lists scheduled jobs through the dashboard's own cron listing, trimmed; any failure hides the list instead of erroring.
- Both new surfaces can be turned off in Customize look.

## 0.4.0 — 2026-11-06

The whole desk, not just the bots.

- **Redesign layer** across the app: one-colour line rail, tracked-caps section labels and tabs with an accent underline, an accent edge on the open row, a calmer reading column, framed tool activity, approvals with an amber decision edge, a flat hairline composer that lights on focus, a tabular status bar, hairline menus and dialogs, thin scrollbars.
- **Customize look** drives the whole desk live: base (Dark, Graphite, Paper), accent (7), type (System, Inter, Grotesk, Mono), corners, reading width, rail colour, session density, chat text size, and every helm surface on/off. Backed by a live `Helm Custom` theme.
- **Titlebar context**: bot, folder, model, cost and context for the chat you're in.
- **Session list**: each row shows the robot of the bot it belongs to (its face is the row's state) and its spend.
- **Status bar**: *N need you* (unread replies across all bots, click to see them) and *$ today*.
- **Palette**: *new chat with <bot>*, *resume <bot>*, *what needs me*; `⌘⌥L` for Customize look.
- **Bots**: *New bot* creates a real Hermes bot (`profiles.create`) with its robot; every robot becomes the bot's Hermes avatar (`profiles.set_asset`), and new bots get one automatically unless you uploaded a photo.

## 0.3.1 — 2026-11-06

Found by testing on a real desk (Hermes Desktop 0.23.0, macOS):

- Worn items (bow, scarf, cape, packs) now stack above the body: every part is rendered with the body as a holdout, so all layers belong on top. Bow and scarf were invisible before.
- Headphones arch over the head instead of crossing the face.
- Carried tools render 1.55× larger so they read at avatar size.
- Heart eyes and the heart chest module are hearts (two lobes and a point), not paws; the recycle module is three chasing arrows; the leaf is a pointed leaf.
- Head avatars crop to the head and topper only.
- Scanner-clean: no character-code hashing, no subprocess in the shrink step, no shell wrapper. `hermes plugins install` passes the security scan with no findings.

## 0.3.0 — 2026-11-05

The Bots board becomes a crew view — built on the problems users report most (multi-agent coordination, not knowing which bot needs you, surprise token spend):

- **Live status per bot**, read from each bot's own persisted sessions (`host.listPersistedSessions`, the sidebar's read; no gateway dial): *reply waiting* when a session is unread, *working* inside the backend's activity window or while the focused chat is busy, otherwise *idle · 12m ago*. The robot's face shows it (curious / focused / resting).
- **Needs-you first**: the board sorts by urgency, the header counts *N need you · N working*, and a filter shows only those.
- **Resume where it left off**: each card shows the bot's latest session title and opens it in one click (`host.openSession`); *New chat* still starts a fresh Bot Mode chat.
- **Recent spend** per bot (sum of the last 25 sessions' actual or estimated cost).
- **Profile folder** button (`ctx.os.revealPath`) and the `.env` pill, for setup checks.
- **Composer robot**: the bot you are talking to sits left of the composer, its face focused while it works; click it for the board. Toggle in Settings → Plugins → Helm.
- **Restart gateway** button when the rendered robots are not being served yet (the backend half mounts at gateway start), replacing a known-issue note with a fix.

## 0.2.0 — 2026-11-05

- Robots are rendered now. 191 alpha PNG layers (Blender/Cycles, one fixed camera, bloom in post) composed live: 10 toppers, 10 faces, 8 chest modules, 6 carried tools, 6 back accessories, 7 colours. Served by a new dashboard half (`dashboard/plugin_api.py`, mounted at `/api/plugins/helm/sprites`) and cached in the desktop half; the 0.1 SVG robots remain as the fallback while the gateway is unreachable.
- Look editor: every part has a thumbnail, carried and worn items are separate pickers, colour swatches are heads.
- New *Customize look* sidebar row and page (`/helm/look`) that owns appearance: themes, chrome toggles, density and text scale, link to the Bots board. Palette: *Helm: Customize look*.
- Renderer shipped in `tools/render/` so the layer set can be rebuilt or extended.

## 0.1.0 — 2026-11-05

First release.

- Themes: Helm Dark, Helm Graphite, Helm Paper, each with a terminal palette and a scoped CSS layer (no noise texture, calmer profile rail, tracked tab labels, flat composer).
- Status bar: *N working* (from `host.state.busyBySession`) and *$cost · ctx%* for the focused session (from `host.state.focusedUsage`).
- Bots board at `/helm/bots` (`⌘⌥B`): one card per profile with a robot look, *Chat* (opens the Bot Mode chat via `host.newChat`) and a *Look* editor with six parts and seven colours; looks are stored in plugin storage.
- Settings → Plugins → Helm: theme, chips, hide the Messaging row (`sidebarNav.prefs`), session-list density and chat text scale, export/import as JSON.
- Appearance card with the three themes.
- Palette: *Helm: Bots board*, *Helm: use …*.
