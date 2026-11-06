# Changelog

## 0.1.0 — 2026-11-05

First release.

- Themes: Helm Dark, Helm Graphite, Helm Paper, each with a terminal palette and a scoped CSS layer (no noise texture, calmer profile rail, tracked tab labels, flat composer).
- Status bar: *N working* (from `host.state.busyBySession`) and *$cost · ctx%* for the focused session (from `host.state.focusedUsage`).
- Bots board at `/helm/bots` (`⌘⌥B`): one card per profile with a robot look, *Chat* (opens the Bot Mode chat via `host.newChat`) and a *Look* editor with six parts and seven colours; looks are stored in plugin storage.
- Settings → Plugins → Helm: theme, chips, hide the Messaging row (`sidebarNav.prefs`), session-list density and chat text scale, export/import as JSON.
- Appearance card with the three themes.
- Palette: *Helm: Bots board*, *Helm: use …*.
