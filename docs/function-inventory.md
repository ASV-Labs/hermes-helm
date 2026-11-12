# Hermes Desktop function inventory, and where each function lives in helm 2.0

Source: a click-through of Hermes Desktop v0.23.1 with helm 1.2.0 on the build Mac (Nov 11, 2026), the Nous desktop guide, and the v0.23.1 desktop source (`apps/desktop/src`, tag `v0.23.1`).

Rule: with helm on, every stock function is reachable within two clicks or one keybind, and "Back to stock Hermes" is one click. helm hides and restyles; it never removes.

The **Checked in app** column is filled during the release walk (Advanced and Simple mode). An empty box blocks the release.

## Navigation and chrome

| Hermes function | Where it is with helm 2.0 | How helm reaches it | Checked in app |
|---|---|---|---|
| New session | Hero **New chat**; per-bot **New chat**; ⌘N | `host.newChat(profile)` | ☐ |
| Session list, search | helm sidebar **All chats** and the search box; **Hermes list** link opens the native Sessions pane | `host.listPersistedSessions`, `host.revealPane('sessions')` | ☐ |
| Pinned sessions, archive, export, delete | Native Sessions pane (**Hermes list** / **Pinned and Home** links); Command center › Sessions | `host.revealPane('sessions')`, Apps › Command center | ☐ |
| Projects (Home, lineage demo, Vision, .buzz, MACBOOK), show sessions, new session in | Sidebar **Projects** view: each project expands to its sessions; **+** starts a session in it | `projects.list`, `projects.project_sessions`, `projects.set_active` then `host.newChat` | ☐ |
| Profile rail (profile squares, New profile, Import profile) | Native profile rail stays; footer bot switcher has **Profiles…** | `nav.profiles` | ☐ |
| Bots tab (Bot Mode): bots, hidden bots, mute, New bot or group chat | Crew list in the helm sidebar; **Bot Mode** link fronts the native pane | `host.revealPane('hermes-bots:pane')` | ☐ |
| Rooms (group chats) | Sidebar **Rooms** with **New room** | room RPCs (unchanged from 1.2) | ☐ |
| Sessions · Bots · Helm strip | Restyled to a quiet row; hiding it is a Customize option | CSS only; `tabStripDefault` is never written | ☐ |
| Capabilities (skills, plugins, connectors, tools) | Apps › All apps › Capabilities (cannot be unpinned from All apps) | `nav.capabilities` | ☐ |
| Messaging | All apps › Messaging | `nav.messaging` | ☐ |
| Artifacts | Pinned app | `nav.artifacts` | ☐ |
| Scheduled jobs (Hermes's editor) | All apps › Scheduled jobs; **Edit in Scheduled jobs** on Routines | `nav.cron` | ☐ |
| Routines by desk, Pause / Resume (Trigger now stays in Scheduled jobs) | Pinned app **Routines** (`/helm/routines`) | `cron.manage` list / pause / resume | ☑ |
| Profiles page, SOUL.md | All apps › Profiles; footer **Profiles…** | `nav.profiles` | ☐ |
| Agents | All apps › Agents | `nav.agents` | ☐ |
| Agent's computer | All apps › Agent's computer | helm's bot computer view | ☐ |
| Command center (Sessions, System logs, Usage, Maintenance) | All apps › Command center | `host.navigate('/command-center')` | ☐ |
| Settings (all sections) | Footer gear; All apps › Settings | `nav.settings` | ☐ |
| Keyboard shortcuts | All apps › Keyboard shortcuts | `keybinds.openPanel` | ☐ |
| Command palette (⌘K) | Untouched; title-bar chip › Terminal, logs and more | `nav.commandPalette` | ☐ |
| Layout editor, templates, "Before helm…" | Hermes's own title-bar button; title-bar chip › **Fix layout…** | layout editor button | ☐ |
| HUD, swap sidebar sides, right sidebar | Hermes's own title-bar buttons stay | — | ☐ |
| Status bar (backend, cost, approvals, context, artifacts, YOLO, version) | Rests in the whole shell; title-bar chip › **Show status bar** | `view.toggleStatusbar` | ☐ |
| Files, Review, Browser, Find in page | Title-bar chip › Tools; All apps › Workspace tools | `view.showFiles`, `view.toggleReview`, `view.showBrowser`, `view.findInPage` | ☐ |
| Terminal, Logs | Their own keybinds and ⌘K (plugins may not run terminal actions) | — | ☐ |
| Menus (Hermes, File, Edit, View, Window, Help) | Untouched | — | ☐ |

## Chat

| Hermes function | Where it is with helm 2.0 | Checked in app |
|---|---|---|
| Composer: attach, model, effort, mic, voice, send, history, queue | Native controls, restyled | ☐ |
| Live tool activity, Tasks header, Subagents frame, timeline rail | Native | ☐ |
| Drag-and-drop attach, preview rail, browser comment mode | Native | ☐ |
| Find in page, reading-position memory | Native; Find also in the chip's Tools | ☐ |
| helm chat header, side panel (Task / Lineage / Files / Terminal) | Unchanged from 1.2 | ☐ |

## Plugin pages

| Plugin | Route | In helm 2.0 | Checked in app |
|---|---|---|---|
| SIEMless | `/siemless` | Pinned app; badge counts `plugin.siemless.finding` events since you last opened it | ☐ |
| Lineage | `/lineage` | Pinned app | ☐ |
| Kanban (bundled) | `/kanban` | Pinned app | ☐ |
| AI Task Broker, anything else | its own route | All apps › **Pin a page** (name + route) | ☐ |

A plugin turned off in Settings › Plugins leaves Apps. Hermes stores only explicit on/off choices, so helm can't tell "installed" from "never installed": unpin any you don't have.

## Not opened in the first pass (walk these in stock Hermes first)

Right-click menus (status bar, session rows, bot rows), HUD, voice, Quick Entry, Memory Graph, Connectors and Tools tabs, and the Settings sections beyond their names.

## Release walk

1. Stock Hermes (helm off): screenshot every surface at 1100, 1440 and 1920 px into `~/helm-shots/baseline/`.
2. helm on, **Use helm as the whole shell**: walk every row above in Advanced, then in Simple mode; tick the box.
3. **Back to stock Hermes**: theme and status bar come back; then disable helm in Settings › Plugins and confirm nothing is left behind.
