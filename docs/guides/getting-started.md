# Getting started

## Requirements

- Hermes **0.22.0 or newer**, with Hermes Desktop. helm declares `requires_hermes: ">=0.22.0"`, and Hermes won't install it on anything older.
- It's hand-tested on macOS (Apple silicon). Linux and Windows run the same code, but nobody has walked through them by hand yet. If something looks off there, [open an issue](https://github.com/ASV-Labs/hermes-helm/issues/new/choose).

## Install

From GitHub:

```
hermes plugins install ASV-Labs/hermes-helm
hermes plugins enable helm
```

helm has been submitted to the official Hermes plugin catalog. Once it's listed, `hermes plugins install helm` works as well. Both commands install the same code.

Then, in Hermes Desktop:

1. Go to **Settings → Plugins → Desktop plugins** and switch **helm** on. The interface picks it up right away. You don't need to reload.
2. **Restart Hermes once.** helm has a small read-only backend that serves the robot renders, and the gateway only mounts plugin backends when it starts. Until it's mounted, the Bots board shows flat placeholder robots and a note saying so. Everything else works before the restart.
3. Press `⌘⌥U` (`Ctrl+Alt+U` on Windows/Linux) and pick a look.

> **The restart didn't bring the robots back.** On some installs, the gateway backend (`hermes serve`) runs as a background service. Reopening the app doesn't restart it. Run `hermes serve --stop`, then open Hermes again. See [Troubleshooting](troubleshooting.md#the-bots-board-shows-flat-robots).

## First run

- **The Desk opens at launch**, in the main window only. Pop-out, HUD and peer windows are left alone. To turn this off, go to *Customize look → On the desk → Open the Desk at launch*.
- **Desk** is also added to the sidebar, just under *New session*.
- The Desk greets you by name. Click the greeting to set the name.

## Shortcuts and commands

| Shortcut | Command palette (`⌘K`) | Opens |
|---|---|---|
| `⌘⌥0` | *Helm: Desk* | The Desk |
| `⌘⌥R` | *Helm: Bots board* | Every bot, with its robot and live status |
| `⌘⌥U` | *Helm: Customize look* | The look editor |
| — | *Helm: diagnostics* | A one-line health report (see [Troubleshooting](troubleshooting.md#helm-diagnostics)) |

The palette also lists *what needs me*, *new chat with <bot>*, *resume <bot>* and every helm theme.

These shortcuts were chosen so they don't collide with Hermes's own (`⌘⌥B`, `⌘⌥L`) or with macOS (`⌘⌥H` hides other apps, `⌘⌥D` toggles the Dock).

## Updating

```
hermes plugins update helm
```

Your preferences live in the plugin's own storage, so updates keep them. `hermes update` (updating Hermes itself) never touches helm's folder.

## Back up or move your setup

Go to **Settings → Plugins → Helm**.

- **Export** copies every helm preference as JSON: look, accent, type, toggles and each bot's robot.
- **Import** reads that JSON back in, on this machine or another.

Updating keeps your preferences. Removing and reinstalling helm clears them, so export first.

## Uninstall

```
hermes plugins remove helm
```

Then pick any non-helm theme under **Settings → Appearance**.

Bots keep the robot avatars helm gave them, because those avatars are now part of each bot's Hermes profile. Change any of them in the app's own bot settings.
