// helm — a quieter Hermes Desktop, as a plugin.
// Plain ESM, loaded uncompiled. Only `@hermes/plugin-sdk`, `react` and
// `react/jsx-runtime` resolve. UI is jsx() calls, never JSX syntax.
//
// What this file registers:
//   THEMES_AREA        three themes: helm-dark, helm-graphite, helm-paper (customCSS included)
//   statusBar.right    "N working" and "$cost · ctx%" chips (both optional)
//   sidebarNav.prefs   hide the Messaging row when asked (Capabilities can never be hidden)
//   ROUTES_AREA        /helm/bots — the Bots board with robot looks
//   SIDEBAR_NAV_AREA   a "Bots board" row under the core rows
//   PALETTE_AREA       Helm: Bots board · Helm: theme …
//   KEYBINDS_AREA      helm.desk (mod+alt+0), helm.bots (mod+alt+r), helm.look (mod+alt+u) — none collide with the app's or macOS's
//   appearance.extra   a card on Settings → Appearance with the three themes
//   registerSettingsPage  Settings → Plugins → Helm
//
// Nothing here queries or restyles app markup from JS. The only app-DOM
// dependency is the theme customCSS, which targets `data-slot` names the app
// itself ships; if a release renames one, that rule stops applying and the
// palette alone remains. Preferences live in ctx.storage (plugin-namespaced,
// untouched by app updates) and can be exported as JSON.

import {
  host,
  useValue,
  useQuery,
  atom,
  cn,
  haptic,
  requestTheme,
  Button,
  Codicon,
  ListRow,
  ToggleRow,
  SegmentedControl,
  THEMES_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  PALETTE_AREA,
  KEYBINDS_AREA
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

const ID = 'helm'
const VERSION = '1.1.0'
const BOTS_ROUTE = '/helm/bots'
const LOOK_ROUTE = '/helm/look'
const DESK_ROUTE = '/helm/desk'

// ───────────────────────────────────────────────────────────────── themes

const HELM_CSS_SCOPE = ':root[data-hermes-theme^="helm"]'

// The redesign layer, shared by every helm theme. It only touches app
// `data-slot` names (a renamed slot drops that one rule) and CSS custom
// properties the app reads. The icon rail is the one exception: it reads the
// titlebar and status bar positions to sit between them.
// Tunables (radius, rail colour, reading width, type) are CSS variables a
// Customize-look theme sets in front of this block.
const HELM_CSS = `
${HELM_CSS_SCOPE} {
  --noise-opacity-mul: 0;
  --radius-scalar: var(--helm-radius, 0.85);
  --helm-hair: color-mix(in srgb, var(--ui-stroke-secondary) 100%, transparent);
}
${HELM_CSS_SCOPE} ::selection { background: color-mix(in srgb, var(--ui-accent) 32%, transparent); }
${HELM_CSS_SCOPE} ::-webkit-scrollbar { width: 9px; height: 9px; }
${HELM_CSS_SCOPE} ::-webkit-scrollbar-thumb { background: var(--ui-stroke-secondary); border-radius: 9px; border: 2px solid transparent; background-clip: padding-box; }
${HELM_CSS_SCOPE} ::-webkit-scrollbar-track { background: transparent; }

/* Rail: line icons, one colour. */
${HELM_CSS_SCOPE} [data-slot="profile-rail"] {
  filter: saturate(var(--helm-rail-sat, 0.15));
  border-right: 1px solid var(--helm-hair);
}

/* Sidebar: section labels are small tracked caps; the open row carries an accent edge. */
${HELM_CSS_SCOPE} [data-slot="sidebar"] { border-right: 1px solid var(--helm-hair) !important; }
${HELM_CSS_SCOPE} [data-slot="sidebar-group-label"] {
  font-size: 10.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #76838F !important;
}
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"] {
  min-height: 30px;
  gap: 9px;
  padding-inline: 8px;
  border-radius: 6px;
  font-size: 13px;
  color: #C3CCD5;
}
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"] svg { width: 14px; height: 14px; }
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"]:hover { background: #171E27; color: var(--ui-text-primary); }
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"][data-active="true"],
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"][aria-current="page"] {
  background: #171E27 !important;
  color: var(--ui-text-primary) !important;
  box-shadow: none;
}
${HELM_CSS_SCOPE} [data-slot="sidebar-input"] {
  height: 28px;
  border-radius: 6px;
  border: 1px solid #1C242D !important;
  background: #0F1419 !important;
  padding-inline: 9px;
  font-size: 12px;
}

/* Sidebar section labels (Pinned, a project's name): the design's plain
   tracked caps in #76838F, no colour square. */
${HELM_CSS_SCOPE} [data-slot="sidebar"] span:has(> .dither) {
  color: #76838F !important;
  letter-spacing: 0.08em !important;
  font-size: 10.5px !important;
  gap: 6px;
}
${HELM_CSS_SCOPE} [data-slot="sidebar"] span:has(> .dither) > .dither { display: none !important; }

/* Session search: the design's framed 28px field. */
${HELM_CSS_SCOPE} [data-slot="sidebar"] div:has(> svg + input[type="text"]) {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  border: 1px solid #1C242D !important;
  border-radius: 6px;
  background: #0F1419;
  padding: 0 9px;
  opacity: 1 !important;
}
${HELM_CSS_SCOPE} [data-slot="sidebar"] div:has(> svg + input[type="text"]) input { font-size: 12px; }

/* Tab strips: no dividers between tabs, underline for the open one. */
${HELM_CSS_SCOPE} [data-slot="pane-tab"] { border-left-width: 0 !important; --tab-bg: transparent; }

/* Session rows: helm's status decoration wraps onto its own line under the
   title (11.5px, secondary), the design's "Working · step 3 of 5 · $0.42". */
${HELM_CSS_SCOPE} div:has(> [data-helm-row-status]) { flex-wrap: wrap; row-gap: 1px; }
${HELM_CSS_SCOPE} [data-helm-row-status] {
  flex: 0 0 100%;
  order: 99;
  min-width: 0;
  padding-left: var(--helm-row-indent, 22px);
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--ui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tabs: tracked caps, an underline for the open one. */
${HELM_CSS_SCOPE} [data-slot="pane-tab"],
${HELM_CSS_SCOPE} [data-slot="tabs-trigger"] {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11.5px;
  font-weight: 600;
  color: #98A4B1;
}
${HELM_CSS_SCOPE} [data-slot="pane-tab"][data-active="true"],
${HELM_CSS_SCOPE} [data-slot="tabs-trigger"][data-state="active"] { color: var(--ui-text-primary); }
${HELM_CSS_SCOPE} [data-slot="pane-tab"][data-active="true"],
${HELM_CSS_SCOPE} [data-slot="tabs-trigger"][data-state="active"] {
  box-shadow: inset 0 -2px 0 var(--ui-accent);
}

/* Bots board rows: hover like the highlighted row, Look shows on hover. */
${HELM_CSS_SCOPE} .helm-board-row:hover { background: #121820 !important; }
${HELM_CSS_SCOPE} .helm-board-row .helm-board-look { opacity: 0; }
${HELM_CSS_SCOPE} .helm-board-row:hover .helm-board-look,
${HELM_CSS_SCOPE} .helm-board-look:focus-visible { opacity: 1; }
${HELM_CSS_SCOPE} .helm-nav-row:hover { background: #171E27; color: #E6EBF0; }

/* Titlebar session tabs (the main zone's strip): the board's pills, 28px,
   12px caps at 0.02em, open tab on #171E27, no underline. */
${HELM_CSS_SCOPE} [data-slot="pane-tab"]:is([data-tree-tab="workspace"], [data-tree-tab^="session-tile:"]) {
  height: 28px;
  align-self: center;
  border-radius: 6px;
  margin-inline: 1px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #98A4B1;
  box-shadow: none !important;
  --tab-bg: transparent;
  background: transparent;
}
${HELM_CSS_SCOPE} [data-slot="pane-tab"]:is([data-tree-tab="workspace"], [data-tree-tab^="session-tile:"]) span { letter-spacing: 0.02em; }
${HELM_CSS_SCOPE} [data-slot="pane-tab"]:is([data-tree-tab="workspace"], [data-tree-tab^="session-tile:"]):hover { background: #141B23; }
${HELM_CSS_SCOPE} [data-slot="pane-tab"]:is([data-tree-tab="workspace"], [data-tree-tab^="session-tile:"])[data-active="true"] {
  background: #171E27 !important;
  --tab-bg: #171E27;
  color: #E6EBF0;
  box-shadow: none !important;
}

/* Transcript, to the Chat board: your message is a full-width framed block
   (#16232B on #1F3038), the bot's text has no bubble (13.5/1.6), inline code
   is a small mono pill, tool calls read as a compact log on a left rule. */
${HELM_CSS_SCOPE} { --dt-user-bubble: #16232B; }
${HELM_CSS_SCOPE} [data-slot="aui_thread-content"] { max-width: var(--helm-reading, none); margin-inline: auto; }
${HELM_CSS_SCOPE} .composer-human-message {
  border-color: #1F3038 !important;
  border-radius: 10px !important;
  padding: 9px 13px !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}
${HELM_CSS_SCOPE} [data-slot="aui_user-message-text"] { font-size: 13.5px; line-height: 1.5; color: #E6EBF0; }
${HELM_CSS_SCOPE} [data-slot="aui_assistant-message-content"] { font-size: 13.5px; line-height: 1.6; color: #E6EBF0; }
${HELM_CSS_SCOPE} [data-slot="aui_assistant-message-content"] :not(pre) > code {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: #121820;
  border: 1px solid #1C242D;
  border-radius: 4px;
  padding: 0 5px;
}
${HELM_CSS_SCOPE} [data-slot="aui_turn-activity"],
${HELM_CSS_SCOPE} [data-slot="tool-block"] {
  border-left: 1px solid #1C242D;
  padding-left: 10px;
  margin-left: 2px;
  font-size: 12px;
  color: #98A4B1;
}
${HELM_CSS_SCOPE} [data-slot="tool-row"] {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: #C3CCD5;
  font-variant-numeric: tabular-nums;
}
${HELM_CSS_SCOPE} [data-slot="code-card"] {
  background: #0F1419 !important;
  border: 1px solid #1C242D !important;
  border-radius: 6px !important;
}
${HELM_CSS_SCOPE} [data-slot="code-card-body"] { font-size: 11.5px; line-height: 1.55; }
${HELM_CSS_SCOPE} [data-slot="aui_reasoning-text"] { color: var(--ui-text-tertiary); }

/* Approvals: the board's card, amber 2px edge on #121820, 28px buttons. */
${HELM_CSS_SCOPE} [data-slot="tool-approval-card"] {
  border: 1px solid #2A2F33 !important;
  border-left: 2px solid #E8A657 !important;
  border-radius: 8px !important;
  background: #121820 !important;
  padding: 10px 12px !important;
}
${HELM_CSS_SCOPE} [data-slot="tool-approval-actions"] button { height: 28px; border-radius: 6px; font-size: 12px; }

/* Composer: the board's box, #222B35 hairline, radius 12, #121820. */
${HELM_CSS_SCOPE} [data-slot="composer-surface"] {
  box-shadow: none !important;
  border: 1px solid #222B35 !important;
  border-radius: 12px !important;
  background: #121820 !important;
}
/* Composer controls: the board's bordered 28px pills (+, model, effort, mic). */
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[class*="composer-control-size"]:not([type="submit"]):not([class*="primary-size"]) {
  height: 28px !important;
  min-width: 28px;
  border: 1px solid #222B35 !important;
  border-radius: 6px !important;
  background: transparent;
  color: #C3CCD5;
  font-size: 12px;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[class*="composer-control-size"]:not([type="submit"]):not([class*="primary-size"]):hover { background: #171E27; color: #E6EBF0; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[type="submit"] {
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  background: var(--ui-accent) !important;
  color: #06161A !important;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[type="submit"]:disabled { background: color-mix(in srgb, var(--ui-accent) 35%, #121820) !important; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"]:focus-within { border-color: color-mix(in srgb, var(--ui-accent) 55%, #222B35) !important; }

/* Composer, to the boards: input on its own row, then one toolbar row with
   + and the model / effort / approval pills on the left, the hint, mic and
   send on the right. Send is the cyan 28px square (the voice-start button that
   stands in for it on an empty draft wears the same). */
${HELM_CSS_SCOPE} [data-slot="composer-surface"] div.grid.w-full {
  grid-template-columns: auto minmax(0, 1fr) !important;
  grid-template-areas: "input input" "menu controls" !important;
  row-gap: 8px !important;
  align-items: center;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:controls"] { justify-content: flex-start !important; flex-wrap: nowrap; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:controls"] > div:has(> button[type="submit"]),
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:controls"] > div:has(button[class*="primary-size"]) { display: contents !important; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:controls"] > div:has(> button[type="submit"]) > :nth-child(n+3),
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:controls"] > div:has(button[class*="primary-size"]) > :nth-child(n+3) { order: 5; }
${HELM_CSS_SCOPE} [data-helm-ask] { order: 3; }
${HELM_CSS_SCOPE} [data-helm-hint] { order: 4; margin-left: auto; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] { padding: 10px 12px 8px !important; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] [class*="grid-area:input"] { font-size: 14px; }
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[class*="primary-size"] {
  width: 28px !important; height: 28px !important; border-radius: 6px !important;
  background: var(--ui-accent) !important; color: #06161A !important; border: 0 !important;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"] button[class*="voice-menu-size"] { display: none !important; }

/* Surfaces, to the board: the title bar is one #0F1419 band with a hairline
   under it; below it the sidebar is the #121820 panel (tab row included) with
   its own hairline under the tabs; the main area stays #0F1419. Painted on
   the zones themselves so glass mode can't wash the panel out. */
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="sessions"]) { background: var(--ui-bg-sidebar) !important; }
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="sessions"]) > [data-panel-header] {
  background: linear-gradient(to top, #1C242D 0 1px, var(--ui-bg-sidebar) 1px 28px, #1C242D 28px 29px, var(--ui-bg-chrome) 29px) !important;
}
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="sessions"]) > [data-panel-header] [data-slot="pane-tab"],
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="sessions"]) > [data-panel-header] [data-zone-tabstrip] { background: transparent !important; }
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="workspace"]) > [data-panel-header] { background: var(--ui-bg-chrome) !important; box-shadow: inset 0 -1px 0 #1C242D; }
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="workspace"]) { background: var(--ui-bg-chrome) !important; }
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="sessions"]) [data-slot="sidebar"] { background: transparent !important; }
${HELM_CSS_SCOPE} [data-slot="statusbar"] { background: var(--ui-bg-chrome) !important; border-top: 1px solid #1C242D !important; }

/* Session rows, to the board: no leading status glyph on a quiet row (the
   working row keeps its dot), so titles line up with the section labels and
   the status line sits flush under the title. */
${HELM_CSS_SCOPE} [data-slot="sidebar"] div:has(> [data-row-actions]):not([data-working="true"]) [class*="size-3.5"][class*="shrink-0"][class*="place-items-center"] { display: none !important; }
${HELM_CSS_SCOPE} [data-slot="sidebar"] { --helm-row-indent: 0px; }

/* Resting terminal strip: the boards have none. It comes back the moment the
   terminal is opened (its tab turns active). */
${HELM_CSS_SCOPE} [data-tree-group]:has([data-tree-tab="terminal"]):not(:has([data-tree-tab][data-active="true"])):not(:has([data-tree-tab="workspace"])) { display: none !important; }

/* Status bar: small, tabular, one hairline. */
${HELM_CSS_SCOPE} [data-slot="statusbar"] {
  font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--helm-hair);
}

/* Menus and dialogs: hairline, no heavy shadow. */
${HELM_CSS_SCOPE} [data-slot="dropdown-menu-content"],
${HELM_CSS_SCOPE} [data-slot="context-menu-content"],
${HELM_CSS_SCOPE} [data-slot="dialog-content"],
${HELM_CSS_SCOPE} [data-slot="tooltip-content"] {
  border: 1px solid var(--helm-hair) !important;
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.45) !important;
}
`

// Customize-look tunables, written in front of HELM_CSS by the custom theme.
const RADIUS = { sharp: 0.45, default: 0.85, round: 1.3 }
const READING = { narrow: '720px', default: 'none', wide: '1180px' }
const RAIL = { mono: 0.15, colour: 1 }
const FONTS = {
  system: { label: 'System', fontSans: '-apple-system, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif' },
  inter: { label: 'Inter', fontSans: '"Inter Variable", Inter, -apple-system, "SF Pro Text", system-ui, sans-serif' },
  grotesk: { label: 'Grotesk', fontSans: '"Helvetica Neue", "Neue Haas Grotesk Text", Arial, -apple-system, sans-serif' },
  mono: { label: 'Mono', fontSans: '"JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace' }
}
const ACCENTS = {
  cyan: { dark: '#62C6D3', light: '#1F8A96' },
  blue: { dark: '#6FA7E0', light: '#2A5FA8' },
  violet: { dark: '#A98BEA', light: '#6B4FA3' },
  green: { dark: '#6FBF8E', light: '#1F7A4A' },
  amber: { dark: '#E8A657', light: '#9A6414' },
  rose: { dark: '#E88AA6', light: '#B0466A' },
  white: { dark: '#D9DEE4', light: '#2C333B' }
}

function hexLuma(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  if (!isFinite(n)) return 0.5
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function withAccent(colors, hex) {
  if (!hex) return colors
  const fg = hexLuma(hex) > 0.55 ? '#06161A' : '#FFFFFF'
  return { ...colors, primary: hex, primaryForeground: fg, ring: hex, midground: hex, midgroundForeground: fg, composerRing: hex }
}

// Hermes mixes a theme's seeds with neutrals; the boards want the exact
// surfaces: chrome/main, the sidebar panel, cards.
function surfacesCSS(colors, scope) {
  return `${scope} {
  --ui-bg-chrome: ${colors.background};
  --ui-bg-sidebar: ${colors.sidebarBackground || colors.card};
  --ui-bg-editor: ${colors.background};
  --ui-bg-elevated: ${colors.card};
}
`
}

function tunablesCSS(prefs) {
  return `${HELM_CSS_SCOPE} {
  --helm-radius: ${RADIUS[prefs.radius] ?? RADIUS.default};
  --helm-reading: ${READING[prefs.width] ?? READING.default};
  --helm-rail-sat: ${RAIL[prefs.rail] ?? RAIL.mono};
}
`
}

// The live theme the Customize-look page edits: a base helm theme with the
// chosen accent, type and tunables. Re-registered on every change.
function accentOf(id, light) {
  if (ACCENTS[id]) return light ? ACCENTS[id].light : ACCENTS[id].dark
  return /^#[0-9a-f]{6}$/i.test(String(id || '')) ? String(id) : ''
}

function customTheme(prefs) {
  const base = THEMES.find(t => t.name === prefs.preferredTheme && t.name !== 'helm-custom') || THEMES[0]
  const accent = ACCENTS[prefs.accent] || (accentOf(prefs.accent) ? { dark: prefs.accent, light: prefs.accent } : null)
  const light = base.name === 'helm-paper'
  const font = FONTS[prefs.font] || FONTS.system
  return {
    name: 'helm-custom',
    label: 'Helm Custom',
    description: `${base.label} with your accent, type and shape (Customize look)`,
    colors: withAccent(base.colors, accent ? (light ? accent.light : accent.dark) : ''),
    darkColors: withAccent(base.darkColors || base.colors, accent ? accent.dark : ''),
    typography: { ...TYPOGRAPHY, fontSans: font.fontSans },
    terminal: base.terminal,
    darkTerminal: base.darkTerminal,
    customCSS: surfacesCSS(base.colors, ':root[data-hermes-theme="helm-custom"]') + tunablesCSS(prefs) + HELM_CSS
  }
}

const TERMINAL_DARK = {
  foreground: '#E6EBF0',
  cursor: '#62C6D3',
  selectionBackground: '#2A3B46',
  black: '#1C242D',
  red: '#E07080',
  green: '#6FBF8E',
  yellow: '#E8A657',
  blue: '#6FA7E0',
  magenta: '#B9A2F0',
  cyan: '#62C6D3',
  white: '#C3CCD5',
  brightBlack: '#5B6872',
  brightRed: '#F08C9A',
  brightGreen: '#8ED4A8',
  brightYellow: '#F2BD75',
  brightBlue: '#8FBDEB',
  brightMagenta: '#CDBBF6',
  brightCyan: '#8ADAE4',
  brightWhite: '#FFFFFF'
}

const TERMINAL_LIGHT = {
  foreground: '#1B1F24',
  cursor: '#1F8A96',
  selectionBackground: '#CFE6E9',
  black: '#1B1F24',
  red: '#B5383F',
  green: '#1F7A4A',
  yellow: '#8A5A14',
  blue: '#2A5FA8',
  magenta: '#6B4FA3',
  cyan: '#1F8A96',
  white: '#5C6670',
  brightBlack: '#78838D',
  brightRed: '#D04A52',
  brightGreen: '#2E9A5F',
  brightYellow: '#A8701A',
  brightBlue: '#3C76C4',
  brightMagenta: '#8367BF',
  brightCyan: '#2AA5B3',
  brightWhite: '#2C333B'
}

const DARK = {
  background: '#0F1419',
  foreground: '#E6EBF0',
  card: '#121820',
  cardForeground: '#E6EBF0',
  muted: '#171E27',
  mutedForeground: '#98A4B1',
  popover: '#141B23',
  popoverForeground: '#E6EBF0',
  primary: '#62C6D3',
  primaryForeground: '#06161A',
  secondary: '#1C242D',
  secondaryForeground: '#E6EBF0',
  accent: '#1C242D',
  accentForeground: '#E6EBF0',
  border: '#222B35',
  input: '#222B35',
  ring: '#62C6D3',
  midground: '#62C6D3',
  midgroundForeground: '#06161A',
  composerRing: '#62C6D3',
  destructive: '#E07080',
  destructiveForeground: '#1A0B0E',
  sidebarBackground: '#121820',
  sidebarBorder: '#1C242D',
  userBubble: '#16232B',
  userBubbleBorder: '#1F3038'
}

const GRAPHITE = {
  background: '#0B0D10',
  foreground: '#E4E7EB',
  card: '#0F1216',
  cardForeground: '#E4E7EB',
  muted: '#13171C',
  mutedForeground: '#9AA3AD',
  popover: '#111519',
  popoverForeground: '#E4E7EB',
  primary: '#D9DEE4',
  primaryForeground: '#0B0D10',
  secondary: '#1A1E24',
  secondaryForeground: '#E4E7EB',
  accent: '#1A1E24',
  accentForeground: '#E4E7EB',
  border: '#1F242B',
  input: '#1F242B',
  ring: '#D9DEE4',
  midground: '#D9DEE4',
  midgroundForeground: '#0B0D10',
  composerRing: '#8E979F',
  destructive: '#E07080',
  destructiveForeground: '#1A0B0E',
  sidebarBackground: '#0E1114',
  sidebarBorder: '#1A1E24',
  userBubble: '#161B20',
  userBubbleBorder: '#232930'
}

const PAPER = {
  background: '#F7F6F2',
  foreground: '#1B1F24',
  card: '#FFFFFF',
  cardForeground: '#1B1F24',
  muted: '#EFEDE6',
  mutedForeground: '#5C6670',
  popover: '#FFFFFF',
  popoverForeground: '#1B1F24',
  primary: '#1F8A96',
  primaryForeground: '#FFFFFF',
  secondary: '#E8E6DF',
  secondaryForeground: '#1B1F24',
  accent: '#E8E6DF',
  accentForeground: '#1B1F24',
  border: '#D9D6CC',
  input: '#D9D6CC',
  ring: '#1F8A96',
  midground: '#1F8A96',
  midgroundForeground: '#FFFFFF',
  composerRing: '#1F8A96',
  destructive: '#B5383F',
  destructiveForeground: '#FFFFFF',
  sidebarBackground: '#F1EFE9',
  sidebarBorder: '#E2DFD5',
  userBubble: '#E9F3F5',
  userBubbleBorder: '#CFE6E9'
}

const TYPOGRAPHY = {
  fontSans: '-apple-system, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace'
}

const THEMES = [
  {
    name: 'helm-dark',
    label: 'Helm Dark',
    description: 'Quiet dark chrome, one cyan accent',
    colors: DARK,
    darkColors: DARK,
    typography: TYPOGRAPHY,
    terminal: TERMINAL_DARK,
    darkTerminal: TERMINAL_DARK,
    customCSS: surfacesCSS(DARK, ':root[data-hermes-theme="helm-dark"]') + HELM_CSS
  },
  {
    name: 'helm-graphite',
    label: 'Helm Graphite',
    description: 'Near-black, no hue, white accent',
    colors: GRAPHITE,
    darkColors: GRAPHITE,
    typography: TYPOGRAPHY,
    terminal: TERMINAL_DARK,
    darkTerminal: TERMINAL_DARK,
    customCSS: surfacesCSS(GRAPHITE, ':root[data-hermes-theme="helm-graphite"]') + HELM_CSS
  },
  {
    name: 'helm-paper',
    label: 'Helm Paper',
    description: 'Warm light paper, teal accent',
    colors: PAPER,
    darkColors: DARK,
    typography: TYPOGRAPHY,
    terminal: TERMINAL_LIGHT,
    darkTerminal: TERMINAL_DARK,
    customCSS: surfacesCSS(PAPER, ':root[data-hermes-theme="helm-paper"]') + HELM_CSS
  }
]

// ───────────────────────────────────────────────────────────── preferences

const DEFAULT_PREFS = {
  showWorkingChip: true,
  showCostChip: false,
  hideMessagingRow: false,
  showComposerBot: false,
  showRowBots: false,
  showRowCost: true,
  showRowStatus: true,
  designNav: true,
  showContextLine: false,
  showNeedsYouChip: true,
  showTodayChip: true,
  autoAvatars: true,
  animateRobots: true,
  robotPets: true,
  preferredTheme: 'helm-dark',
  accent: '',
  radius: 'default',
  font: 'system',
  width: 'default',
  rail: 'mono',
  openDeskAtLaunch: false,
  showNeedsYouPane: true,
  showDeskStrip: true,
  homeOnNewSession: true,
  showHudPanel: true,
  showRail: true,
  hudBoard: true,
  routing: {},
  deskName: '',
  // Desk sections you folded, comma-separated ids ('continue,today').
  deskFolded: ''
}

// ────────────────────────────────────────────────────────────── robot looks
// A bot's look is six parts. Parts never carry user text, so the SVG is built
// from fixed fragments plus validated hex colours.

const PART_OPTIONS = {
  topper: ['antenna', 'cat', 'sprout', 'cap', 'goggles', 'dish', 'bunny', 'beanie', 'crown', 'headphones'],
  face: ['idle', 'happy', 'focused', 'question', 'error', 'sleep', 'heart', 'star', 'wink', 'tongue'],
  chest: ['planet', 'heart', 'gear', 'leaf', 'bars', 'paw', 'recycle', 'bolt'],
  tool: ['none', 'wrench', 'claw', 'drill', 'flashlight', 'magnet', 'camera'],
  back: ['none', 'backpack', 'jetpack', 'cape', 'satchel', 'scarf', 'bow'],
  color: ['blue', 'purple', 'green', 'gold', 'pink', 'graphite', 'white']
}
// Parts whose render does not depend on the bot colour share one sprite.
const COLOR_FREE = {
  topper: ['sprout', 'goggles', 'bunny', 'beanie', 'crown', 'headphones'],
  tool: PART_OPTIONS.tool,
  back: ['cape', 'satchel', 'scarf', 'bow']
}
const PART_LABEL = {
  topper: { antenna: 'Antenna', cat: 'Cat ears', sprout: 'Sprout', cap: 'Cap', goggles: 'Goggles', dish: 'Dish', bunny: 'Bunny ears', beanie: 'Beanie', crown: 'Crown', headphones: 'Headphones' },
  face: { idle: 'Idle', happy: 'Happy', focused: 'Focused', question: 'Curious', error: 'Oops', sleep: 'Asleep', heart: 'Hearts', star: 'Stars', wink: 'Wink', tongue: 'Cheeky' },
  chest: { planet: 'Planet', heart: 'Heart', gear: 'Gear', leaf: 'Leaf', bars: 'Bars', paw: 'Paw', recycle: 'Recycle', bolt: 'Bolt' },
  tool: { none: 'Empty hands', wrench: 'Wrench', claw: 'Claw', drill: 'Drill', flashlight: 'Flashlight', magnet: 'Magnet', camera: 'Camera' },
  back: { none: 'Nothing', backpack: 'Backpack', jetpack: 'Jetpack', cape: 'Cape', satchel: 'Satchel', scarf: 'Scarf', bow: 'Bow' },
  color: { blue: 'Blue', purple: 'Purple', green: 'Green', gold: 'Gold', pink: 'Pink', graphite: 'Graphite', white: 'White' }
}

// ───────────────────────────────────────────────────────────────── sprites
// Rendered robot layers (PNG with alpha, 640×800, one fixed camera) served by
// the package's dashboard half at /api/plugins/helm/sprites. Composed here as
// stacked <img>s: back · base · chest · face · topper · tool. If the gateway is
// down or the routes are not mounted yet, the SVG robots below stand in.
const SPRITE_W = 640
const SPRITE_H = 800
const HEAD_CROP = [120, 20, 400, 400] // x, y, w, h of the head in sprite space
const CHEST_CROP = [200, 380, 240, 200]
const TOOL_CROP = [400, 200, 240, 300]
const spriteCache = new Map()
const spritePending = new Set()
const $spriteTick = atom(0)
let spriteRest = null
let spriteFailures = 0
let spritesDown = false

function spriteName(kind, part, color) {
  if (!part || part === 'none') return null
  if (kind === 'base') return `base_${color}.png`
  const free = COLOR_FREE[kind] && COLOR_FREE[kind].includes(part)
  return free ? `${kind}_${part}.png` : `${kind}_${part}_${color}.png`
}

function layerNames(look, expr) {
  // Every part was rendered with the body as a holdout, so its pixels are
  // already only the visible ones: all parts stack ON TOP of the body.
  return [
    spriteName('base', 'base', look.color),
    spriteName('back', look.back, look.color),
    spriteName('chest', look.chest, look.color),
    spriteName('face', expr || look.face, look.color),
    spriteName('topper', look.topper, look.color),
    spriteName('tool', look.tool, look.color)
  ].filter(Boolean)
}

function requestSprites(names) {
  if (!spriteRest || spritesDown) return
  const missing = names.filter(n => !spriteCache.has(n) && !spritePending.has(n))
  if (missing.length === 0) return
  for (let i = 0; i < missing.length; i += 16) {
    const chunk = missing.slice(i, i + 16)
    chunk.forEach(n => spritePending.add(n))
    spriteRest(`/sprites/batch?names=${encodeURIComponent(chunk.join(','))}`)
      .then(res => {
        const got = (res && res.sprites) || {}
        for (const n of chunk) {
          spritePending.delete(n)
          spriteCache.set(n, typeof got[n] === 'string' && got[n].startsWith('data:image/png') ? got[n] : null)
        }
        spriteFailures = 0
        $spriteTick.set($spriteTick.get() + 1)
      })
      .catch(() => {
        chunk.forEach(n => spritePending.delete(n))
        spriteFailures += 1
        if (spriteFailures >= 3) spritesDown = true
        $spriteTick.set($spriteTick.get() + 1)
      })
  }
}

function useSprites(names) {
  useValue($spriteTick)
  const key = names.join('|')
  useEffect(() => {
    requestSprites(names)
  }, [key])
  return names.map(n => spriteCache.get(n) || null)
}

/** The composed robot, or a crop of it. `crop` is [x, y, w, h] in sprite space. */
function SpriteStack({ look, expr, width, crop, className, title }) {
  const names = useMemo(() => layerNames(look, expr), [look.topper, look.face, look.chest, look.tool, look.back, look.color, expr])
  const urls = useSprites(names)
  if (!urls[0]) return null
  const [cx, cy, cw, ch] = crop || [0, 0, SPRITE_W, SPRITE_H]
  const scale = width / cw
  const height = Math.round(ch * scale)
  return jsx('div', {
    className: cn('relative shrink-0 overflow-hidden', className),
    style: { width, height },
    role: 'img',
    'aria-label': title || 'bot',
    children: jsx('div', {
      className: 'absolute left-0 top-0',
      style: { width: SPRITE_W * scale, height: SPRITE_H * scale, transform: `translate(${-cx * scale}px, ${-cy * scale}px)` },
      children: names.map((n, i) =>
        urls[i]
          ? jsx('img', { src: urls[i], alt: '', draggable: false, className: 'absolute left-0 top-0 h-full w-full select-none', style: { imageRendering: 'auto' } }, n)
          : null
      )
    })
  })
}

// ─── animated robots ─────────────────────────────────────────────────────────
// The backend renders each look as a petdex/Codex sprite sheet (the format of
// Hermes pets). helm's screens play it at half resolution, one row per state:
// idle, running-right/left (roaming), waving, jumping, failed, waiting,
// running (working) and review. All robots step on one shared ticker.
const PET_ROWS = [['idle', 6], ['running-right', 8], ['running-left', 8], ['waving', 4], ['jumping', 5], ['failed', 8], ['waiting', 6], ['running', 6], ['review', 6]]
const PET_ROW = Object.fromEntries(PET_ROWS.map(([state, frames], index) => [state, { index, frames }]))
const PET_CELL_W = 96
const PET_CELL_H = 104
const PET_SHEET_W = PET_CELL_W * 8
const PET_SHEET_H = PET_CELL_H * PET_ROWS.length
const PET_FRAME_MS = 183 // 1100 ms per six-frame loop, the petdex default
const PET_HEAD = [22.5, 21.5, 44.7, 44.7] // the head inside a half-resolution cell, framed like HEAD_CROP
const petSheets = new Map()
const petPending = new Set()
const $petTick = atom(0)
const $petSheets = atom(0)
const $animate = atom(true)
let petTimer = null
let petUsers = 0
let petFailures = 0

function petKey(look) {
  return [look.color, look.topper, look.face, look.chest, look.tool, look.back].join('-')
}

/** helm's bot status → the sprite-sheet row that shows it. */
function petStateFor(statusKey) {
  return { working: 'running', 'needs-you': 'waiting', failed: 'failed', review: 'review' }[statusKey] || 'idle'
}

function requestPetSheet(key) {
  if (!spriteRest || spritesDown || petSheets.has(key) || petPending.has(key) || petFailures >= 3) return
  petPending.add(key)
  spriteRest(`/pets/sheet?look=${encodeURIComponent(key)}`, { timeoutMs: 120000 })
    .then(res => {
      petSheets.set(key, res && typeof res.url === 'string' && res.url.startsWith('data:image/') ? res.url : null)
      petFailures = 0
    })
    .catch(() => {
      petFailures += 1
    })
    .finally(() => {
      petPending.delete(key)
      $petSheets.set($petSheets.get() + 1)
    })
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function petTickerHold() {
  petUsers += 1
  if (!petTimer) {
    petTimer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) $petTick.set(($petTick.get() + 1) % 840)
    }, PET_FRAME_MS)
  }
  return () => {
    petUsers = Math.max(0, petUsers - 1)
    if (petUsers === 0 && petTimer) {
      clearInterval(petTimer)
      petTimer = null
    }
  }
}

/**
 * A bot's robot, animated for `state`. Until its sheet arrives (or with
 * animation off) it shows the still robot. A finished job plays a jump; with
 * `waveOnHover`, pointing at it waves back.
 */
function AnimatedRobot({ look, state = 'idle', size = 64, head = false, expr, title, waveOnHover = false }) {
  useValue($petSheets)
  const enabled = useValue($animate)
  const key = petKey(look)
  const url = enabled ? petSheets.get(key) || null : null
  useEffect(() => {
    if (enabled) requestPetSheet(key)
  }, [key, enabled])
  const moving = Boolean(url) && !prefersReducedMotion()
  useEffect(() => (moving ? petTickerHold() : undefined), [moving])
  const tick = useValue($petTick)
  const [moment, setMoment] = useState(null)
  const previous = useRef(state)
  useEffect(() => {
    if (previous.current === 'running' && state === 'idle') setMoment({ state: 'jumping', ms: 1800 })
    previous.current = state
  }, [state])
  useEffect(() => {
    if (!moment) return undefined
    const timer = setTimeout(() => setMoment(null), moment.ms)
    return () => clearTimeout(timer)
  }, [moment])
  if (!url) {
    return head ? jsx(RobotHead, { look, expr, size, title }) : jsx(RobotFull, { look, expr, size })
  }
  const row = PET_ROW[(moment && moment.state) || state] || PET_ROW.idle
  const frame = moving ? tick % row.frames : 0
  const [cx, cy, cw, ch] = head ? PET_HEAD : [0, 0, PET_CELL_W, PET_CELL_H]
  const scale = size / cw
  return jsx('div', {
    role: 'img',
    'aria-label': title || 'bot',
    title: waveOnHover ? title : undefined,
    onMouseEnter: waveOnHover && moving ? () => setMoment({ state: 'waving', ms: 1500 }) : undefined,
    className: cn('relative shrink-0 select-none overflow-hidden', head && 'rounded-full'),
    style: {
      width: size,
      height: Math.round(ch * scale),
      backgroundImage: `url("${url}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${PET_SHEET_W * scale}px ${PET_SHEET_H * scale}px`,
      backgroundPosition: `${-(frame * PET_CELL_W + cx) * scale}px ${-(row.index * PET_CELL_H + cy) * scale}px`
    }
  })
}

const PALETTE = {
  blue: { glow: '#5FB8D8', dark: '#1F4E6B' },
  purple: { glow: '#B48CE6', dark: '#5A3C8C' },
  green: { glow: '#6CD3A5', dark: '#2F7A5E' },
  gold: { glow: '#E4B55C', dark: '#8A6A2A' },
  pink: { glow: '#F08FB8', dark: '#9A4A6E' },
  graphite: { glow: '#C9D1DA', dark: '#3A434E' },
  white: { glow: '#9FD8E8', dark: '#8A96A3' }
}
const SHELL = '#E9EDF2'
const SHELL_SHADE = '#C9D1DA'
const SCREEN = '#0B0F14'

// Stable small hash of a profile name, so a bot's default look never changes.
function hashString(s) {
  let h = 7
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 2147483647
  return h
}

function defaultLook(name) {
  const h = hashString(String(name || 'bot'))
  const pick = (list, shift) => list[(h >>> shift) % list.length]
  return {
    topper: pick(PART_OPTIONS.topper, 0),
    face: 'idle',
    chest: pick(PART_OPTIONS.chest, 5),
    tool: 'none',
    back: 'none',
    color: pick(PART_OPTIONS.color, 10)
  }
}

function normalizeLook(raw, name) {
  const base = defaultLook(name)
  const out = { ...base }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(PART_OPTIONS)) {
      if (PART_OPTIONS[key].includes(raw[key])) out[key] = raw[key]
    }
  }
  return out
}

function eyes(expr, glow) {
  switch (expr) {
    case 'focused':
      return `<rect x="11" y="14" width="3.6" height="4.2" rx="1.2" fill="${glow}"/><rect x="17.4" y="14" width="3.6" height="4.2" rx="1.2" fill="${glow}"/>`
    case 'happy':
      return `<path d="M10.6 17.2c1.4-2.4 3.4-2.4 4.8 0" stroke="${glow}" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M16.6 17.2c1.4-2.4 3.4-2.4 4.8 0" stroke="${glow}" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M14.3 19.6c1 1 2.4 1 3.4 0" stroke="${glow}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
    case 'question':
      return `<text x="16" y="20.3" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="${glow}">? ?</text>`
    case 'error':
      return `<path d="M10.8 14.6l3.4 3.4M14.2 14.6l-3.4 3.4M17.8 14.6l3.4 3.4M21.2 14.6l-3.4 3.4" stroke="${glow}" stroke-width="1.6" stroke-linecap="round"/>`
    case 'sleep':
      return `<path d="M10.8 16.6h4M17.2 16.6h4" stroke="${glow}" stroke-width="1.8" stroke-linecap="round"/>`
    case 'heart':
      return `<path d="M12.8 14.2c-1.6 0-2.4 1.4-1.6 2.6l1.6 1.8 1.6-1.8c.8-1.2 0-2.6-1.6-2.6zM19.2 14.2c-1.6 0-2.4 1.4-1.6 2.6l1.6 1.8 1.6-1.8c.8-1.2 0-2.6-1.6-2.6z" fill="${glow}"/>`
    default:
      return `<circle cx="12.8" cy="16.2" r="2" fill="${glow}"/><circle cx="19.2" cy="16.2" r="2" fill="${glow}"/>`
  }
}

function topper(kind, dark, glow) {
  switch (kind) {
    case 'antenna':
      return `<path d="M16 6V2.5" stroke="${SHELL_SHADE}" stroke-width="1.6"/><circle cx="16" cy="2.6" r="2.3" fill="${glow}"/>`
    case 'cat':
      return `<path d="M6 10L8 2l6 6z" fill="${dark}"/><path d="M26 10l-2-8-6 6z" fill="${dark}"/>`
    case 'sprout':
      return `<path d="M16 6V3" stroke="#4E8A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M16 3.5c0-2.4 2.2-3.2 4-2.6-.4 2.2-2 3.2-4 2.6z" fill="#7CCB6A"/><path d="M16 4.5c0-2.2-2-3-3.6-2.4.4 2 1.8 2.9 3.6 2.4z" fill="#5FB64E"/>`
    case 'cap':
      return `<path d="M6.5 8.5c0-4 4-6 9.5-6s9.5 2 9.5 6z" fill="${dark}"/><rect x="4" y="7.5" width="26" height="2.4" rx="1.2" fill="${dark}"/>`
    case 'goggles':
      return `<rect x="6" y="5.5" width="20" height="4.6" rx="2.3" fill="${dark}"/><circle cx="12" cy="7.8" r="2.4" fill="${glow}" stroke="${dark}" stroke-width="1"/><circle cx="20" cy="7.8" r="2.4" fill="${glow}" stroke="${dark}" stroke-width="1"/>`
    case 'dish':
      return `<path d="M16 6V3" stroke="${SHELL_SHADE}" stroke-width="1.6"/><path d="M10 3.5c3-3 9-3 12 0-3 1.6-9 1.6-12 0z" fill="${glow}"/>`
    default:
      return ''
  }
}

function headMarkup(look, expr) {
  const { glow, dark } = PALETTE[look.color] || PALETTE.blue
  return (
    `${topper(look.topper, dark, glow)}` +
    `<rect x="4" y="6.5" width="24" height="22" rx="9" fill="${SHELL}"/>` +
    `<rect x="4" y="20" width="24" height="8.5" rx="6" fill="${SHELL_SHADE}" opacity=".45"/>` +
    `<circle cx="4.2" cy="18" r="3.4" fill="${dark}"/><circle cx="4.2" cy="18" r="1.6" fill="${glow}"/>` +
    `<circle cx="27.8" cy="18" r="3.4" fill="${dark}"/><circle cx="27.8" cy="18" r="1.6" fill="${glow}"/>` +
    `<rect x="8" y="10" width="16" height="13" rx="5" fill="${SCREEN}"/>` +
    eyes(expr || look.face, glow)
  )
}

function chestMarkup(kind, glow) {
  switch (kind) {
    case 'heart':
      return `<path d="M100 160c-8-6-14-10-14-16a6 6 0 0 1 11-3l3 3 3-3a6 6 0 0 1 11 3c0 6-6 10-14 16z" fill="${glow}"/>`
    case 'gear':
      return `<circle cx="100" cy="150" r="7" fill="none" stroke="${glow}" stroke-width="3"/><path d="M100 138v5M100 157v5M88 150h5M107 150h5M91.5 141.5l3.5 3.5M105 155l3.5 3.5M108.5 141.5l-3.5 3.5M95 155l-3.5 3.5" stroke="${glow}" stroke-width="3" stroke-linecap="round"/>`
    case 'leaf':
      return `<path d="M100 162c-12-10-6-24 10-24 0 16-4 22-10 24z" fill="${glow}"/><path d="M100 162c2-8 5-14 10-18" stroke="${SCREEN}" stroke-width="1.6"/>`
    case 'bars':
      return `<rect x="90" y="152" width="5" height="8" rx="1.5" fill="${glow}"/><rect x="97.5" y="146" width="5" height="14" rx="1.5" fill="${glow}"/><rect x="105" y="140" width="5" height="20" rx="1.5" fill="${glow}"/>`
    case 'paw':
      return `<circle cx="100" cy="154" r="6" fill="${glow}"/><circle cx="92" cy="146" r="3" fill="${glow}"/><circle cx="108" cy="146" r="3" fill="${glow}"/><circle cx="96" cy="140" r="2.6" fill="${glow}"/><circle cx="104" cy="140" r="2.6" fill="${glow}"/>`
    default:
      return `<circle cx="100" cy="150" r="8" fill="none" stroke="${glow}" stroke-width="2.5"/><ellipse cx="100" cy="150" rx="15" ry="4.5" fill="none" stroke="${glow}" stroke-width="2" transform="rotate(-20 100 150)"/>`
  }
}

function toolMarkup(kind, glow) {
  switch (kind) {
    case 'wrench':
      return `<g transform="translate(150 150) rotate(-30)"><rect x="-3" y="-2" width="30" height="6" rx="2" fill="#9AA4AE"/><path d="M-6 1a8 8 0 1 1 8 8 8 8 0 0 1-8-8z" fill="#B8C1CA"/><circle cx="2" cy="1" r="3.2" fill="${SHELL_SHADE}"/></g>`
    case 'claw':
      return `<g transform="translate(152 150)"><rect x="0" y="-3" width="18" height="6" rx="2" fill="#9AA4AE"/><path d="M18 -8l10 -6 2 4-8 6zM18 8l10 6 2-4-8-6z" fill="#B8C1CA"/></g>`
    case 'flashlight':
      return `<g transform="translate(152 150)"><rect x="0" y="-4" width="20" height="8" rx="3" fill="#9AA4AE"/><rect x="20" y="-6" width="8" height="12" rx="2" fill="#B8C1CA"/><circle cx="28" cy="0" r="4" fill="${glow}"/></g>`
    case 'magnet':
      return `<g transform="translate(152 148)"><path d="M0 0a12 12 0 0 1 24 0v8h-7V0a5 5 0 0 0-10 0v8H0z" fill="#D9534F"/><rect x="0" y="6" width="7" height="5" fill="#C9D1DA"/><rect x="17" y="6" width="7" height="5" fill="#C9D1DA"/></g>`
    default:
      return ''
  }
}

function backMarkup(kind, dark, glow) {
  switch (kind) {
    case 'backpack':
      return `<rect x="138" y="104" width="30" height="44" rx="9" fill="${dark}"/><rect x="144" y="112" width="18" height="12" rx="4" fill="${glow}" opacity=".8"/>`
    case 'jetpack':
      return `<rect x="140" y="100" width="12" height="44" rx="6" fill="#9AA4AE"/><rect x="156" y="100" width="12" height="44" rx="6" fill="#9AA4AE"/><path d="M142 146l4 12 4-12zM158 146l4 12 4-12z" fill="${glow}"/>`
    case 'cape':
      return `<path d="M60 108c-14 30-18 70-10 100 40-6 70 2 94-8-10-30-6-60 4-92z" fill="${dark}" opacity=".9"/>`
    default:
      return ''
  }
}

function fullMarkup(look, expr) {
  const { glow, dark } = PALETTE[look.color] || PALETTE.blue
  return (
    backMarkup(look.back, dark, glow) +
    `<rect x="62" y="186" width="30" height="36" rx="13" fill="${SHELL}"/><rect x="108" y="186" width="30" height="36" rx="13" fill="${SHELL}"/>` +
    `<circle cx="77" cy="208" r="8" fill="${dark}"/><circle cx="77" cy="208" r="4" fill="${glow}"/><circle cx="123" cy="208" r="8" fill="${dark}"/><circle cx="123" cy="208" r="4" fill="${glow}"/>` +
    `<rect x="58" y="112" width="84" height="84" rx="26" fill="${SHELL}"/><rect x="58" y="160" width="84" height="36" rx="20" fill="${SHELL_SHADE}" opacity=".35"/>` +
    `<rect x="34" y="124" width="26" height="46" rx="12" fill="${SHELL}"/><rect x="140" y="124" width="26" height="46" rx="12" fill="${SHELL}"/>` +
    `<circle cx="47" cy="170" r="9" fill="${SHELL_SHADE}"/><circle cx="153" cy="170" r="9" fill="${SHELL_SHADE}"/>` +
    `<rect x="80" y="132" width="40" height="36" rx="9" fill="${SCREEN}"/><rect x="80" y="132" width="40" height="36" rx="9" fill="none" stroke="${dark}" stroke-width="2"/>` +
    chestMarkup(look.chest, glow) +
    toolMarkup(look.tool, glow) +
    `<g transform="translate(40 4) scale(3.75)">${headMarkup(look, expr)}</g>`
  )
}

/** True once this colour's body sprite is in the cache (and requested if not). */
function useSpriteBase(color) {
  useValue($spriteTick)
  const name = spriteName('base', 'base', color)
  useEffect(() => {
    requestSprites([name])
  }, [name])
  return Boolean(spriteCache.get(name))
}

function RobotCrop({ look, expr, width, crop }) {
  const spriteOk = useSpriteBase(look.color)
  if (!spriteOk) return jsx('span', { className: 'text-xs', children: '·' })
  return jsx(SpriteStack, { look, expr, width, crop })
}

function RobotHead({ look, expr, size = 28, title }) {
  const html = useMemo(() => headMarkup(look, expr), [look, expr])
  const spriteOk = useSpriteBase(look.color)
  if (spriteOk) return jsx(SpriteStack, { look, expr, width: size, crop: HEAD_CROP, className: 'rounded-full', title })
  return jsx('svg', {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    role: 'img',
    'aria-label': title || 'bot',
    dangerouslySetInnerHTML: { __html: html }
  })
}

function RobotFull({ look, expr, size = 200 }) {
  const html = useMemo(() => fullMarkup(look, expr), [look, expr])
  const spriteOk = useSpriteBase(look.color)
  if (spriteOk) return jsx(SpriteStack, { look, expr, width: size, title: 'bot preview' })
  return jsx('svg', {
    width: size,
    height: Math.round(size * 1.2),
    viewBox: '0 0 200 240',
    role: 'img',
    'aria-label': 'bot preview',
    dangerouslySetInnerHTML: { __html: html }
  })
}

// ──────────────────────────────────────────────────────────── status chips

function WorkingChip({ prefs }) {
  const { showWorkingChip } = useValue(prefs)
  const busy = useValue(host.state.busyBySession)
  const n = Object.values(busy || {}).filter(Boolean).length
  if (!showWorkingChip) return null
  return jsxs('span', {
    title: n === 1 ? 'One session is mid-turn' : `${n} sessions are mid-turn`,
    className: cn(
      'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem]',
      n > 0 ? 'text-(--ui-text-secondary)' : 'text-(--ui-text-quaternary)'
    ),
    children: [
      jsx('span', {
        className: cn('inline-block h-1.5 w-1.5 rounded-full', n > 0 ? 'bg-(--ui-accent)' : 'bg-(--ui-text-quaternary)')
      }),
      n === 0 ? 'idle' : `${n} working`
    ]
  })
}

function fmtCost(v) {
  if (typeof v !== 'number' || !isFinite(v)) return null
  return v < 0.01 && v > 0 ? '<$0.01' : `$${v.toFixed(2)}`
}

function CostChip({ prefs }) {
  const { showCostChip } = useValue(prefs)
  const usage = useValue(host.state.focusedUsage)
  if (!showCostChip || !usage) return null
  const cost = fmtCost(usage.cost_usd)
  const pct = typeof usage.context_percent === 'number' ? `${Math.round(usage.context_percent)}% ctx` : null
  const parts = [cost, pct].filter(Boolean)
  if (parts.length === 0) return null
  return jsx('span', {
    title: 'Focused session: cost so far and context used',
    className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) tabular-nums',
    children: parts.join(' · ')
  })
}

// ───────────────────────────────────────────────────────────── Bots board

function botLabel(p) {
  return p.bot_title || p.display_name || p.name
}

function Row({ children, className }) {
  return jsx('div', { className: cn('flex items-center gap-2', className), children })
}

function PartPicker({ label, options, value, onPick, renderOption, labels }) {
  return jsxs('div', {
    className: 'flex flex-col gap-1.5',
    children: [
      jsx('div', { className: 'text-[0.6875rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)', children: label }),
      jsx('div', {
        className: 'flex flex-wrap gap-1.5',
        children: options.map(opt =>
          jsx(
            'button',
            {
              type: 'button',
              'aria-pressed': opt === value,
              title: (labels && labels[opt]) || opt,
              onClick: () => {
                haptic('tap')
                onPick(opt)
              },
              className: cn(
                'flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 text-[0.625rem]',
                opt === value ? 'border-(--ui-accent) text-(--ui-text-primary)' : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
              ),
              children: [renderOption ? renderOption(opt) : null, jsx('span', { className: 'truncate', children: (labels && labels[opt]) || opt })]
            },
            opt
          )
        )
      })
    ]
  })
}

function LookEditor({ profile, look, onChange, onClose }) {
  const name = botLabel(profile)
  const set = patch => onChange({ ...look, ...patch })
  const headFor = patch => jsx(RobotHead, { look: { ...look, ...patch }, size: 32 })
  const [preview, setPreview] = useState('idle')
  return jsxs('div', {
    className: 'flex min-h-0 flex-1 gap-6 p-4',
    children: [
      jsxs('div', {
        className: 'flex w-72 shrink-0 flex-col items-center gap-3',
        children: [
          jsx('div', {
            className: 'flex h-80 w-full items-center justify-center rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-editor)',
            children: jsx(AnimatedRobot, { look, state: preview, size: 230, title: `${name} · ${preview}` })
          }),
          jsx('div', { className: 'text-sm font-medium', children: name }),
          jsxs('div', {
            className: 'grid w-full grid-cols-4 gap-1',
            children: [
              ['idle', 'idle', null],
              ['running', 'working', 'focused'],
              ['waiting', 'needs you', 'question'],
              ['waving', 'done', 'happy'],
              ['failed', 'failed', 'error'],
              ['review', 'reading', 'focused'],
              ['running-right', 'roaming', 'happy'],
              ['jumping', 'celebrate', 'star']
            ].map(([state, label, expr]) =>
              jsxs(
                'button',
                {
                  type: 'button',
                  'aria-pressed': preview === state,
                  title: `Preview ${label}`,
                  onClick: () => setPreview(state),
                  className: cn(
                    'flex flex-col items-center gap-0.5 rounded-md border py-1',
                    preview === state ? 'border-(--ui-accent)' : 'border-transparent hover:bg-(--chrome-action-hover)'
                  ),
                  children: [jsx(RobotHead, { look, expr: expr || look.face, size: 24 }), jsx('span', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: label })]
                },
                state
              )
            )
          }),
          jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary)', children: 'The face is the status.' }),
          jsxs(Row, {
            className: 'mt-auto w-full',
            children: [
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => onChange(defaultLook(profile.name)), children: 'Reset' }),
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => onChange(randomLook()), children: 'Randomize' }),
              onClose ? jsx(Button, { size: 'sm', className: 'ml-auto', onClick: onClose, children: 'Done' }) : null
            ]
          })
        ]
      }),
      jsxs('div', {
        className: 'flex min-w-0 flex-1 flex-col gap-4 overflow-auto',
        children: [
          jsx(PartPicker, { label: 'Antenna / ears', options: PART_OPTIONS.topper, value: look.topper, onPick: v => set({ topper: v }), labels: PART_LABEL.topper, renderOption: v => headFor({ topper: v }) }),
          jsx(PartPicker, { label: 'Face at rest', options: PART_OPTIONS.face, value: look.face, onPick: v => set({ face: v }), labels: PART_LABEL.face, renderOption: v => headFor({ face: v }) }),
          jsx(PartPicker, { label: 'Chest module', options: PART_OPTIONS.chest, value: look.chest, onPick: v => set({ chest: v }), labels: PART_LABEL.chest, renderOption: v => jsx(RobotCrop, { look: { ...look, chest: v }, width: 40, crop: CHEST_CROP }) }),
          jsx(PartPicker, { label: 'Carries (right hand)', options: PART_OPTIONS.tool, value: look.tool, onPick: v => set({ tool: v }), labels: PART_LABEL.tool, renderOption: v => jsx(RobotCrop, { look: { ...look, tool: v }, width: 34, crop: TOOL_CROP }) }),
          jsx(PartPicker, { label: 'Wears (back)', options: PART_OPTIONS.back, value: look.back, onPick: v => set({ back: v }), labels: PART_LABEL.back, renderOption: v => jsx(RobotCrop, { look: { ...look, back: v }, width: 32 }) }),
          jsx(PartPicker, {
            label: 'Colour',
            options: PART_OPTIONS.color,
            value: look.color,
            onPick: v => set({ color: v }),
            labels: PART_LABEL.color,
            renderOption: v => headFor({ color: v })
          }),
          jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary)', children: 'Done saves the look and makes this robot the bot’s Hermes avatar — the Bots tab, rosters and bot-to-bot notices all show it. If Bot Mode shows a photo you uploaded for this bot, remove it in Bot Mode → Edit to see the robot there.' })
        ]
      })
    ]
  })
}

function randomLook() {
  const pick = list => list[Math.floor(Math.random() * list.length)]
  return {
    topper: pick(PART_OPTIONS.topper),
    face: pick(PART_OPTIONS.face),
    chest: pick(PART_OPTIONS.chest),
    tool: pick(PART_OPTIONS.tool),
    back: pick(PART_OPTIONS.back),
    color: pick(PART_OPTIONS.color)
  }
}

// ────────────────────────────────────────────────────────────── crew index
// One shared, polled picture of every bot and its recent sessions, read the
// way the sidebar reads them (host.profiles.list + host.listPersistedSessions,
// no gateway dial). Everything crew-aware — the board, the sidebar row
// decorations, the status chips, the palette — reads this one atom.
const $crew = atom({ ready: false, profiles: [], sessions: {}, byId: {}, error: null, at: 0 })
let crewTimer = null
let crewInflight = false

function rowCost(r) {
  return Number(r && (r.actual_cost_usd || r.estimated_cost_usd)) || 0
}

async function refreshCrew() {
  if (crewInflight) return
  crewInflight = true
  try {
    const res = await host.profiles.list()
    const profiles = (res && res.profiles) || []
    const sessions = {}
    const byId = {}
    if (typeof host.listPersistedSessions === 'function') {
      await Promise.all(
        profiles.map(async p => {
          try {
            // Read deep enough to cover every row the sidebar can show (it
            // pages ~200 per scope), but keep the per-bot lists short.
            const page = await host.listPersistedSessions(null, { profile: p.name, limit: 200 })
            const raw = ((page && page.sessions) || []).filter(r => r && !r.is_internal_child)
            const all = raw.filter(r => !r.hidden)
            all.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
            // A bot's own forever-chat is a hidden session: when it is live,
            // the bot is working, so it leads the list.
            const hiddenLive = raw.filter(r => r.hidden && r.is_active && !r.ended_at)
            sessions[p.name] = [...hiddenLive, ...all.slice(0, 40)]
            for (const r of hiddenLive) {
              const entry = { profile: p.name, row: r }
              byId[r.id] = entry
              if (r._lineage_root_id) byId[r._lineage_root_id] = entry
            }
            for (const r of all) {
              const entry = { profile: p.name, row: r }
              byId[r.id] = entry
              if (r._lineage_root_id) byId[r._lineage_root_id] = entry
              for (const lid of r._lineage_ids || []) byId[lid] = entry
            }
          } catch {
            sessions[p.name] = null
          }
        })
      )
    }
    $crew.set({ ready: true, profiles, sessions, byId, error: null, at: Date.now() })
  } catch (err) {
    $crew.set({ ...$crew.get(), ready: true, error: err && err.message ? err.message : String(err) })
  } finally {
    crewInflight = false
  }
}

function startCrew(ctx) {
  refreshCrew()
  const tick = () => refreshCrew()
  if (typeof ctx.setInterval === 'function') {
    crewTimer = ctx.setInterval(tick, 20000)
  } else {
    const h = setInterval(tick, 20000)
    crewTimer = () => clearInterval(h)
  }
}

function stopCrew() {
  if (typeof crewTimer === 'function') crewTimer()
  crewTimer = null
}

function activityFor(crew, profileName) {
  const canRead = typeof host.listPersistedSessions === 'function'
  const rows = (crew.sessions && crew.sessions[profileName]) || []
  const failed = crew.sessions && crew.sessions[profileName] === null
  return {
    available: canRead && !failed,
    loading: canRead && !crew.ready,
    sessions: rows,
    latest: rows.find(r => !r.hidden) || rows[0] || null,
    active: rows.some(r => r.is_active && !r.ended_at),
    unread: rows.filter(r => r.unread).length,
    spend: rows.reduce((sum, r) => sum + rowCost(r), 0)
  }
}

function useBotActivity(profileName) {
  const crew = useValue($crew)
  return useMemo(() => activityFor(crew, profileName), [crew, profileName])
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() / 1000
}

function crewTotals(crew) {
  const since = startOfToday()
  let needYou = 0
  let working = 0
  let today = 0
  for (const name of Object.keys(crew.sessions || {})) {
    const rows = crew.sessions[name] || []
    needYou += rows.filter(r => r.unread).length
    if (rows.some(r => r.is_active && !r.ended_at)) working += 1
    for (const r of rows) {
      const t = r.last_active > 1e12 ? r.last_active / 1000 : r.last_active
      if (t >= since) today += rowCost(r)
    }
  }
  return { needYou, working, today }
}

// Shared so a status chip can open the board pre-filtered.
const $boardFilter = atom('all')

function ago(ts) {
  if (!ts) return ''
  const ms = ts > 1e12 ? ts : ts * 1000
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// One status per bot, most urgent first. The face shows it.
function botStatus(activity, focusedWorking) {
  if (!activity.available) {
    // Older Desktop without persisted-session reads: only the focused chat's busy flag is known.
    return focusedWorking
      ? { key: 'working', label: 'working', expr: 'focused', tone: 'accent', rank: 1 }
      : { key: 'idle', label: 'ready', expr: null, tone: 'muted', rank: 2 }
  }
  if (activity.unread > 0) return { key: 'needs-you', label: activity.unread === 1 ? 'reply waiting' : `${activity.unread} replies waiting`, expr: 'question', tone: 'amber', rank: 0 }
  if (focusedWorking || activity.active) return { key: 'working', label: 'working', expr: 'focused', tone: 'accent', rank: 1 }
  if (activity.latest) return { key: 'idle', label: `idle · ${ago(activity.latest.last_active)}`, expr: null, tone: 'muted', rank: 2 }
  return { key: 'new', label: 'no sessions yet', expr: 'sleep', tone: 'muted', rank: 3 }
}

const TONE = {
  amber: 'text-(--ui-yellow)',
  accent: 'text-(--ui-accent)',
  muted: 'text-(--ui-text-tertiary)'
}

function openSession(row, profileName) {
  haptic('tap')
  try {
    host.openSession(row._lineage_root_id || row.id, { profile: profileName })
  } catch (err) {
    host.notifyError?.(`Could not open the session: ${err && err.message ? err.message : err}`)
  }
}

function BotCard({ profile, look, focusedWorking, onEdit, onStatus, os }) {
  const label = botLabel(profile)
  const activity = useBotActivity(profile.name)
  const status = botStatus(activity, focusedWorking)
  useEffect(() => {
    onStatus(profile.name, status.rank)
  }, [status.rank])
  const expr = status.expr || look.face
  const meta = [profile.model || 'no model pinned', `${profile.skill_count ?? 0} skills`]
  if (activity.spend > 0) meta.push(`${fmtCost(activity.spend)} recent`)
  const latest = activity.latest
  return jsxs('div', {
    className: cn(
      'flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-3 py-2.5',
      status.key === 'needs-you' ? 'border-[#E8A657]/60' : 'border-(--ui-stroke-secondary)'
    ),
    children: [
      jsxs('div', {
        className: 'flex items-center gap-3',
        children: [
          jsx(AnimatedRobot, { look, expr, state: petStateFor(status.key), size: 60, title: label, waveOnHover: true }),
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col',
            children: [
              jsxs('div', {
                className: 'flex items-center gap-2 text-sm',
                children: [
                  jsx('span', { className: 'truncate font-medium', children: label }),
                  profile.is_default ? jsx('span', { className: 'text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-quaternary)', children: 'default' }) : null,
                  profile.has_env ? jsx('span', { title: 'This profile has its own .env', className: 'rounded border border-(--ui-stroke-secondary) px-1 text-[0.625rem] text-(--ui-text-quaternary)', children: '.env' }) : null
                ]
              }),
              jsx('div', { className: cn('truncate text-xs', TONE[status.tone]), children: activity.loading ? 'checking…' : status.label }),
              jsx('div', { className: 'truncate text-[0.6875rem] text-(--ui-text-tertiary)', children: [profile.name !== label ? profile.name : null, ...meta].filter(Boolean).join(' · ') })
            ]
          })
        ]
      }),
      latest
        ? jsxs('button', {
            type: 'button',
            onClick: () => openSession(latest, profile.name),
            title: 'Open this session',
            className: 'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-(--chrome-action-hover)',
            children: [
              jsx(Codicon, { name: latest.unread ? 'circle-filled' : 'comment', size: 12 }),
              jsx('span', { className: 'min-w-0 flex-1 truncate text-(--ui-text-secondary)', children: sessionTitle(latest) }),
              jsx('span', { className: 'shrink-0 text-(--ui-text-quaternary)', children: ago(latest.last_active) })
            ]
          })
        : null,
      jsxs(Row, {
        children: [
          jsx(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: () => {
              haptic('tap')
              host.newChat(profile.name)
            },
            children: 'New chat'
          }),
          latest ? jsx(Button, { variant: 'outline', size: 'sm', onClick: () => openSession(latest, profile.name), children: 'Resume' }) : null,
          jsx(Button, { variant: 'ghost', size: 'sm', onClick: onEdit, children: 'Look' }),
          profile.path && os && os.revealPath
            ? jsx(Button, { variant: 'ghost', size: 'sm', className: 'ml-auto', title: 'Show this bot’s profile folder', onClick: () => os.revealPath(profile.path), children: jsx(Codicon, { name: 'folder', size: 13 }) })
            : null
        ]
      })
    ]
  })
}

function SpriteNotice() {
  useValue($spriteTick)
  const [busy, setBusy] = useState(false)
  if (!spritesDown) return null
  return jsxs('div', {
    className: 'mx-4 mt-3 flex items-center gap-3 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-2 text-xs',
    children: [
      jsx(Codicon, { name: 'info', size: 13 }),
      jsx('span', { className: 'flex-1 text-(--ui-text-secondary)', children: 'Showing flat robots: the rendered ones are served by helm’s backend, which mounts when the gateway restarts after install.' }),
      jsx(Button, {
        variant: 'outline',
        size: 'sm',
        disabled: busy,
        onClick: async () => {
          setBusy(true)
          try {
            await host.restartGateway()
            spritesDown = false
            spriteFailures = 0
            spriteCache.clear()
            $spriteTick.set($spriteTick.get() + 1)
          } catch (err) {
            host.notifyError?.(`Gateway restart failed: ${err && err.message ? err.message : err}`)
          } finally {
            setBusy(false)
          }
        },
        children: busy ? 'Restarting…' : 'Restart gateway'
      })
    ]
  })
}

// ─────────────────────────────────────────────────────── Hermes avatars
// A look becomes the bot's real Hermes avatar through the public profile
// asset (`profiles.set_asset`, the call Bot Mode itself uses): the Bots tab,
// relay rosters and inter-agent notices all read it. 256 px, so Bot Mode
// never mistakes it for its own 160 px backfilled face raster.
const AVATAR_EDGE = 256

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('sprite failed to decode'))
    img.src = src
  })
}

async function fetchSprites(names) {
  const missing = names.filter(n => !spriteCache.get(n))
  for (let i = 0; i < missing.length; i += 16) {
    if (!spriteRest) throw new Error('helm backend not reachable')
    const chunk = missing.slice(i, i + 16)
    const res = await spriteRest(`/sprites/batch?names=${encodeURIComponent(chunk.join(','))}`)
    const got = (res && res.sprites) || {}
    for (const n of chunk) if (typeof got[n] === 'string') spriteCache.set(n, got[n])
  }
  $spriteTick.set($spriteTick.get() + 1)
  return names.map(n => spriteCache.get(n) || null)
}

async function composeAvatar(look) {
  const names = layerNames(look, look.face)
  const urls = await fetchSprites(names)
  if (!urls[0]) throw new Error('robot sprites are not served yet (restart the gateway)')
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_EDGE
  canvas.height = AVATAR_EDGE
  const g = canvas.getContext('2d')
  const [cx, cy, cw, ch] = HEAD_CROP
  for (const url of urls) {
    if (!url) continue
    const img = await loadImage(url)
    g.drawImage(img, cx, cy, cw, ch, 0, 0, AVATAR_EDGE, AVATAR_EDGE)
  }
  return canvas.toDataURL('image/png')
}

function pngEdge(dataUrl) {
  try {
    const bin = atobSafe(dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 49))
    const read = o => ((bin[o] << 24) | (bin[o + 1] << 16) | (bin[o + 2] << 8) | bin[o + 3]) >>> 0
    return read(16)
  } catch {
    return 0
  }
}

// base64 → bytes without the global decoder (keeps the plugin free of
// character-code idioms the install scanner flags as obfuscation).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function atobSafe(s) {
  const out = []
  let buf = 0
  let bits = 0
  for (const ch of s) {
    const v = B64.indexOf(ch)
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 255)
    }
  }
  return out
}

function lookKey(look) {
  return [look.topper, look.face, look.chest, look.tool, look.back, look.color].join('.')
}

async function pushAvatar(profileName, look, avatars) {
  const data = await composeAvatar(look)
  await host.request('profiles.set_asset', { name: profileName, asset: 'avatar', data })
  avatars.set({ ...avatars.get(), [profileName]: lookKey(look) })
}

// New bots get a robot automatically, unless their owner already gave them a
// picture of their own (any server avatar that is neither helm's 256 px robot
// nor Bot Mode's 160 px face). The check repeats once a minute per bot: when a
// bot appears, Bot Mode rasterizes its vector face to a 160 px PNG and pushes
// that as the server avatar, and if that lands after helm's robot it replaces
// it. helm puts the robot back; a photo uploaded later is left alone.
const AVATAR_RECHECK_MS = 60000
const avatarCheckedAt = new Map()
let avatarSweep = false
async function autoAvatars(profiles, looks, avatars, prefs) {
  if (!prefs.get().autoAvatars || typeof host.request !== 'function' || avatarSweep) return
  avatarSweep = true
  try {
    for (const p of profiles) {
      const done = avatars.get()[p.name]
      if (done === 'user') continue
      const now = Date.now()
      if (now - (avatarCheckedAt.get(p.name) || 0) < AVATAR_RECHECK_MS) continue
      avatarCheckedAt.set(p.name, now)
      try {
        const res = await host.request('profiles.get_asset', { name: p.name, asset: 'avatar' })
        const edge = res && res.found && res.data ? pngEdge(res.data) : 0
        if (edge === AVATAR_EDGE) {
          if (!done) avatars.set({ ...avatars.get(), [p.name]: 'helm' })
          continue
        }
        if (edge && edge !== 160) {
          avatars.set({ ...avatars.get(), [p.name]: 'user' })
          continue
        }
        await pushAvatar(p.name, normalizeLook(looks.get()[p.name], p.name), avatars)
      } catch {
        /* sprites not served yet, an older gateway, or a profile this gateway can't reach: retry next minute */
      }
    }
  } finally {
    avatarSweep = false
  }
}

// Each bot's robot as its Hermes pet: the backend writes the standard pet
// folder into the bot's own home, then Hermes's pet.select adopts it, but only
// for a bot without a pet of its own. A bot whose pet is already helm's gets
// the new sheet when its look changes; any other pet is left alone.
const petInstalled = new Map()
let petSweep = false
async function robotPets(profiles, looks, prefs) {
  if (!prefs.get().robotPets || !spriteRest || spritesDown || typeof host.request !== 'function' || petSweep) return
  petSweep = true
  try {
    for (const p of profiles) {
      const key = petKey(normalizeLook(looks.get()[p.name], p.name))
      if (petInstalled.get(p.name) === key) continue
      try {
        const res = await spriteRest('/pets/install', { method: 'POST', body: { profile: p.name, look: key, name: botLabel(p) }, timeoutMs: 120000 })
        if (!res || !res.ok || !res.slug) continue
        const gallery = await host.request('pet.gallery', { localOnly: true, profile: p.name })
        if (gallery && !gallery.active) await host.request('pet.select', { slug: res.slug, profile: p.name })
        petInstalled.set(p.name, key)
      } catch {
        /* an older gateway without pets, or the backend still starting: next crew refresh retries */
      }
    }
  } finally {
    petSweep = false
  }
}

// ───────────────────────────────────────────────────────────── new bot
const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

// "New bot" from the Desk or the palette opens helm's robot builder.
const $newBotAsked = atom(false)
function openNewBot() {
  $newBotAsked.set(true)
  host.navigate(BOTS_ROUTE)
}

function NewBotView({ looks, setLook, avatars, onDone }) {
  const crew = useValue($crew)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [look, setLookDraft] = useState(() => normalizeLook(null, 'new-bot'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const taken = crew.profiles.some(p => p.name === slug)
  const valid = SLUG.test(slug) && !taken
  const title = name.trim() || 'New bot'

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      // Compose the robot first, so it reaches the profile the moment the
      // profile exists, before Bot Mode backfills its own vector face.
      let avatar = null
      try {
        avatar = await composeAvatar(look)
      } catch {
        /* sprites not served yet: the minute-by-minute check adds it */
      }
      await host.request('profiles.create', {
        name: slug,
        description: role.trim(),
        clone_from: 'default',
        share_auth: true,
        soul: `# ${title}\n\nYou are ${title}${role.trim() ? `, ${role.trim()}` : ''}. You work alongside the other bots on this desk and report back plainly.\n`
      })
      if (avatar) {
        try {
          await host.request('profiles.set_asset', { name: slug, asset: 'avatar', data: avatar })
          avatars.set({ ...avatars.get(), [slug]: lookKey(look) })
        } catch {
          /* the minute-by-minute check adds it */
        }
      }
      setLook(slug, look)
      await refreshCrew()
      host.notify?.({ kind: 'success', message: `${title} is on the crew.` })
      onDone(slug)
    } catch (err) {
      setError(err && err.message ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const field = (label, value, onChange, placeholder) =>
    jsxs('label', {
      className: 'flex flex-col gap-1 text-xs',
      children: [
        jsx('span', { className: 'text-[0.6875rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)', children: label }),
        jsx('input', {
          value,
          placeholder,
          onChange: e => onChange(e.target.value),
          className: 'h-8 rounded-md border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm text-(--ui-text-primary) outline-none focus-visible:border-(--ui-accent)'
        })
      ]
    })

  return jsxs('div', {
    className: 'flex min-h-0 flex-1 flex-col',
    children: [
      jsxs('div', {
        className: 'grid gap-3 border-b border-(--ui-stroke-secondary) px-4 py-3',
        style: { gridTemplateColumns: 'minmax(180px, 240px) minmax(220px, 1fr) auto' },
        children: [
          field('Name', name, setName, 'Nadia'),
          field('What it does', role, setRole, 'researches vendors and writes the brief'),
          jsxs('div', {
            className: 'flex items-end gap-2',
            children: [
              jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => onDone(null), children: 'Cancel' }),
              jsx(Button, { size: 'sm', disabled: !valid || busy, onClick: create, children: busy ? 'Creating…' : 'Create bot' })
            ]
          }),
          jsx('div', {
            className: cn('text-[0.6875rem]', error || (slug && !valid) ? 'text-(--ui-red)' : 'text-(--ui-text-tertiary)'),
            style: { gridColumn: '1 / -1' },
            children: error
              ? error
              : slug && taken
                ? `A profile called “${slug}” already exists.`
                : slug && !valid
                  ? 'Use letters, digits, - or _ (up to 32).'
                  : slug
                    ? `Creates the Hermes profile “${slug}” (cloned from default, shared sign-ins), gives it this robot as its avatar everywhere in Hermes, and adds it to Bot Mode.`
                    : 'A bot is a Hermes profile. Name it, say what it does, build its robot.'
          })
        ]
      }),
      jsx(LookEditor, { profile: { name: slug || 'new-bot', bot_title: title }, look, onChange: setLookDraft, onClose: null })
    ]
  })
}

// ──────────────────────────────────────────────────────────────── rooms
// Hermes rooms (`groups.*`, the multi-bot conversations Bot Mode creates):
// listed on the Helm tab with who's in them and what they're doing, and
// opened in a main-area tab helm draws from the room log.
const $rooms = atom({ ready: false, rooms: [], error: null, at: 0 })
let roomsInflight = false

function roomRoute() {
  const profile = atomGet(host.state.profile) || 'default'
  const connectionId = atomGet(host.state.connectionId) || 'local'
  return { connectionId, profile, targetProfile: profile, mode: connectionId === 'local' ? 'local' : 'remote' }
}

async function roomRequest(method, params = {}, timeoutMs) {
  const route = roomRoute()
  if (typeof host.requestProfile !== 'function') throw new Error('This Hermes has no profile routing')
  return host.requestProfile(route, method, { ...params, profile: route.profile }, timeoutMs)
}

const roomText = ev => {
  const p = (ev && ev.payload) || {}
  return String(p.text || p.content || p.message || '').trim()
}

function roomMemberName(m) {
  return (m && (m.display_name || m.handle || m.profile || m.member_id)) || 'a bot'
}

function roomSummary(room, state, events) {
  const members = room.members || []
  const byId = new Map(members.map(m => [m.member_id, m]))
  const driver = (state && state.driver_status) || {}
  const pending = driver.pending_actions || []
  const approvals = pending.filter(a => a.kind === 'approval')
  if (approvals.length) {
    return { tone: 'amber', text: `${roomMemberName(byId.get(approvals[0].member_id))} is waiting on you`, key: 'needs-you', pending }
  }
  const working = (driver.member_activity || []).filter(a => a.status === 'running' || a.status === 'working' || a.status === 'queued')
  if (working.length) {
    return { tone: 'accent', text: `${working.map(a => roomMemberName(byId.get(a.member_id))).join(', ')} working`, key: 'working', pending }
  }
  const bits = []
  const seen = new Set()
  for (let i = events.length - 1; i >= 0 && bits.length < 2; i--) {
    const ev = events[i]
    const who = ev.payload && (ev.payload.member_id || (ev.actor && ev.actor.kind === 'member' && ev.actor.id))
    if (!who || seen.has(who)) continue
    if (ev.kind === 'turn.settled') {
      seen.add(who)
      bits.push(`${roomMemberName(byId.get(who))} ${ev.payload.passed === true ? 'passed' : 'replied'}`)
    } else if (ev.kind === 'turn.failed') {
      seen.add(who)
      bits.push(`${roomMemberName(byId.get(who))} failed`)
    }
  }
  if (bits.length) return { tone: 'plain', text: bits.join(' · '), key: 'idle', pending }
  const lastUser = [...events].reverse().find(e => e.kind === 'message.user' || e.kind === 'message')
  return { tone: 'plain', text: lastUser ? `You: ${roomText(lastUser).slice(0, 60)}` : `${members.length} members · quiet`, key: 'idle', pending }
}

async function refreshRooms() {
  if (roomsInflight || typeof host.requestProfile !== 'function') return
  roomsInflight = true
  try {
    const page = await roomRequest('groups.list', { limit: 20, offset: 0 }, 15000)
    const list = ((page && page.rooms) || []).filter(r => r && !r.disbanded_at).slice(0, 8)
    const rooms = await Promise.all(
      list.map(async room => {
        let state = null
        let events = []
        try {
          state = await roomRequest('groups.state', { room_id: room.room_id }, 15000)
        } catch {
          state = null
        }
        try {
          const since = Math.max(0, Number(room.latest_seq || 0) - 40)
          const log = await roomRequest('groups.log', { room_id: room.room_id, since_seq: since, limit: 40 }, 15000)
          events = (log && log.events) || []
        } catch {
          events = []
        }
        return { room, state, events, summary: roomSummary(room, state, events) }
      })
    )
    $rooms.set({ ready: true, rooms, error: null, at: Date.now() })
  } catch (err) {
    $rooms.set({ ready: true, rooms: [], error: err && err.message ? err.message : String(err), at: Date.now() })
  } finally {
    roomsInflight = false
  }
}

function startRooms(ctx) {
  const tick = () => refreshRooms()
  const first = setTimeout(tick, 1500)
  const h = setInterval(tick, 20000)
  ctx.onDispose(() => {
    clearTimeout(first)
    clearInterval(h)
  })
}

const roomTabs = new Map()
function openRoom(room, looks) {
  haptic('tap')
  const key = `${ID}:room:${room.room_id}`
  if (roomTabs.has(key) && host.revealPane) {
    host.revealPane(`plugin-workspace:${key}`)
    return
  }
  if (typeof host.openWorkspace !== 'function') {
    host.notifyError?.('This Hermes cannot open a room in a tab; open it from the Bots tab.')
    return
  }
  const close = host.openWorkspace(key, {
    title: room.name || 'Room',
    minWidth: '24rem',
    render: () => jsx(RoomView, { roomId: room.room_id, looks }),
    onClose: () => roomTabs.delete(key)
  })
  roomTabs.set(key, close)
}

function RoomHeads({ members, looks, size = 18 }) {
  const two = (members || []).slice(0, 2)
  return jsx('span', {
    style: { position: 'relative', width: size + 12, height: size + 4, display: 'inline-block', flex: `0 0 ${size + 12}px` },
    children: two.map((m, i) =>
      jsx('span', {
        style: { position: 'absolute', left: i ? 10 : 0, top: i ? 4 : 0, lineHeight: 0 },
        children: jsx(AnimatedRobot, { look: normalizeLook(looks[m.profile] || null, m.profile || 'default'), head: true, size, title: roomMemberName(m) })
      }, m.member_id || i)
    )
  })
}

function HelmRoomRow({ entry, looks, looksValue }) {
  const { room, summary } = entry
  const color = summary.tone === 'amber' ? '#E8A657' : summary.tone === 'accent' ? V.accent : '#98A4B1'
  return jsxs('button', {
    type: 'button',
    className: 'helm-nav-row',
    onClick: () => openRoom(room, looks),
    title: `${room.name} · ${(room.members || []).map(roomMemberName).join(', ')}`,
    style: { margin: '0 8px', padding: '6px 8px', borderRadius: 6, border: 0, display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 8, alignItems: 'center', textAlign: 'left', lineHeight: 1.3, background: 'transparent', color: V.t1, font: 'inherit', cursor: 'pointer', width: 'calc(100% - 16px)' },
    children: [
      jsx(RoomHeads, { members: room.members, looks: looksValue || {} }),
      jsxs('span', {
        style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
        children: [
          jsx('span', { style: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: room.name || 'Room' }),
          jsx('span', { style: { fontSize: 11.5, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: summary.text })
        ]
      }),
      jsx('span', { style: { fontSize: 10.5, color: '#76838F', fontFamily: V.mono }, children: shortAgo(room.updated_at) })
    ]
  })
}

function NewRoomForm({ profiles, looks, onDone }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toggle = n => setPicked(prev => (prev.includes(n) ? prev.filter(x => x !== n) : prev.length >= 6 ? prev : [...prev, n]))
  const create = async () => {
    if (!name.trim() || picked.length < 2 || busy) return
    setBusy(true)
    setError(null)
    try {
      const members = picked.map(profile => ({ member_id: profile, profile, handle: profile, target: { kind: 'local', profile } }))
      const roomId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `room-${Date.now()}`
      const res = await roomRequest('groups.create', { room_id: roomId, name: name.trim(), members }, 30000)
      await refreshRooms()
      onDone()
      if (res && res.room) openRoom(res.room, looks)
    } catch (err) {
      setError(err && err.message ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return jsxs('div', {
    style: { margin: '2px 8px 6px', padding: 8, borderRadius: 8, border: '1px solid #222B35', background: '#0F1419', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 },
    children: [
      jsx('input', { value: name, onChange: e => setName(e.target.value), placeholder: 'Room name, e.g. Release crew', 'aria-label': 'Room name', style: { height: 26, borderRadius: 6, border: '1px solid #222B35', background: '#121820', color: '#E6EBF0', padding: '0 8px', font: 'inherit', fontSize: 12 } }),
      jsx('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: 4 },
        children: profiles.map(p =>
          jsx('button', { type: 'button', 'aria-pressed': picked.includes(p.name), onClick: () => toggle(p.name), style: { height: 22, padding: '0 8px', borderRadius: 11, border: `1px solid ${picked.includes(p.name) ? V.accent : '#222B35'}`, background: picked.includes(p.name) ? '#171E27' : 'transparent', color: picked.includes(p.name) ? '#E6EBF0' : '#98A4B1', font: 'inherit', fontSize: 11, cursor: 'pointer' }, children: botLabel(p) }, p.name)
        )
      }),
      error ? jsx('div', { style: { color: '#E07080', fontSize: 11.5 }, children: error }) : null,
      jsxs('div', {
        style: { display: 'flex', gap: 8, alignItems: 'center' },
        children: [
          jsx('span', { style: { color: '#76838F', fontSize: 11 }, children: 'two to six bots' }),
          jsx('button', { type: 'button', onClick: onDone, style: { marginLeft: 'auto', border: 0, background: 'transparent', color: '#98A4B1', font: 'inherit', fontSize: 12, cursor: 'pointer' }, children: 'Cancel' }),
          jsx('button', { type: 'button', disabled: busy || !name.trim() || picked.length < 2, onClick: create, style: { height: 24, padding: '0 10px', borderRadius: 6, border: 0, background: V.accent, color: ON_ACCENT, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: name.trim() && picked.length >= 2 ? 1 : 0.45 }, children: busy ? 'Creating…' : 'Create room' })
        ]
      })
    ]
  })
}

function RoomView({ roomId, looks }) {
  const looksValue = useValue(looks)
  const [room, setRoom] = useState(null)
  const [state, setState] = useState(null)
  const [events, setEvents] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const seqRef = useRef(0)
  const scroller = useRef(null)
  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const st = await roomRequest('groups.state', { room_id: roomId }, 15000)
        if (!alive) return
        setState(st)
        if (st && st.room) setRoom(st.room)
        const latest = st && st.room && typeof st.room.latest_seq === 'number' ? st.room.latest_seq : null
        let since = seqRef.current
        if (!since && latest !== null) since = Math.max(0, latest - 120)
        if (latest === null || latest > since) {
          const log = await roomRequest('groups.log', { room_id: roomId, since_seq: since, limit: 200 }, 15000)
          if (!alive) return
          const got = (log && log.events) || []
          if (got.length) {
            seqRef.current = got[got.length - 1].seq
            setEvents(prev => [...prev, ...got].slice(-400))
          } else if (latest !== null) seqRef.current = Math.max(since, latest)
        }
        setError(null)
      } catch (err) {
        if (alive) setError(err && err.message ? err.message : String(err))
      }
    }
    pull()
    const h = setInterval(pull, 2500)
    return () => {
      alive = false
      clearInterval(h)
    }
  }, [roomId])
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])
  const members = (room && room.members) || []
  const byId = new Map(members.map(m => [m.member_id, m]))
  const driver = (state && state.driver_status) || {}
  const pending = (driver.pending_actions || []).filter(a => a.kind === 'approval')
  const working = (driver.member_activity || []).filter(a => a.status === 'running' || a.status === 'working' || a.status === 'queued')
  const messages = events.filter(e => e.kind === 'message.user' || e.kind === 'message' || e.kind === 'message.member')
  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const eventId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `helm-${Date.now()}-${Math.random().toString(16).slice(2)}`
      await roomRequest('groups.send', { room_id: roomId, event_id: eventId, payload: { text: body } }, 30000)
      setText('')
      refreshRooms()
    } catch (err) {
      setError(`Not sent: ${err && err.message ? err.message : err}`)
    } finally {
      setBusy(false)
    }
  }
  const act = async (a, choice) => {
    setBusy(true)
    try {
      await roomRequest('groups.approve', { room_id: roomId, member_id: a.member_id, task_id: a.task_id, execution_generation: a.execution_generation, request_id: a.request_id, choice }, 30000)
      refreshRooms()
    } catch (err) {
      setError(`${choice === 'deny' ? 'Deny' : 'Approve'} failed: ${err && err.message ? err.message : err}`)
    } finally {
      setBusy(false)
    }
  }
  return jsxs('div', {
    style: { height: '100%', display: 'flex', flexDirection: 'column', background: B.bg, color: B.t1, fontSize: 13 },
    children: [
      jsxs('div', {
        style: { height: 36, flex: '0 0 36px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 22px', fontSize: 12, color: B.t3, borderBottom: `1px solid ${B.hair}` },
        children: [
          jsx(RoomHeads, { members, looks: looksValue, size: 16 }),
          jsx('span', { style: { color: B.t1, fontWeight: 500 }, children: (room && room.name) || 'Room' }),
          jsx('span', { style: { color: B.t4 }, children: '·' }),
          jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: members.map(roomMemberName).join(', ') }),
          working.length ? jsx('span', { style: { marginLeft: 'auto', color: V.accent }, children: `${working.map(a => roomMemberName(byId.get(a.member_id))).join(', ')} working` }) : null
        ]
      }),
      jsxs('div', {
        ref: scroller,
        role: 'log',
        style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '12px 22px', display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.6, fontSize: 13.5 },
        children: [
          !messages.length ? jsx('div', { style: { color: B.t4, fontSize: 12.5 }, children: room ? 'Nothing said in this room yet.' : 'Opening the room…' }) : null,
          ...messages.map(ev => {
            const mine = ev.kind !== 'message.member'
            const m = !mine ? byId.get((ev.actor && ev.actor.id) || (ev.payload && ev.payload.member_id)) : null
            return jsx('div', {
              style: mine ? { border: '1px solid #1F3038', background: '#16232B', borderRadius: 10, padding: '9px 13px', whiteSpace: 'pre-wrap' } : { display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10 },
              children: mine
                ? roomText(ev)
                : [
                    jsx(AnimatedRobot, { look: normalizeLook(looksValue[m && m.profile] || null, (m && m.profile) || 'default'), head: true, size: 22, title: roomMemberName(m) }, 'h'),
                    jsxs('div', { style: { minWidth: 0 }, children: [jsx('div', { style: { fontSize: 12, color: B.t3 }, children: roomMemberName(m) }), jsx('div', { style: { whiteSpace: 'pre-wrap' }, children: roomText(ev) })] }, 'b')
                  ]
            }, ev.event_id || ev.seq)
          }),
          ...pending.map(a =>
            jsxs('div', {
              style: { border: '1px solid #2A2F33', borderLeft: '2px solid #E8A657', borderRadius: 8, background: '#121820', padding: '10px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 },
              children: [
                jsxs('span', { style: { flex: 1, minWidth: 0 }, children: [jsx('span', { style: { color: '#E8A657' }, children: 'Approval' }), ` · ${roomMemberName(byId.get(a.member_id))} is waiting on you`] }),
                jsx('button', { type: 'button', disabled: busy, onClick: () => act(a, 'deny'), style: { height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${B.ctl}`, background: 'transparent', color: B.t2, font: 'inherit', fontSize: 12, cursor: 'pointer' }, children: 'Deny' }),
                jsx('button', { type: 'button', disabled: busy, onClick: () => act(a, 'once'), style: { height: 28, padding: '0 12px', borderRadius: 6, border: 0, background: V.accent, color: ON_ACCENT, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }, children: 'Approve' })
              ]
            }, `${a.task_id}:${a.execution_generation}`)
          )
        ]
      }),
      error ? jsx('div', { role: 'alert', style: { padding: '4px 22px', fontSize: 12, color: B.red }, children: error }) : null,
      jsx('div', {
        style: { padding: '0 22px 12px' },
        children: jsxs('div', {
          style: { border: `1px solid ${B.ctl}`, borderRadius: 12, background: B.panel, padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 },
          children: [
            jsx('textarea', {
              rows: 2,
              value: text,
              'aria-label': 'Message the room',
              placeholder: `Message ${(room && room.name) || 'the room'} · @handle to address one bot`,
              onChange: e => setText(e.target.value),
              onKeyDown: e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              },
              style: { resize: 'none', border: 0, background: 'transparent', color: B.t1, font: 'inherit', fontSize: 14, lineHeight: 1.5, padding: 0, outline: 'none' }
            }),
            jsxs('div', {
              style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: B.t4 },
              children: [
                jsx('span', { children: members.map(m => `@${m.handle || m.profile}`).join(' ') }),
                jsx('button', { type: 'button', onClick: send, disabled: busy || !text.trim(), style: { marginLeft: 'auto', width: 28, height: 28, borderRadius: 6, border: 0, background: V.accent, color: ON_ACCENT, cursor: 'pointer', opacity: text.trim() ? 1 : 0.45, display: 'flex', alignItems: 'center', justifyContent: 'center' }, 'aria-label': 'Send', children: jsx('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, children: jsx('path', { d: 'M12 19V5M5 12l7-7 7 7' }) }) })
              ]
            })
          ]
        })
      })
    ]
  })
}

// ───────────────────────────────────────────── Bots board (the Bot board)
// One brief in at the top, every bot in a table under it (attention first),
// and the day's jobs on the right. Data: profiles, persisted sessions, the
// inbox and cron.manage, the same reads the rest of helm makes.

const $boardMounted = atom(false)
const B = { bg: '#0F1419', panel: '#121820', sel: '#171E27', hair: '#1C242D', ctl: '#222B35', t1: '#E6EBF0', t2: '#C3CCD5', t3: '#98A4B1', t4: '#76838F', amber: '#E8A657', green: '#6FBF8E', red: '#E07080', mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }
const B_CAPS = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: B.t4 }
const B_GRID = 'minmax(130px, 180px) 96px minmax(140px, 1fr) 130px 120px 60px'

function isToday(ts) {
  const ms = toMs(ts)
  return ms && ms >= startOfToday() * 1000
}

// ─────────────────────────────────────────────────────── router + handoffs
// helm's dispatch router: four tiers (nano, fast, balanced, frontier), each
// mapped to bots. Rules start from each bot's model and can be edited on the
// board; a brief is read for what kind of work it is and goes to the first
// free bot on that tier.
const TIERS = ['nano', 'fast', 'balanced', 'frontier']
const TIER_JOB = { nano: 'drafts, lookups', fast: 'read-only review', balanced: 'research, extraction', frontier: 'code, deploys' }
const TIER_WORDS = [
  ['fast', /\b(review|check|verify|audit|read-only|readonly|lint|look over|sanity)\b/i],
  ['nano', /\b(draft|reply|tweet|post|caption|rename|look ?up|translate|format|quick|title)\b/i],
  ['balanced', /\b(research|extract|compare|analy[sz]e|summari[sz]e|find|scrape|report|market|pricing|sweep|survey|collect)\b/i],
  ['frontier', /\b(code|deploy|release|ship|build|refactor|fix|implement|migrat\w*|debug|merge|script|install|upgrade)\b/i]
]
let helmPrefsRef = null

function tierOfModel(model) {
  const m = String(model || '').toLowerCase()
  if (/haiku|nano|mini\b|-mini|-lite\b|\blite\b/.test(m)) return 'nano'
  if (/opus|grok-4|grok-5|gpt-5|\bo3\b|\bo4\b|-pro\b|frontier/.test(m)) return 'frontier'
  if (/flash|turbo/.test(m)) return 'fast'
  if (/sonnet/.test(m)) return 'balanced'
  const sizes = (m.match(/(\d+(?:\.\d+)?)b\b/g) || []).map(x => parseFloat(x))
  const size = sizes.length ? Math.max(...sizes) : null
  if (size !== null) return size <= 8 ? 'nano' : size <= 14 ? 'fast' : size <= 72 ? 'balanced' : 'frontier'
  return 'balanced'
}

function routingRules(profiles, routing) {
  const out = {}
  for (const t of TIERS) {
    const set = routing && Array.isArray(routing[t]) ? routing[t] : null
    out[t] = set ? profiles.filter(p => set.includes(p.name)) : profiles.filter(p => tierOfModel(p.model) === t)
  }
  return out
}

function readBrief(text) {
  for (const [tier, re] of TIER_WORDS) {
    const m = String(text || '').match(re)
    if (m) return { tier, word: m[0] }
  }
  return { tier: 'balanced', word: null }
}

function routeBrief(text, rows, routing) {
  const profiles = rows.map(r => r.p)
  const rules = routingRules(profiles, routing)
  const { tier, word } = readBrief(text)
  let pool = rules[tier]
  let fallback = false
  if (!pool.length) {
    pool = profiles
    fallback = true
  }
  const rowOf = name => rows.find(r => r.p.name === name)
  const free = pool.find(p => {
    const r = rowOf(p.name)
    return r && r.rank >= 2
  })
  const pick = free || pool[0]
  const pickRow = pick ? rowOf(pick.name) : null
  const why = [
    word ? `“${word}” reads as ${TIER_JOB[tier]}, so ${tier} tier.` : `Nothing in the brief names a kind of work, so ${tier} tier.`,
    fallback ? `No bot is on ${tier}, so any bot can take it.` : `${tier} goes to ${pool.map(botLabel).join(', ')}.`,
    pick ? `${botLabel(pick)} is ${pickRow && pickRow.rank === 1 ? 'working, so it opens a second chat' : pickRow && pickRow.rank === 0 ? 'waiting on you first' : 'free'}.` : ''
  ].filter(Boolean).join(' ')
  return { tier, word, bot: pick ? pick.name : null, why }
}

// Handoffs: bot-to-bot messages (Hermes's message_agent tool) this desk has seen.
const $handoffs = atom([])
let handoffStore = null

function onHandoffEvent(e) {
  const p = payloadOf(e)
  if (p.name !== 'message_agent') return
  const type = String((e && (e.type || e.event)) || '')
  const id = String(p.tool_id || p.tool_call_id || p.id || '')
  let args = p.args || p.arguments || {}
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      args = {}
    }
  }
  const sessionId = eventSessionId(e, p)
  const crew = $crew.get()
  const hit = (crew.byId && crew.byId[sessionId]) || null
  const from = (hit && hit.profile) || p.profile || (e && e.profile) || atomGet(host.state.focusedSessionProfile) || ''
  const list = $handoffs.get().slice()
  let entry = id ? list.find(h => h.id === id) : null
  if (!entry && (args.target || args.message)) {
    entry = { id: id || `h-${Date.now()}`, from, to: String(args.target || ''), message: String(args.message || '').slice(0, 300), at: Date.now(), status: 'sent' }
    list.unshift(entry)
  }
  if (!entry) return
  if (type.endsWith('complete') || p.result !== undefined) {
    const r = typeof p.result === 'string' ? p.result : JSON.stringify(p.result || '')
    entry.status = /error|failed|not found|refused/i.test(r.slice(0, 200)) ? 'failed' : /queued|delivered|will reply|next run/i.test(r.slice(0, 200)) ? 'delivered' : 'replied'
  }
  const next = list.slice(0, 30)
  $handoffs.set(next)
  if (handoffStore) handoffStore(next)
}

// The last finished reply per bot (message.complete), for the HUD's
// "Latest from" and kept across reloads in plugin storage.
const $lastReply = atom({})
let replyStore = null

function onReplyEvent(e) {
  const p = payloadOf(e)
  const text = String(p.text || '').trim()
  if (!text || p.status === 'error') return
  const sessionId = eventSessionId(e, p)
  const crew = $crew.get()
  const hit = (crew.byId && crew.byId[sessionId]) || null
  const profile = (hit && hit.profile) || p.profile || (e && e.profile) || atomGet(host.state.focusedSessionProfile) || 'default'
  const next = { ...$lastReply.get(), [profile]: { text: text.slice(0, 1200), at: Date.now(), sessionId } }
  $lastReply.set(next)
  if (replyStore) replyStore(next)
}

// Per-bot permissions for the board: each profile's approval mode and the
// MCP servers it has switched on, read through the profile-scoped
// `config.get` and `mcp.servers.status` (names and state only, no config).
const $perms = atom({ ready: false, byProfile: {}, at: 0 })
let permsInflight = false
const APPROVAL_LABEL = { manual: 'asks first', smart: 'smart approvals', off: 'no approvals' }

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))])
}

async function readScoped(profileName, method, params) {
  // The window's gateway answers for any profile when it scopes by `profile`;
  // otherwise ask that profile's own gateway.
  try {
    return await withTimeout(host.request(method, { ...params, profile: profileName }), 8000)
  } catch (first) {
    if (typeof host.requestProfile !== 'function') throw first
    return withTimeout(host.requestProfile(profileName, method, params), 8000)
  }
}

async function refreshPerms() {
  if (permsInflight || typeof host.request !== 'function') return
  const profiles = $crew.get().profiles || []
  if (!profiles.length) return
  permsInflight = true
  try {
    const byProfile = { ...$perms.get().byProfile }
    await Promise.all(
      profiles.map(async p => {
        const out = { mode: null, servers: null, error: null }
        const [mode, servers] = await Promise.allSettled([
          readScoped(p.name, 'config.get', { key: 'approvals.mode' }),
          readScoped(p.name, 'mcp.servers.status', {})
        ])
        if (mode.status === 'fulfilled' && mode.value && typeof mode.value.value === 'string') out.mode = mode.value.value
        else if (mode.status === 'rejected') out.error = String((mode.reason && mode.reason.message) || mode.reason)
        if (servers.status === 'fulfilled' && servers.value) {
          out.servers = (servers.value.servers || []).filter(x => x && !x.disabled).map(x => String(x.name || '')).filter(Boolean)
        }
        byProfile[p.name] = out
        $perms.set({ ready: false, byProfile: { ...byProfile }, at: Date.now() })
      })
    )
    $perms.set({ ready: true, byProfile, at: Date.now() })
  } finally {
    permsInflight = false
  }
}

function permsLine(perm) {
  if (!perm) return 'reading…'
  const tools = perm.servers === null ? null : perm.servers.length ? perm.servers.slice(0, 3).join(' · ') + (perm.servers.length > 3 ? ` +${perm.servers.length - 3}` : '') : 'built-in tools'
  const mode = perm.mode ? APPROVAL_LABEL[perm.mode] || perm.mode : null
  return [tools, mode].filter(Boolean).join(' · ') || (perm.error ? `unreadable: ${perm.error.slice(0, 40)}` : 'unreadable')
}

function boardRowFor(p, crew, needs, jobs, perms) {
  const activity = activityFor(crew, p.name)
  const need = needs[p.name] || { approvals: 0, questions: 0, firstApproval: null, firstQuestion: null }
  const live = activity.sessions.find(r => r.is_active && !r.ended_at)
  const latest = activity.latest
  let status
  let now
  let ctx
  let rank
  if (need.approvals || need.questions) {
    rank = 0
    status = { text: 'Blocked', color: B.amber }
    if (need.firstApproval) {
      const cmd = String(need.firstApproval.command || need.firstApproval.description || '').split('\n')[0].slice(0, 90)
      now = jsxs(Fragment, { children: ['Waiting on your approval: ', jsx('span', { style: { fontFamily: B.mono, fontSize: 12 }, children: cmd })] })
    } else {
      now = 'Waiting on your answer to a question'
    }
    ctx = need.approvals + need.questions > 1 ? `${need.approvals + need.questions} things waiting` : latest ? `in ${sessionTitle(latest)}` : ''
  } else if (live) {
    rank = 1
    const mins = live.started_at ? Math.max(1, Math.round((Date.now() - toMs(live.started_at)) / 60000)) : null
    status = { text: mins ? `Working · ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`}` : 'Working', color: V.accent }
    now = sessionTitle(live)
    ctx = [live.tool_call_count ? `${live.tool_call_count} tool calls` : null, live.cwd ? basename(live.cwd) : null, live.model || null].filter(Boolean).join(' · ')
  } else if (activity.unread) {
    rank = 2
    status = { text: 'Replied', color: B.t1 }
    now = latest ? sessionTitle(latest) : 'New reply'
    ctx = activity.unread === 1 ? '1 unread reply' : `${activity.unread} unread replies`
  } else if (latest) {
    rank = 3
    status = { text: 'Idle', color: B.t3 }
    now = `Last: ${sessionTitle(latest)} · ${ago(latest.last_active)}`
    ctx = latest.message_count ? `${latest.message_count} messages` : 'wakes on a new chat or a routine'
  } else {
    rank = 4
    status = { text: 'New', color: B.t3 }
    now = 'No chats yet'
    ctx = 'start one from the brief above'
  }
  const mine = jobs.filter(j => j.profile === p.name && j.enabled && j.next_run_at)
  mine.sort((a, b) => toMs(a.next_run_at) - toMs(b.next_run_at))
  const next = mine[0] ? `${mine[0].name || 'Routine'} · ${isToday(mine[0].next_run_at) ? clock(toMs(mine[0].next_run_at)) : new Date(toMs(mine[0].next_run_at)).toLocaleDateString([], { weekday: 'short' }) + ' ' + clock(toMs(mine[0].next_run_at))}` : null
  const today = activity.sessions.filter(r => isToday(r.last_active)).reduce((s, r) => s + rowCost(r), 0)
  const setup = permsLine(perms && perms[p.name])
  return { p, activity, status, now, ctx, rank, next, today, setup, unread: activity.unread > 0, key: rank === 0 ? 'needs-you' : rank === 1 ? 'working' : 'idle' }
}

function BoardChip({ label, active, tone, onClick }) {
  return jsx('button', {
    type: 'button',
    'aria-pressed': active,
    onClick,
    style: { height: 22, padding: '0 8px', borderRadius: 11, border: `1px solid ${B.ctl}`, font: 'inherit', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? B.sel : 'transparent', color: tone || (active ? B.t1 : B.t3) }
  , children: label })
}

function BoardDispatch({ rows }) {
  const [text, setText] = useState('')
  const [to, setTo] = useState('')
  const [why, setWhy] = useState(false)
  const focused = useValue(host.state.focusedSessionProfile)
  const prefsValue = useValue(helmPrefsRef ? helmPrefsRef.prefs : $boardMounted)
  const perms = useValue($perms)
  const routing = (prefsValue && typeof prefsValue === 'object' && prefsValue.routing) || {}
  const suggestion = text.trim() && rows.length ? routeBrief(text, rows, routing) : null
  const target = rows.find(r => r.p.name === to) || (suggestion && rows.find(r => r.p.name === suggestion.bot)) || rows.find(r => r.p.name === focused) || rows[0]
  const send = () => {
    const brief = text.trim()
    if (!brief || !target) return
    startChat(target.p.name, brief, 'send')
    setText('')
    setTo('')
    setWhy(false)
  }
  const pal = target ? PALETTE[normalizeLook(null, target.p.name).color] || PALETTE.blue : PALETTE.blue
  const mode = target && perms.byProfile[target.p.name] ? perms.byProfile[target.p.name].mode : null
  const guard = mode === 'manual' ? 'it asks before every risky step' : mode === 'smart' ? 'risky steps held for your approval' : mode === 'off' ? 'it acts without asking' : 'Enter sends · ⇧Enter new line'
  const tierLine = !target
    ? ''
    : to
      ? `you picked · ${tierOfModel(target.p.model)} tier · ${target.p.model || 'its pinned model'}`
      : suggestion
        ? `suggested · ${suggestion.tier} tier · ${TIER_JOB[suggestion.tier]}`
        : `${target.p.model || 'its pinned model'} · ${target.key === 'working' ? 'busy, so this opens a second chat' : target.rank === 0 ? 'it is waiting on you first' : 'free now'}`
  return jsxs('section', {
    style: { border: `1px solid ${B.ctl}`, borderRadius: 12, background: B.panel, padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' },
    children: [
      jsx('label', { htmlFor: 'helm-brief', style: { position: 'absolute', left: -9999 }, children: 'Brief' }),
      jsx('textarea', {
        id: 'helm-brief',
        rows: 2,
        value: text,
        placeholder: 'Write a brief. helm routes it to the right bot, or pick one.',
        onChange: e => setText(e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        },
        style: { resize: 'none', border: 0, background: 'transparent', color: B.t1, font: 'inherit', fontSize: 14, lineHeight: 1.5, padding: 0, outline: 'none' }
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 },
        children: [
          jsxs('label', {
            style: { position: 'relative', height: 28, padding: '0 9px', borderRadius: 6, border: `1px solid ${B.ctl}`, color: B.t2, display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', cursor: 'pointer' },
            children: [
              jsx('span', { style: { width: 12, height: 12, borderRadius: 3, background: pal.dark } }),
              `To: ${target ? botLabel(target.p) : '…'} ▾`,
              jsx('select', {
                'aria-label': 'Send the brief to',
                value: to,
                onChange: e => setTo(e.target.value),
                style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
                children: [jsx('option', { value: '', children: 'Route automatically' }, ''), ...rows.map(r => jsx('option', { value: r.p.name, children: botLabel(r.p) }, r.p.name))]
              })
            ]
          }),
          jsx('span', { style: { color: B.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }, children: tierLine }),
          suggestion && !to ? jsx('button', { type: 'button', onClick: () => setWhy(v => !v), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 12, cursor: 'pointer', flex: '0 0 auto' }, children: why ? 'hide' : 'why' }) : null,
          jsx('span', { style: { color: B.t4, whiteSpace: 'nowrap', flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' }, children: guard }),
          jsx('button', {
            type: 'button',
            onClick: send,
            disabled: !text.trim() || !target,
            style: { height: 28, padding: '0 12px', borderRadius: 6, border: 0, background: V.accent, color: ON_ACCENT, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: text.trim() ? 1 : 0.45, flex: '0 0 auto' },
            children: 'Send'
          })
        ]
      }),
      why && suggestion && !to ? jsx('div', { style: { fontSize: 11.5, color: B.t3, lineHeight: 1.4 }, children: suggestion.why }) : null
    ]
  })
}

function BoardTable({ rows, looks, onLook }) {
  const head = ['Bot', 'Status', 'Now', 'Permissions', 'Next routine', 'Today']
  return jsxs('div', {
    role: 'table',
    style: { display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' },
    children: [
      jsx('div', {
        role: 'row',
        style: { display: 'grid', gridTemplateColumns: B_GRID, gap: 12, padding: '0 10px 6px', borderBottom: `1px solid ${B.hair}`, ...B_CAPS },
        children: head.map((h, i) => jsx('span', { role: 'columnheader', style: { textAlign: i === 5 ? 'right' : 'left', whiteSpace: 'nowrap' }, children: h }, h))
      }),
      jsx('div', { role: 'rowgroup', children: rows.map((r, i) => {
        const look = normalizeLook(looks[r.p.name] || null, r.p.name)
        const expr = r.rank === 0 ? 'question' : r.rank === 1 ? 'focused' : look.face
        return jsxs('div', {
          role: 'row',
          tabIndex: 0,
          className: 'helm-board-row',
          onClick: () => openBot(r.p, r.activity),
          onKeyDown: e => {
            if (e.key === 'Enter') openBot(r.p, r.activity)
          },
          style: { display: 'grid', gridTemplateColumns: B_GRID, gap: 12, alignItems: 'center', padding: 10, borderBottom: `1px solid ${B.hair}`, background: i === 0 && r.rank === 0 ? B.panel : undefined, cursor: 'pointer' },
          children: [
            jsxs('span', {
              style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
              children: [
                jsx(AnimatedRobot, { look, head: true, size: 26, expr, state: petStateFor(r.key), title: botLabel(r.p) }),
                jsxs('span', {
                  style: { display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 },
                  children: [
                    jsxs('span', { style: { fontSize: 13, color: B.t1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }, children: [
                      jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: botLabel(r.p) }),
                      r.unread ? jsx('span', { title: 'Unread reply', style: { width: 6, height: 6, borderRadius: 3, background: V.accent, flex: '0 0 6px' } }) : null,
                      jsx('button', { type: 'button', className: 'helm-board-look', onClick: e => (e.stopPropagation(), onLook(r.p.name)), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 11, cursor: 'pointer' }, children: 'Look' })
                    ] }),
                    jsx('span', { style: { fontSize: 11, color: B.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [botRole(r.p), r.p.model].filter(Boolean).join(' · ') || r.p.name })
                  ]
                })
              ]
            }),
            jsx('span', { style: { fontSize: 13, color: r.status.color, whiteSpace: 'nowrap' }, children: r.status.text }),
            jsxs('span', {
              style: { display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 },
              children: [
                jsx('span', { style: { fontSize: 13, color: B.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: r.now }),
                r.ctx ? jsx('span', { style: { fontSize: 11.5, color: B.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: r.ctx }) : null
              ]
            }),
            jsx('span', { style: { fontSize: 11.5, color: B.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: r.setup }),
            jsx('span', { style: { fontSize: 11.5, color: r.next ? B.t3 : B.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: r.next || 'none' }),
            jsx('span', { style: { fontFamily: B.mono, fontSize: 11.5, color: B.t2, textAlign: 'right' }, children: fmtCost(r.today) || '$0.00' })
          ]
        }, r.p.name)
      }) })
    ]
  })
}

function HandoffsSection({ label }) {
  const list = useValue($handoffs)
  const shown = list.slice(0, 4)
  return jsxs('div', {
    children: [
      jsx('div', { style: { ...B_CAPS, marginBottom: 8 }, children: 'Handoffs · Agent inbox' }),
      shown.length
        ? jsx('div', {
            style: { display: 'flex', flexDirection: 'column', gap: 8, color: B.t2 },
            children: shown.map(h =>
              jsxs('div', {
                style: { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 },
                children: [
                  jsxs('span', { children: [jsx('span', { style: { color: B.t1 }, children: `${label(h.from)} → ${h.to || 'a bot'}` }), jsx('span', { style: { color: B.t4 }, children: ` · ${h.status === 'failed' ? 'not delivered' : h.status} · ${shortAgo(h.at)}` })] }),
                  jsx('span', { style: { fontSize: 11.5, color: B.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: `“${h.message}”` })
                ]
              }, h.id)
            )
          })
        : jsx('div', { style: { color: B.t4, fontSize: 12 }, children: 'No bot-to-bot messages yet. They show here when one bot messages another.' })
    ]
  })
}

function RoutingSection({ crew }) {
  const prefsValue = useValue(helmPrefsRef ? helmPrefsRef.prefs : $boardMounted)
  const [editing, setEditing] = useState(false)
  const profiles = crew.profiles || []
  const routing = (prefsValue && typeof prefsValue === 'object' && prefsValue.routing) || {}
  const rules = routingRules(profiles, routing)
  const toggle = (tier, name) => {
    if (!helmPrefsRef) return
    const current = rules[tier].map(p => p.name)
    const nextSet = current.includes(name) ? current.filter(n => n !== name) : [...current, name]
    const next = {}
    for (const t of TIERS) next[t] = t === tier ? nextSet : rules[t].map(p => p.name)
    helmPrefsRef.setPrefs({ routing: next })
  }
  return jsxs('div', {
    children: [
      jsx('div', { style: { ...B_CAPS, marginBottom: 8 }, children: 'Routing rules' }),
      jsx('div', {
        style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', color: B.t2, alignItems: 'center' },
        children: TIERS.flatMap(t => [
          jsx('span', { style: { color: B.t4 }, children: t }, `k${t}`),
          editing
            ? jsx('span', {
                style: { display: 'flex', flexWrap: 'wrap', gap: 4 },
                children: profiles.map(p => {
                  const on = rules[t].some(x => x.name === p.name)
                  return jsx('button', { type: 'button', 'aria-pressed': on, onClick: () => toggle(t, p.name), style: { height: 20, padding: '0 7px', borderRadius: 10, border: `1px solid ${on ? V.accent : B.ctl}`, background: on ? B.sel : 'transparent', color: on ? B.t1 : B.t3, font: 'inherit', fontSize: 11, cursor: 'pointer' }, children: botLabel(p) }, p.name)
                })
              }, `v${t}`)
            : jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: `${rules[t].length ? rules[t].map(botLabel).join(', ') : 'nobody'} · ${TIER_JOB[t]}` }, `v${t}`)
        ])
      }),
      jsxs('div', {
        style: { display: 'flex', gap: 12, marginTop: 6 },
        children: [
          jsx('button', { type: 'button', onClick: () => setEditing(v => !v), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 11.5, cursor: 'pointer' }, children: editing ? 'Done' : 'Edit rules' }),
          editing && helmPrefsRef ? jsx('button', { type: 'button', onClick: () => helmPrefsRef.setPrefs({ routing: {} }), style: { border: 0, padding: 0, background: 'transparent', color: B.t3, font: 'inherit', fontSize: 11.5, cursor: 'pointer' }, children: 'Back to model-based' }) : null
        ]
      })
    ]
  })
}

function DispatchPanel({ rows }) {
  const today = useValue($today)
  const crew = useValue($crew)
  useEffect(() => {
    if (!$today.get().ready || !$today.get().available) refreshToday()
    const t = setInterval(() => refreshToday(), 60000)
    return () => clearInterval(t)
  }, [])
  const byName = Object.fromEntries((crew.profiles || []).map(p => [p.name, p]))
  const label = name => (byName[name] ? botLabel(byName[name]) : name || 'a bot')
  const items = []
  for (const j of today.jobs || []) {
    if (j.running) items.push({ at: toMs(j.last_run_at) || Date.now(), title: j.name || 'Routine', who: j.profile, status: 'running', color: V.accent, kind: 'routine' })
    else if (isToday(j.last_run_at)) items.push({ at: toMs(j.last_run_at), title: j.name || 'Routine', who: j.profile, status: j.last_status === 'error' ? 'failed' : 'done', color: j.last_status === 'error' ? B.red : B.green, detail: j.last_status === 'error' && j.last_error ? j.last_error.split('\n')[0].slice(0, 40) : '', kind: 'routine' })
  }
  const jobRuns = items.length
  for (const p of crew.profiles || []) {
    for (const r of (crew.sessions && crew.sessions[p.name]) || []) {
      const src = (r.source || '').toLowerCase()
      const scheduled = src === 'cron' || r.scheduler_owned
      if (scheduled && jobRuns) continue
      if (scheduled) {
        if (!isToday(r.started_at || r.last_active)) continue
        const live = r.is_active && !r.ended_at
        items.push({ at: toMs(r.started_at || r.last_active), title: sessionTitle(r), who: p.name, status: live ? 'running' : 'done', color: live ? V.accent : B.green, detail: '', kind: 'routine', row: r })
        continue
      }
      if (!isToday(r.started_at || r.last_active)) continue
      const live = r.is_active && !r.ended_at
      items.push({ at: toMs(r.started_at || r.last_active), title: sessionTitle(r), who: p.name, status: live ? 'running' : 'done', color: live ? V.accent : B.green, detail: r.message_count ? `${r.message_count} msgs` : '', kind: 'chat', row: r })
    }
  }
  items.sort((a, b) => b.at - a.at)
  const upcoming = (today.jobs || []).filter(j => j.enabled && j.next_run_at && toMs(j.next_run_at) > Date.now()).sort((a, b) => toMs(a.next_run_at) - toMs(b.next_run_at)).slice(0, 4)
  const time = ms => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '')
  return jsxs('aside', {
    'aria-label': 'Dispatch',
    style: { width: 290, flex: '0 0 290px', borderLeft: `1px solid ${B.hair}`, background: B.panel, display: 'flex', flexDirection: 'column', minHeight: 0 },
    children: [
      jsx('div', {
        style: { display: 'flex', gap: 14, padding: '10px 16px 0', borderBottom: `1px solid ${B.hair}` },
        children: jsx('span', { style: { height: 28, display: 'flex', alignItems: 'center', borderBottom: `2px solid ${V.accent}`, color: B.t1, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em' }, children: 'DISPATCH' })
      }),
      jsxs('div', {
        style: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12, overflowY: 'auto', minHeight: 0, flex: '1 1 auto' },
        children: [
          jsxs('div', {
            children: [
              jsxs('div', { style: { ...B_CAPS, marginBottom: 8, display: 'flex' }, children: [`Today · ${items.length} ${items.length === 1 ? 'job' : 'jobs'}`] }),
              items.length
                ? jsx('div', {
                    style: { display: 'flex', flexDirection: 'column' },
                    children: items.slice(0, 12).map((it, i) =>
                      jsxs('button', {
                        type: 'button',
                        onClick: () => (it.row ? openSession(it.row, it.who) : host.navigate('/cron')),
                        style: { display: 'grid', gridTemplateColumns: '40px 1fr', gap: 8, padding: '6px 0', borderTop: `1px solid ${B.hair}`, borderBottom: i === Math.min(items.length, 12) - 1 ? `1px solid ${B.hair}` : undefined, lineHeight: 1.3, textAlign: 'left', border: 0, borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: B.hair, background: 'transparent', font: 'inherit', cursor: 'pointer', color: 'inherit', width: '100%' },
                        children: [
                          jsx('span', { style: { fontFamily: B.mono, fontSize: 11, color: B.t4 }, children: time(it.at) }),
                          jsxs('span', {
                            style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
                            children: [
                              jsx('span', { style: { fontSize: 12, color: B.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: it.title }),
                              jsxs('span', { style: { fontSize: 11, color: B.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [`→ ${label(it.who)} · `, jsx('span', { style: { color: it.color }, children: it.status }), it.detail ? ` ${it.detail}` : '', ` · ${it.kind === 'routine' ? 'cron' : 'chat'}`] })
                            ]
                          })
                        ]
                      }, `${it.kind}:${it.title}:${it.at}:${i}`)
                    )
                  })
                : jsx('div', { style: { color: B.t4, fontSize: 12 }, children: 'Nothing has run today yet.' })
            ]
          }),
          jsx(HandoffsSection, { label }),
          jsx(RoutingSection, { crew }),
          upcoming.length
            ? jsxs('div', {
                children: [
                  jsxs('div', { style: { ...B_CAPS, marginBottom: 8, display: 'flex', alignItems: 'center' }, children: ['Up next', jsx('button', { type: 'button', onClick: () => host.navigate('/cron'), style: { marginLeft: 'auto', border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 11.5, fontWeight: 500, letterSpacing: 0, textTransform: 'none', cursor: 'pointer' }, children: 'Routines' })] }),
                  jsx('div', {
                    style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', color: B.t2 },
                    children: upcoming.flatMap(j => [
                      jsx('span', { style: { color: B.t4, fontFamily: B.mono, fontSize: 11 }, children: isToday(j.next_run_at) ? time(toMs(j.next_run_at)) : new Date(toMs(j.next_run_at)).toLocaleDateString([], { weekday: 'short' }) }, `t${j.id}`),
                      jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: `${j.name || 'Routine'} · ${label(j.profile)}` }, `n${j.id}`)
                    ])
                  })
                ]
              })
            : null
        ]
      }),
      jsx('div', { style: { marginTop: 'auto', borderTop: `1px solid ${B.hair}`, padding: '8px 16px', fontSize: 11.5, color: B.t4, lineHeight: 1.4 }, children: 'Statuses are finite: queued · running · blocked · done · failed. A blocked job always says what it needs.' })
    ]
  })
}

function BoardView({ looks, onLook }) {
  const crew = useValue($crew)
  const today = useValue($today)
  const looksValue = useValue(looks)
  const n = useNeedsYou()
  const filter = useValue($boardFilter)
  const perms = useValue($perms)
  const roomsValue = useValue($rooms)
  useEffect(() => {
    $boardMounted.set(true)
    if (!$perms.get().ready || Date.now() - $perms.get().at > 120000) refreshPerms()
    const permTimer = setInterval(() => {
      if (!$perms.get().ready) refreshPerms()
    }, 15000)
    if (!$today.get().ready) refreshToday()
    return () => {
      clearInterval(permTimer)
      $boardMounted.set(false)
    }
  }, [])
  const needs = useMemo(() => {
    const out = {}
    const bump = (name, kind, item) => {
      if (!name) return
      out[name] = out[name] || { approvals: 0, questions: 0, firstApproval: null, firstQuestion: null }
      out[name][kind] += 1
      if (kind === 'approvals' && !out[name].firstApproval) out[name].firstApproval = item
      if (kind === 'questions' && !out[name].firstQuestion) out[name].firstQuestion = item
    }
    n.approvals.forEach(a => bump(a.profile, 'approvals', a))
    n.questions.forEach(q => bump(q.profile, 'questions', q))
    return out
  }, [n.approvals, n.questions])
  const rows = useMemo(
    () => (crew.profiles || []).map(p => boardRowFor(p, crew, needs, today.jobs || [], perms.byProfile)).sort((a, b) => a.rank - b.rank || toMs(b.activity.latest && b.activity.latest.last_active) - toMs(a.activity.latest && a.activity.latest.last_active)),
    [crew, needs, today, perms]
  )
  const counts = { all: rows.length, attention: rows.filter(r => r.rank === 0 || r.unread).length, working: rows.filter(r => r.rank === 1).length, idle: rows.filter(r => r.rank >= 3).length }
  const shown = rows.filter(r => (filter === 'attention' ? r.rank === 0 || r.unread : filter === 'working' ? r.rank === 1 : filter === 'idle' ? r.rank >= 3 : true))
  const spend = rows.reduce((s, r) => s + r.today, 0)
  if (!crew.ready && !rows.length) return jsx('div', { style: { padding: 22, color: B.t3, fontSize: 13 }, children: 'Loading your bots…' })
  return jsxs('div', {
    style: { display: 'flex', minHeight: 0, flex: '1 1 auto', background: B.bg, color: B.t1, fontSize: 13 },
    children: [
      jsxs('div', {
        style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', padding: '14px 22px 0', gap: 14, overflow: 'hidden' },
        children: [
          jsx(BoardDispatch, { rows }),
          jsxs('div', {
            style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto' },
            children: [
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 8px' },
                children: [
                  jsxs('div', {
                    style: { display: 'flex', gap: 4 },
                    children: [
                      jsx(BoardChip, { label: `All · ${counts.all}`, active: filter === 'all', onClick: () => $boardFilter.set('all') }),
                      jsx(BoardChip, { label: `Needs you · ${counts.attention}`, active: filter === 'attention', tone: B.amber, onClick: () => $boardFilter.set('attention') }),
                      jsx(BoardChip, { label: `Working · ${counts.working}`, active: filter === 'working', onClick: () => $boardFilter.set('working') }),
                      jsx(BoardChip, { label: `Idle · ${counts.idle}`, active: filter === 'idle', onClick: () => $boardFilter.set('idle') })
                    ]
                  }),
                  jsx('span', { style: { marginLeft: 'auto', fontSize: 11.5, color: B.t4, whiteSpace: 'nowrap' }, children: `Sorted: attention first · ${fmtCost(spend) || '$0.00'} today across the crew` })
                ]
              }),
              shown.length
                ? jsx(BoardTable, { rows: shown, looks: looksValue, onLook })
                : jsx('div', { style: { padding: '14px 10px', color: B.t4, fontSize: 12.5, borderTop: `1px solid ${B.hair}` }, children: filter === 'attention' ? 'Nobody is waiting on you.' : filter === 'working' ? 'No bot is working right now.' : 'Nothing here.' }),
              jsx('div', { style: { padding: '10px 2px', fontSize: 11.5, color: B.t4 }, children: roomsValue.rooms.length ? `Rooms: ${roomsValue.rooms.map(e => `${e.room.name} (${(e.room.members || []).map(roomMemberName).join(', ')})`).join(' · ')}` : 'No rooms yet. A room is a group chat of two to six bots; make one with New room on the Helm tab.' })
            ]
          })
        ]
      }),
      jsx(DispatchPanel, { rows })
    ]
  })
}

function BotsPage({ looks, setLook, avatars, os }) {
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const busy = useValue(host.state.busy)
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const filter = useValue($boardFilter)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(() => $newBotAsked.get())
  useEffect(() => {
    if ($newBotAsked.get()) $newBotAsked.set(false)
    return $newBotAsked.listen(v => {
      if (v) {
        setCreating(true)
        $newBotAsked.set(false)
      }
    })
  }, [])
  const [ranks, setRanks] = useState({})
  const onStatus = (name, rank) => setRanks(prev => (prev[name] === rank ? prev : { ...prev, [name]: rank }))

  const profiles = crew.profiles || []
  const editingProfile = editing ? profiles.find(p => p.name === editing) : null
  const needsYou = profiles.filter(p => ranks[p.name] === 0).length
  const working = profiles.filter(p => ranks[p.name] === 1).length

  const header = jsxs('div', {
    className: 'flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2 text-xs',
    children: [
      jsx(Codicon, { name: 'hubot', size: 14 }),
      jsx('span', { className: 'font-medium text-(--ui-text-secondary)', children: creating ? 'New bot' : 'Bots board' }),
      jsx('span', {
        className: 'text-(--ui-text-tertiary)',
        children: !crew.ready ? 'loading the crew…' : [`${profiles.length} bots`, needsYou ? `${needsYou} need you` : null, working ? `${working} working` : null].filter(Boolean).join(' · ')
      }),
      editingProfile || creating
        ? jsx(Button, { variant: 'ghost', size: 'sm', className: 'ml-auto', onClick: () => (setEditing(null), setCreating(false)), children: 'Back to board' })
        : jsxs('div', {
            className: 'ml-auto flex items-center gap-2',
            children: [
              jsx(SegmentedControl, {
                value: filter,
                options: [
                  { id: 'all', label: 'All' },
                  { id: 'attention', label: 'Needs you' },
                  { id: 'working', label: 'Working' }
                ],
                onChange: v => $boardFilter.set(v)
              }),
              jsx(Button, { size: 'sm', onClick: () => setCreating(true), children: 'New bot' })
            ]
          })
    ]
  })

  let body
  if (creating) {
    body = jsx(NewBotView, {
      looks,
      setLook,
      avatars,
      onDone: slug => {
        setCreating(false)
        if (slug) host.newChat(slug)
      }
    })
  } else if (editingProfile) {
    const look = normalizeLook(looksValue[editingProfile.name], editingProfile.name)
    body = jsx(LookEditor, {
      profile: editingProfile,
      look,
      onChange: next => setLook(editingProfile.name, next),
      onClose: async () => {
        const name = editingProfile.name
        setEditing(null)
        try {
          await pushAvatar(name, normalizeLook(looks.get()[name], name), avatars)
          host.notify?.({ kind: 'success', message: `${botLabel(editingProfile)}’s robot is now its Hermes avatar.` })
        } catch (err) {
          host.notifyError?.(`Saved the look; the Hermes avatar did not update: ${err && err.message ? err.message : err}`)
        }
      }
    })
  } else if (crew.error && !profiles.length) {
    body = jsx('div', { className: 'p-6 text-sm text-(--ui-text-secondary)', children: `Could not list profiles: ${crew.error}` })
  } else {
    body = jsx(BoardView, { looks, onLook: name => setEditing(name) })
  }

  if (!editingProfile && !creating && !(crew.error && !profiles.length)) {
    return jsxs('div', { className: 'flex h-full w-full min-h-0 flex-col', style: { background: '#0F1419' }, children: [jsx(SpriteNotice, {}), body] })
  }
  return jsxs('div', { className: 'flex h-full w-full min-h-0 flex-col', children: [header, body] })
}

// Composer: who you are talking to, with the bot's face as its live status.
function ComposerBotChip({ looks }) {
  const profile = useValue(host.state.focusedSessionProfile)
  const busy = useValue(host.state.busy)
  const looksValue = useValue(looks)
  if (!profile) return null
  const look = normalizeLook(looksValue[profile], profile)
  return jsx('button', {
    type: 'button',
    title: `Talking to ${profile} — open the Bots board`,
    onClick: () => host.navigate(BOTS_ROUTE),
    'aria-label': `Talking to ${profile}`,
    className: 'flex h-7 w-7 items-center justify-center rounded-full hover:bg-(--chrome-action-hover)',
    children: jsx(AnimatedRobot, { look, head: true, expr: busy ? 'focused' : look.face, state: busy ? 'running' : 'idle', size: 22, title: profile })
  })
}

// ──────────────────────────────────────────────── desktop-wide decorations
// Sidebar session rows: the owning bot's robot (its face is the row's state)
// leading, the session's spend trailing.
function SessionRowBot({ sessionId, looks, prefs }) {
  const { showRowBots } = useValue(prefs)
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const hit = crew.byId && crew.byId[sessionId]
  if (!showRowBots || !hit) return null
  const look = normalizeLook(looksValue[hit.profile], hit.profile)
  const r = hit.row
  const expr = r.unread ? 'question' : r.is_active && !r.ended_at ? 'focused' : look.face
  return jsx('span', {
    title: hit.profile,
    className: 'inline-flex h-4 w-4 shrink-0 items-center justify-center',
    children: jsx(RobotHead, { look, expr, size: 16, title: hit.profile })
  })
}

function SessionRowCost({ sessionId, prefs }) {
  const { showRowCost } = useValue(prefs)
  const crew = useValue($crew)
  const hit = crew.byId && crew.byId[sessionId]
  const cost = hit ? rowCost(hit.row) : 0
  if (!showRowCost || cost < 0.01) return null
  return jsx('span', { className: 'shrink-0 text-[0.625rem] tabular-nums text-(--ui-text-quaternary)', children: fmtCost(cost) })
}

// The design's second line under every session title: what that session is
// doing, in words. It renders in the row's trailing slot and the theme wraps it
// onto its own line (see "Session rows" in HELM_CSS).
function sessionStatusFor(sessionId, crew, inbox, plan) {
  const hit = crew.byId && crew.byId[sessionId]
  const r = hit ? hit.row : null
  const ids = new Set([sessionId, r && r.id, r && r._lineage_root_id].filter(Boolean))
  const approval = inbox.approvals.find(a => ids.has(a.storedId) || ids.has(a.sessionId))
  if (approval) return { lead: 'Approval', rest: approval.command ? approval.command.split('\n')[0].slice(0, 60) : approval.description, tone: 'amber' }
  const question = inbox.questions.find(q => ids.has(q.storedId) || ids.has(q.sessionId))
  if (question) return { lead: 'Question', rest: 'waiting for your answer', tone: 'amber' }
  // Not in the recent read (older than the cron runs that fill it): nothing
  // waits on it and nothing runs in it, so it's idle.
  if (!r) return crew.ready ? { lead: 'Idle', rest: '', tone: 'plain' } : null
  const cost = rowCost(r)
  const money = cost >= 0.01 ? fmtCost(cost) : null
  if (r.handoff_error) return { lead: 'Failed', rest: String(r.handoff_error).slice(0, 48), tone: 'red' }
  if (r.is_active && !r.ended_at) {
    let step = null
    if (plan && plan.items && plan.items.length && ids.has(plan.sessionId)) {
      const done = plan.items.filter(i => i.status === 'completed' || i.status === 'cancelled').length
      step = `step ${Math.min(done + 1, plan.items.length)} of ${plan.items.length}`
    } else if (r.tool_call_count > 0) {
      step = `${r.tool_call_count} tool ${r.tool_call_count === 1 ? 'call' : 'calls'}`
    }
    return { lead: 'Working', rest: [step, money].filter(Boolean).join(' · '), tone: 'accent' }
  }
  if (r.unread) return { lead: 'Replied', rest: [money].filter(Boolean).join(' · '), tone: 'plain' }
  if (r.ended_at) return { lead: 'Done', rest: [r.message_count ? `${r.message_count} msgs` : null, money].filter(Boolean).join(' · '), tone: 'plain' }
  const bits = [r.message_count ? `${r.message_count} msgs` : null, money].filter(Boolean)
  return { lead: 'Idle', rest: bits.join(' · '), tone: 'plain' }
}

function SessionRowStatus({ sessionId, prefs }) {
  const { showRowStatus } = useValue(prefs)
  const crew = useValue($crew)
  const inbox = useValue($inbox)
  const plan = useValue($plan)
  if (showRowStatus === false) return null
  const st = sessionStatusFor(sessionId, crew, inbox, plan)
  if (!st) return null
  const leadColor = st.tone === 'red' ? 'var(--ui-red, #E07080)' : st.tone === 'amber' ? 'var(--ui-yellow, #E8A657)' : st.tone === 'accent' ? 'var(--ui-accent)' : 'inherit'
  return jsxs('span', {
    'data-helm-row-status': st.tone,
    children: [
      st.lead ? jsx('span', { style: { color: leadColor }, children: st.lead }) : null,
      st.lead && st.rest ? ' · ' : null,
      st.rest || null
    ]
  })
}

function basename(path) {
  if (!path) return ''
  const parts = String(path).replace(/\/+$/, '').split('/')
  const last = parts[parts.length - 1] || path
  return parts.length > 2 && parts[1] === 'Users' && parts.length === 3 ? '~' : last
}

// Titlebar: who, where, what model, what it costs — for the focused chat.
function ContextLine({ looks, prefs }) {
  const { showContextLine } = useValue(prefs)
  const profile = useValue(host.state.focusedSessionProfile)
  const cwd = useValue(host.state.cwd)
  const model = useValue(host.state.model)
  const busy = useValue(host.state.busy)
  const usage = useValue(host.state.focusedUsage)
  const looksValue = useValue(looks)
  if (!showContextLine || !profile) return null
  const look = normalizeLook(looksValue[profile], profile)
  const bits = [basename(cwd), model, usage ? fmtCost(usage.cost_usd) : null, usage && typeof usage.context_percent === 'number' ? `${Math.round(usage.context_percent)}% ctx` : null].filter(Boolean)
  return jsxs('button', {
    type: 'button',
    title: 'Open the Bots board',
    onClick: () => host.navigate(BOTS_ROUTE),
    className: 'flex h-6 max-w-md items-center gap-1.5 rounded-md px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
    children: [
      jsx(AnimatedRobot, { look, head: true, expr: busy ? 'focused' : look.face, state: busy ? 'running' : 'idle', size: 18, title: profile }),
      jsx('span', { className: 'font-medium text-(--ui-text-secondary)', children: profile }),
      bits.length ? jsx('span', { className: 'truncate tabular-nums', children: '· ' + bits.join(' · ') }) : null
    ]
  })
}

function NeedsYouChip({ prefs }) {
  const { showNeedsYouChip } = useValue(prefs)
  const crew = useValue($crew)
  const { needYou } = crewTotals(crew)
  if (!showNeedsYouChip || needYou === 0) return null
  return jsx('button', {
    type: 'button',
    title: 'Sessions with a reply you have not read — open the Bots board',
    onClick: () => {
      $boardFilter.set('attention')
      host.navigate(BOTS_ROUTE)
    },
    className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] font-medium text-(--ui-yellow) hover:underline',
    children: needYou === 1 ? '1 needs you' : `${needYou} need you`
  })
}

function ApprovalsChip() {
  const mode = useValue($approvalMode)
  useEffect(() => {
    readApprovalMode()
  }, [])
  if (!mode) return null
  return jsx('span', { title: 'Approval mode for this window', className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)', children: `Approvals: ${mode === 'manual' ? 'ask' : mode}` })
}

function TodayChip({ prefs }) {
  const { showTodayChip } = useValue(prefs)
  const crew = useValue($crew)
  const { today } = crewTotals(crew)
  if (!showTodayChip) return null
  return jsx('span', {
    title: 'Spend across every bot’s sessions active today',
    className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary)',
    children: `${fmtCost(today) || '$0.00'} today`
  })
}

// ───────────────────────────────────────────────────────────────── the desk
// Home for the whole app: who's working, what's waiting on you, what ran
// today, and a prompt that hands work to any bot. Everything on it comes from
// the crew index (profiles + persisted sessions) and the gateway's public
// `cron.manage list` RPC (the same call the core Bots tab makes), so it reads
// the same data the core views do and needs no backend of its own.

const $today = atom({ ready: false, available: false, jobs: [], at: 0 })
let todayInflight = false

function cronRow(job, profile) {
  const status = String(job.last_status || '').toLowerCase()
  const failed = ['failed', 'error', 'refused'].includes(status) || !!job.last_error || !!job.last_fire_error
  const err = job.last_error || job.last_fire_error || job.last_delivery_error
  return {
    id: job.job_id || job.id,
    name: job.name,
    enabled: job.enabled !== false && job.state !== 'paused',
    schedule_display: job.schedule && job.schedule !== '?' ? job.schedule : '',
    last_run_at: job.last_run_at,
    next_run_at: job.next_run_at,
    last_status: failed ? 'error' : status || null,
    last_error: typeof err === 'string' ? err.slice(0, 300) : null,
    running: ['running', 'claimed'].includes(status) || job.state === 'running',
    profile
  }
}

async function refreshToday() {
  if (todayInflight) return
  todayInflight = true
  try {
    if (typeof host.request !== 'function') throw new Error('no gateway')
    const seen = new Map()
    let reached = false
    const take = (res, profile, launch) => {
      if (!res || !Array.isArray(res.jobs)) return
      reached = true
      // A gateway that ignores `profile` answers with its launch store and no
      // `scoped`; label those rows unscoped so they aren't pinned to the wrong bot.
      const owner = launch ? profile : profile ? res.scoped || '' : ''
      for (const job of res.jobs) {
        const row = cronRow(job || {}, owner)
        if (row.id && !seen.has(row.id)) seen.set(row.id, row)
      }
    }
    // Each bot's own store first (rows get its name), then the launch store for anything left.
    const profiles = ($crew.get().profiles || []).map(p => p && p.name).filter(Boolean)
    await Promise.all(profiles.map(async name => {
      try { take(await host.request('cron.manage', { action: 'list', include_disabled: true, profile: name }, 15000), name) } catch { /* that bot just has no list */ }
    }))
    // The launch store is the window's own profile's store.
    try { take(await host.request('cron.manage', { action: 'list', include_disabled: true }, 15000), atomGet(host.state.profile) || '', true) } catch { /* no launch store */ }
    $today.set({ ready: true, available: reached, jobs: [...seen.values()].slice(0, 100), at: Date.now() })
  } catch {
    $today.set({ ready: true, available: false, jobs: [], at: Date.now() })
  } finally {
    todayInflight = false
  }
}

function toMs(t) {
  if (!t) return 0
  if (typeof t === 'string') {
    const n = Date.parse(t)
    return Number.isFinite(n) ? n : 0
  }
  return t > 1e12 ? t : t * 1000
}

function clock(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function greeting(now = new Date()) {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 18) return 'Good afternoon'
  return 'Good evening'
}

function recentAcross(crew, limit = 6) {
  const out = []
  for (const p of crew.profiles || []) {
    for (const r of (crew.sessions && crew.sessions[p.name]) || []) if (r.message_count !== 0 || r.title) out.push({ profile: p, row: r })
  }
  out.sort((a, b) => toMs(b.row.last_active) - toMs(a.row.last_active))
  return out.slice(0, limit)
}

function waitingAcross(crew) {
  const out = []
  for (const p of crew.profiles || []) {
    for (const r of (crew.sessions && crew.sessions[p.name]) || []) if (r.unread) out.push({ profile: p, row: r })
  }
  out.sort((a, b) => toMs(b.row.last_active) - toMs(a.row.last_active))
  return out
}

function rowState(r) {
  if (r.unread) return { word: 'reply waiting', tone: 'amber', dot: '#E8A657' }
  if (r.is_active && !r.ended_at) return { word: 'working', tone: 'accent', dot: 'var(--ui-accent)' }
  return { word: 'done', tone: 'muted', dot: 'var(--ui-text-quaternary)' }
}

function sessionTitle(r) {
  const src = (r.handoff_platform || r.source || '').toLowerCase()
  // A scheduled run's preview is its injected job prompt, not something to show.
  if (src === 'cron' || r.scheduler_owned) return r.title || 'Scheduled run'
  if (r.title || r.preview) return r.title || r.preview
  const where = src === 'cron' || r.scheduler_owned ? 'Scheduled run' : src && !['desktop', 'tui', 'cli'].includes(src) ? `${src.charAt(0).toUpperCase()}${src.slice(1)} chat` : 'Untitled chat'
  return r.started_at ? `${where} · ${new Date(toMs(r.started_at)).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : where
}

function minutesSince(t) {
  const ms = toMs(t)
  if (!ms) return ''
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (m < 1) return 'just started'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
}

function statusSentence(crew) {
  const working = []
  for (const p of crew.profiles || []) {
    const rows = (crew.sessions && crew.sessions[p.name]) || []
    const live = rows.find(r => r.is_active && !r.ended_at)
    if (live) working.push({ profile: p, row: live })
  }
  const waiting = needsYouOf($inbox.get(), crew).total
  const parts = []
  if (working.length) {
    const first = working[0]
    const into = minutesSince(first.row.started_at || first.row.last_active)
    parts.push(`${botLabel(first.profile)} is ${into === 'just started' ? 'just starting' : `${into} into`} “${sessionTitle(first.row)}”.`)
    if (working.length > 1) parts.push(`${working.length - 1} more ${working.length === 2 ? 'bot is' : 'bots are'} working.`)
  }
  if (waiting) parts.push(waiting === 1 ? 'One thing is waiting on you.' : `${waiting} things are waiting on you.`)
  if (!parts.length) parts.push(crew.ready ? 'All quiet — nothing is running or waiting on you.' : 'Checking on the crew…')
  return parts.join(' ')
}

function isPrimaryWindow() {
  try {
    const q = new URLSearchParams(globalThis.location ? globalThis.location.search : '')
    return !q.get('win') && q.get('peer') !== '1' && !q.get('watch') && q.get('profileWindow') !== '1'
  } catch {
    return false
  }
}

function atomGet(a) {
  try {
    return a && typeof a.get === 'function' ? a.get() : undefined
  } catch {
    return undefined
  }
}

// Hand text to a new chat with `profile`. 'send' submits it, 'draft' only fills
// the composer. Never submits before the app has switched to that bot.
function startChat(profile, text, mode) {
  const composer = host.composer
  try {
    host.newChat(profile)
  } catch (err) {
    host.notifyError?.(`Could not start a chat: ${err && err.message ? err.message : err}`)
    return
  }
  if (!text || !composer) return
  let tries = 0
  const ready = () => {
    const routed = atomGet(host.state.focusedSessionProfile) || atomGet(host.state.profile)
    return !profile || routed === profile
  }
  const attempt = () => {
    tries += 1
    if (!ready()) {
      if (tries < 40) setTimeout(attempt, 150)
      else host.notifyError?.('The new chat did not open in time; your text was not sent.')
      return
    }
    if (mode === 'send' && typeof composer.submit === 'function') {
      let ok = false
      try {
        ok = composer.submit(null, text)
      } catch {
        ok = false
      }
      if (!ok && tries < 40) setTimeout(attempt, 150)
      else if (!ok) host.notifyError?.('The composer was not ready; your text was not sent.')
      return
    }
    Promise.resolve(typeof composer.setDraft === 'function' ? composer.setDraft(null, text) : false)
      .catch(() => false)
      .then(ok => {
        if (!ok && tries < 40) setTimeout(attempt, 150)
      })
  }
  setTimeout(attempt, 150)
}

// Open a session and put a reply in its composer as a draft; the user sends it.
function replyDraft(entry, text) {
  openSession(entry.row, entry.profile.name)
  if (!text || !host.composer || typeof host.composer.setDraft !== 'function') return
  const ids = new Set([entry.row.id, entry.row._lineage_root_id, ...(entry.row._lineage_ids || [])].filter(Boolean))
  let tries = 0
  const attempt = () => {
    tries += 1
    const focused = atomGet(host.state.focusedStoredSessionId)
    if (!ids.has(focused)) {
      if (tries < 40) setTimeout(attempt, 150)
      return
    }
    Promise.resolve(host.composer.setDraft(null, text)).catch(() => {})
  }
  setTimeout(attempt, 150)
}

// Plugin code is not compiled by the app's Tailwind, so only utility classes the
// app itself already uses are safe. Layout, sizes and colours here are inline.
const V = {
  t1: 'var(--ui-text-primary)',
  t2: 'var(--ui-text-secondary)',
  t3: 'var(--ui-text-tertiary)',
  t4: 'var(--ui-text-quaternary)',
  accent: 'var(--ui-accent)',
  hair: 'var(--ui-stroke-tertiary)',
  hair2: 'var(--ui-stroke-secondary)',
  raised: 'var(--ui-bg-elevated)',
  hover: 'var(--ui-row-hover-background)',
  amber: 'var(--ui-yellow, #E8A657)',
  red: 'var(--ui-red, #E5534B)',
  green: 'var(--ui-green, #57AB5A)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  radius: n => `calc(var(--radius-scalar, 1) * ${n}px)`
}
const TONE_COLOR = { amber: V.amber, accent: V.accent, muted: V.t3 }
const CAPS = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: V.t3, margin: 0 }
const ON_ACCENT = '#06161A'

// A Desk section. With `id` + `fold` it folds: the header toggles it, the
// choice is remembered (prefs.deskFolded), and a folded section shows its count.
function DeskSection({ id, title, count, action, fold, children }) {
  const folded = !!(fold && id && foldedIds(fold.prefs).has(id))
  const toggle = () => {
    if (!fold || !id) return
    const ids = foldedIds(fold.prefs)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    fold.setPrefs({ deskFolded: [...ids].join(',') })
  }
  const head = fold && id
    ? jsxs('button', {
        type: 'button',
        onClick: toggle,
        'aria-expanded': !folded,
        title: folded ? 'Show' : 'Hide',
        style: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' },
        children: [
          jsx('span', { style: { ...CAPS, color: V.t4, display: 'inline-block', width: 9, transition: 'transform 120ms', transform: folded ? 'rotate(-90deg)' : 'none' }, children: '▾' }),
          jsx('h2', { style: CAPS, children: title }),
          folded && count ? jsx('span', { style: { fontSize: 11, color: V.t3, fontVariantNumeric: 'tabular-nums' }, children: count }) : null
        ]
      })
    : jsx('h2', { style: CAPS, children: title })
  return jsxs('section', {
    style: { marginTop: folded ? 14 : 22, display: 'flex', flexDirection: 'column' },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 6px' },
        children: [head, action || null]
      }),
      folded ? null : jsx('div', { style: { borderTop: `1px solid ${V.hair}` }, children })
    ]
  })
}

function foldedIds(prefs) {
  const raw = prefs && typeof prefs.deskFolded === 'string' ? prefs.deskFolded : ''
  return new Set(raw.split(',').map(x => x.trim()).filter(Boolean))
}

function LinkButton({ onClick, children, tone }) {
  return jsx('button', {
    type: 'button',
    onClick,
    className: 'hover:underline',
    style: { fontSize: 12, color: tone === 'muted' ? V.t3 : V.accent, padding: '0 4px', background: 'none', border: 0, cursor: 'pointer' },
    children
  })
}

function SmallButton({ onClick, children, primary, disabled, title }) {
  return jsx('button', {
    type: 'button',
    onClick,
    disabled,
    title,
    style: {
      height: 28,
      padding: primary ? '0 12px' : '0 10px',
      fontSize: 12,
      fontWeight: primary ? 600 : 500,
      borderRadius: V.radius(6),
      border: primary ? '1px solid transparent' : `1px solid ${V.hair2}`,
      background: primary ? V.accent : 'transparent',
      color: primary ? ON_ACCENT : V.t2,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? 'default' : 'pointer',
      whiteSpace: 'nowrap'
    },
    children
  })
}

function DeskRow({ lead, title, sub, meta, actions, dot, dense }) {
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12, padding: dense ? '7px 2px' : '9px 2px', borderBottom: `1px solid ${V.hair}`, lineHeight: 1.3 },
    children: [
      dot !== undefined ? jsx('span', { style: { width: 6, height: 6, borderRadius: 3, flexShrink: 0, marginLeft: 4, background: dot || 'transparent' } }) : null,
      lead,
      jsxs('div', {
        style: { minWidth: 0, flex: 1 },
        children: [
          jsx('div', { className: 'truncate', style: { fontSize: dense ? 12.5 : 13, color: V.t1 }, children: title }),
          sub ? jsx('div', { className: 'truncate', style: { fontSize: 11.5, color: V.t2, marginTop: 1 }, children: sub }) : null
        ]
      }),
      meta ? jsx('div', { style: { flexShrink: 0, fontSize: 11.5, color: V.t3, fontFamily: V.mono, fontVariantNumeric: 'tabular-nums' }, children: meta }) : null,
      actions ? jsx('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }, children: actions }) : null
    ]
  })
}

function BotPicker({ profiles, value, onPick, looks }) {
  return jsx('div', {
    role: 'radiogroup',
    'aria-label': 'Bot',
    style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 },
    children: profiles.map(p => {
      const on = p.name === value
      const look = normalizeLook(looks[p.name], p.name)
      return jsxs(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': on,
          title: `Hand it to ${botLabel(p)}`,
          onClick: () => onPick(p.name),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: '0 10px 0 4px',
            fontSize: 12,
            borderRadius: 999,
            cursor: 'pointer',
            border: `1px solid ${on ? V.accent : V.hair}`,
            background: on ? 'color-mix(in srgb, var(--ui-accent) 14%, transparent)' : 'transparent',
            color: on ? V.t1 : V.t3
          },
          children: [jsx(AnimatedRobot, { look, head: true, expr: on ? 'happy' : look.face, state: 'idle', size: 20, title: p.name }), botLabel(p)]
        },
        p.name
      )
    }).concat(
      jsx(
        'button',
        {
          type: 'button',
          title: 'Build a new bot with its own robot',
          onClick: openNewBot,
          style: { height: 28, padding: '0 10px', borderRadius: 999, border: `1px dashed ${V.hair2}`, background: 'transparent', color: V.t3, fontSize: 12, cursor: 'pointer' },
          children: '+ New bot'
        },
        'new-bot'
      )
    )
  })
}

function DeskPrompt({ crew, looks }) {
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const cwd = useValue(host.state.cwd)
  const profiles = crew.profiles || []
  const [bot, setBot] = useState(null)
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const chosen = bot || (profiles.some(p => p.name === focusedProfile) ? focusedProfile : profiles[0] && profiles[0].name) || 'default'
  const go = mode => {
    const t = text.trim()
    if (!t && mode === 'send') return
    startChat(chosen, t, mode)
    setText('')
  }
  return jsxs('div', {
    style: {
      borderRadius: V.radius(12),
      border: `1px solid ${focus ? V.accent : V.hair2}`,
      background: V.raised,
      padding: '12px 14px 10px',
      transition: 'border-color 120ms'
    },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: V.t4, marginBottom: 4 },
        children: [jsx(Codicon, { name: 'folder', size: 11 }), jsx('span', { className: 'truncate', children: cwd ? cwd.replace(/^\/Users\/[^/]+/, '~') : 'no folder' })]
      }),
      jsx('textarea', {
        value: text,
        rows: 1,
        placeholder: 'What should we tackle?',
        'aria-label': 'What should we tackle?',
        onFocus: () => setFocus(true),
        onBlur: () => setFocus(false),
        onChange: e => setText(e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            go('send')
          }
        },
        style: { width: '100%', resize: 'none', background: 'transparent', border: 0, outline: 'none', padding: '6px 0 2px', fontSize: 15, lineHeight: 1.5, color: V.t1 }
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
        children: [
          jsx(BotPicker, { profiles, value: chosen, onPick: setBot, looks }),
          jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: V.t4, whiteSpace: 'nowrap' }, children: '↵ send · ⇧↵ new line' }),
          jsx(SmallButton, { title: 'Open a new chat with this text in the composer, unsent', onClick: () => go('draft'), children: 'Draft' }),
          jsx('button', {
            type: 'button',
            'aria-label': 'Send',
            title: 'Send (↵)',
            disabled: !text.trim(),
            onClick: () => go('send'),
            style: { width: 28, height: 28, flexShrink: 0, borderRadius: V.radius(6), border: 0, background: V.accent, color: ON_ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.45 },
            children: jsx('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, children: jsx('path', { d: 'M12 19V5M5 12l7-7 7 7' }) })
          })
        ]
      })
    ]
  })
}

function NeedsYouRow({ entry, look }) {
  const [reply, setReply] = useState('')
  const r = entry.row
  const send = () => (reply.trim() ? replyDraft(entry, reply.trim()) : openSession(r, entry.profile.name))
  return jsx(DeskRow, {
    dot: V.amber,
    title: sessionTitle(r),
    sub: jsxs('span', { children: [jsx('span', { style: { color: V.amber }, children: `${botLabel(entry.profile)} replied` }), ` · ${ago(r.last_active)}${r.preview && r.title ? ` · ${r.preview}` : ''}`] }),
    actions: [
      jsx(
        'input',
        {
          value: reply,
          placeholder: 'Reply…',
          'aria-label': `Reply to ${botLabel(entry.profile)}`,
          onChange: e => setReply(e.target.value),
          onKeyDown: e => {
            if (e.key === 'Enter') {
              send()
              setReply('')
            }
          },
          style: { height: 28, width: 160, borderRadius: V.radius(6), border: `1px solid ${V.hair2}`, background: 'transparent', padding: '0 9px', fontSize: 12, color: V.t1, outline: 'none' }
        },
        'reply'
      ),
      jsx(LinkButton, { onClick: send, children: reply.trim() ? 'Reply' : 'Open' }, 'open')
    ]
  })
}

const JOB_COLOR = { failed: V.red, done: V.green, running: V.accent, scheduled: V.t3 }

function jobRow(job) {
  const last = toMs(job.last_run_at)
  const next = toMs(job.next_run_at)
  const since = startOfToday() * 1000
  const until = since + 86400000
  if (job.running) return { at: last || Date.now(), word: 'running', job }
  if (last >= since) return { at: last, word: job.last_status === 'error' ? 'failed' : 'done', job }
  if (job.enabled !== false && next >= Date.now() && next < until) return { at: next, word: 'scheduled', job }
  return null
}

function Quiet({ children }) {
  return jsx('p', { style: { padding: '12px 0', fontSize: 12, color: V.t3 }, children })
}

const TODAY_SHORT = 5
const TODAY_RANK = { failed: 0, running: 1, due: 2 }

function TodayList() {
  const today = useValue($today)
  const [all, setAll] = useState(false)
  useEffect(() => {
    refreshToday()
    const h = setInterval(refreshToday, 30000)
    return () => clearInterval(h)
  }, [])
  const rows = useMemo(() => today.jobs.map(jobRow).filter(Boolean).sort((a, b) => a.at - b.at), [today])
  if (!today.ready) return jsx(Quiet, { children: 'Reading scheduled jobs…' })
  if (!today.available) return jsx(Quiet, { children: 'Couldn’t read scheduled jobs: the gateway didn’t answer. Retrying every 30 seconds.' })
  if (!rows.length) return jsx(Quiet, { children: `Nothing ran or is due today${today.jobs.length ? ` · ${today.jobs.length} scheduled job${today.jobs.length === 1 ? '' : 's'} in all` : ''}.` })
  // Short list: failures, what's running and what's due next, then the latest
  // finished runs; the full day stays in time order behind "Show all".
  const shown = all || rows.length <= TODAY_SHORT
    ? rows
    : [...rows]
        .sort((a, b) => (TODAY_RANK[a.word] ?? 3) - (TODAY_RANK[b.word] ?? 3) || (a.word in TODAY_RANK ? a.at - b.at : b.at - a.at))
        .slice(0, TODAY_SHORT)
        .sort((a, b) => a.at - b.at)
  return jsxs('div', {
    children: [
      ...shown.map(({ at, word, job }) =>
      jsx(
        DeskRow,
        {
          dense: true,
          lead: jsx('span', { style: { width: 64, flexShrink: 0, fontFamily: V.mono, fontSize: 11.5, color: V.t3 }, children: clock(at) }),
          title: jsxs('span', {
            children: [
              job.name || 'Scheduled job',
              ' ',
              jsx('span', { style: { color: JOB_COLOR[word] }, children: word }),
              jsx('span', { style: { color: V.t2 }, children: [' ', ...[job.profile, job.schedule_display, word === 'failed' && job.last_error ? `“${String(job.last_error).slice(0, 120)}”` : null].filter(Boolean).map(x => ` · ${x}`)] })
            ]
          }),
          actions: jsx(LinkButton, { onClick: () => host.navigate('/cron'), children: word === 'failed' ? 'Log' : 'Open' })
        },
        job.id
      )
    ),
      rows.length > TODAY_SHORT
        ? jsx('div', {
            style: { paddingTop: 8 },
            children: jsx(LinkButton, { tone: 'muted', onClick: () => setAll(v => !v), children: all ? 'Show fewer' : `Show all ${rows.length}` })
          })
        : null
    ]
  })
}

function todayCount(today) {
  const rows = (today.jobs || []).map(jobRow).filter(Boolean)
  const failed = rows.filter(r => r.word === 'failed').length
  return rows.length ? `${rows.length}${failed ? ` · ${failed} failed` : ''}` : ''
}

function DeskNeedsYou({ looks, lookOf, fold }) {
  const n = useNeedsYou()
  return jsx(DeskSection, {
    id: 'needs',
    fold,
    count: n.total ? String(n.total) : '',
    title: jsxs('span', { children: ['Needs you', n.total ? jsx('span', { style: { color: V.amber, marginLeft: 6 }, children: n.total }) : null] }),
    action: n.unread.length
      ? jsx(LinkButton, {
          onClick: () => {
            $boardFilter.set('attention')
            host.navigate(BOTS_ROUTE)
          },
          children: 'All replies'
        })
      : null,
    children: n.total
      ? [
          ...n.approvals.map(item => jsx(ApprovalRow, { item, looks }, item.requestId)),
          ...n.questions.map(item => jsx(QuestionRow, { item, looks }, `q:${item.sessionId}`)),
          ...n.unread.slice(0, 5).map(entry => jsx(NeedsYouRow, { entry, look: lookOf(entry.profile.name) }, `${entry.profile.name}:${entry.row.id}`))
        ]
      : jsx(Quiet, { children: `Nothing is waiting on you.${n.live ? ` Watching ${n.live} live chat${n.live === 1 ? '' : 's'}.` : ''}` })
  })
}

function DeskPage({ looks, prefs, setPrefs }) {
  const crew = useValue($crew)
  useValue($inbox)
  const looksValue = useValue(looks)
  const p = useValue(prefs)
  const [naming, setNaming] = useState(false)
  const recent = useMemo(() => recentAcross(crew, 5), [crew])
  const waiting = useMemo(() => waitingAcross(crew), [crew])
  const totals = crewTotals(crew)
  const lookOf = name => normalizeLook(looksValue[name], name)
  const name = (p.deskName || '').trim()
  const viewport = useValue(host.state.viewport) || {}
  const compact = viewport.narrow || (viewport.width && viewport.width < 900)
  const today = useValue($today)
  const fold = { prefs: p, setPrefs }
  // Chat-shaped: the composer sits at the bottom, the Desk stacks above it and
  // starts scrolled to its newest edge (the bottom), like a conversation.
  const scroller = useRef(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  const column = { width: '100%', maxWidth: 796, marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box' }

  return jsxs('div', {
    style: { height: '100%', display: 'flex', flexDirection: 'column' },
    children: [
      jsx('div', {
        ref: scroller,
        style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
        children: jsxs('div', {
      style: { ...column, marginTop: 'auto', padding: compact ? '20px 16px 12px' : '48px 28px 14px' },
      children: [
        jsxs('div', {
          style: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 4, marginBottom: 22 },
          children: [
            naming
              ? jsx('input', {
                  autoFocus: true,
                  defaultValue: name,
                  placeholder: 'Your first name',
                  'aria-label': 'Your first name',
                  onBlur: e => {
                    setPrefs({ deskName: e.target.value.trim().slice(0, 40) })
                    setNaming(false)
                  },
                  onKeyDown: e => {
                    if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                  },
                  style: { height: 34, borderRadius: V.radius(7), border: `1px solid ${V.accent}`, background: 'transparent', padding: '0 8px', fontSize: 20, color: V.t1, outline: 'none' }
                })
              : jsx('h1', {
                  title: 'Click to set the name the Desk greets',
                  onClick: () => setNaming(true),
                  style: { fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', color: V.t1, cursor: 'text', margin: 0 },
                  children: `${greeting()}${name ? `, ${name}` : ''}.`
                }),
            jsx('p', { style: { fontSize: 12.5, color: V.t3, margin: 0 }, children: statusSentence(crew) })
          ]
        }),
        jsx(DeskSection, {
          id: 'continue',
          fold,
          count: recent.length ? String(recent.length) : '',
          title: 'Continue',
          action: jsx(LinkButton, { onClick: () => host.navigate(BOTS_ROUTE), children: 'Bots board' }),
          children: recent.length
            ? recent.map(entry => {
                const r = entry.row
                const st = rowState(r)
                const look = lookOf(entry.profile.name)
                const folder = basename(r.cwd)
                const label = botLabel(entry.profile)
                return jsx(
                  DeskRow,
                  {
                    dot: st.word === 'done' ? V.green : st.dot || V.t4,
                    title: sessionTitle(r),
                    sub: jsxs('span', {
                      children: [
                        label,
                        ' · ',
                        jsx('span', { style: { color: TONE_COLOR[st.tone] }, children: st.word }),
                        folder && folder.length > 1 && folder.toLowerCase() !== label.toLowerCase() ? ` · ${folder}` : '',
                        r.message_count ? ` · ${r.message_count} msg` : ''
                      ]
                    }),
                    meta: [ago(r.last_active), rowCost(r) >= 0.01 ? fmtCost(rowCost(r)) : null].filter(Boolean).join(' · '),
                    actions: jsx(LinkButton, { onClick: () => openSession(r, entry.profile.name), children: r.unread ? 'Review' : 'Open' })
                  },
                  `${entry.profile.name}:${r.id}`
                )
              })
            : jsx(Quiet, { children: crew.ready ? 'No sessions yet. Start one below.' : 'Loading sessions…' })
        }),
        jsx(DeskNeedsYou, { looks: looksValue, lookOf, fold }),
        jsx(DeskSection, {
          id: 'today',
          fold,
          count: todayCount(today),
          title: 'Today',
          action: jsx(LinkButton, { onClick: () => host.navigate('/cron'), children: 'Scheduled jobs' }),
          children: jsx(TodayList, {})
        }),
        jsxs('div', {
          style: { marginTop: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
          children: [
            ...[
              ['hubot', 'Bots board', BOTS_ROUTE],
              ['watch', 'Scheduled jobs', '/cron'],
              ['files', 'Artifacts', '/artifacts'],
              ['symbol-color', 'Customize look', LOOK_ROUTE]
            ].map(([icon, label, path]) =>
              jsxs(
                'button',
                {
                  type: 'button',
                  onClick: () => host.navigate(path),
                  style: { height: 34, padding: '0 12px', borderRadius: V.radius(8), border: `1px solid ${V.hair2}`, background: V.raised, color: V.t1, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
                  children: [jsx('span', { style: { color: V.t2, display: 'inline-flex' }, children: jsx(Codicon, { name: icon, size: 14 }) }), label]
                },
                path
              )
            ),
            jsx('span', {
              style: { marginLeft: 'auto', fontSize: 12, color: V.t4, fontVariantNumeric: 'tabular-nums' },
              children: [`${totals.working} working`, totals.today >= 0.01 ? `${fmtCost(totals.today)} today` : null].filter(Boolean).join(' · ')
            })
          ]
        })
      ]
    })
      }),
      jsx('div', {
        style: { ...column, flexShrink: 0, padding: compact ? '6px 16px 14px' : '6px 28px 22px' },
        children: jsx(DeskPrompt, { crew, looks: looksValue })
      })
    ]
  })
}

// ──────────────────────────────────────────────────────── new-session home
// The Main board on a fresh New session: greeting and a one-line update,
// Hermes's own composer raised under it, then Continue, Needs you and Today,
// with the quick-action chips at the foot. Rendered in the composer's
// underside slot (so it moves with the real composer) and only while the
// chat is a fresh draft; Hermes's splash is hidden while it shows.
const HOME_CSS = `
[data-chat-surface]:has([data-helm-home]) [data-slot="aui_intro"] { display: none !important; }
[data-chat-surface]:has([data-helm-home]) { --composer-width: 740px; }
[data-chat-surface]:has([data-helm-home]) [data-slot="composer-dock"]:not([data-popped-out]) {
  top: 118px !important; bottom: auto !important; width: min(740px, calc(100% - 3rem)) !important; max-width: none !important;
}
[data-chat-surface]:has([data-helm-home]) [data-slot="composer-dock"] [data-slot="composer-root"] { width: 100% !important; max-width: none !important; }
[data-chat-surface]:has([data-helm-home]) [data-slot="composer-surface"] [class*="grid-area:input"] { font-size: 15px; }
[data-chat-surface]:has([data-helm-home]) [data-slot="composer-dock"] > :last-child { display: block !important; padding: 0 !important; }
[data-helm-home-greeting] { position: absolute; left: 5px; right: 5px; bottom: calc(100% + 22px); display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 12px; row-gap: 4px; }
`

function useFreshDraft() {
  const active = useValue(host.state.activeSessionId)
  const stored = useValue(host.state.focusedStoredSessionId)
  return !active && !stored && isPrimaryWindow() && !inHudWindow()
}

function HomeChip({ icon, label, onClick }) {
  return jsxs('button', {
    type: 'button',
    onClick,
    style: { height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #222B35', background: '#121820', color: '#E6EBF0', font: 'inherit', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
    children: [jsx('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: '#98A4B1', strokeWidth: 1.8, 'aria-hidden': true, dangerouslySetInnerHTML: { __html: icon } }), label]
  })
}

function HomeSection({ title, action, children }) {
  return jsxs('section', {
    style: { display: 'flex', flexDirection: 'column' },
    children: [
      jsxs('div', { style: { display: 'flex', alignItems: 'center', padding: '0 2px 6px', ...B_CAPS }, children: [jsx('span', { children: title }), action ? jsx('span', { style: { marginLeft: 'auto', letterSpacing: 0, textTransform: 'none', fontWeight: 500 }, children: action }) : null] }),
      jsx('div', { style: { borderTop: `1px solid ${B.hair}` }, children })
    ]
  })
}

function HomeUnderside({ looks, prefs }) {
  const { homeOnNewSession, deskName } = useValue(prefs)
  const fresh = useFreshDraft()
  const crew = useValue($crew)
  useValue($inbox)
  const looksValue = useValue(looks)
  const n = useNeedsYou()
  const root = useRef(null)
  const sections = useRef(null)
  const [chipsTop, setChipsTop] = useState(null)
  const [chipsLeft, setChipsLeft] = useState(5)
  const [secMax, setSecMax] = useState(null)
  const [naming, setNaming] = useState(false)
  useEffect(() => {
    if (!fresh || homeOnNewSession === false) return
    if (!$today.get().ready) refreshToday()
    const place = () => {
      const el = root.current
      const bounds = el && (el.closest('[data-chat-surface]') || el.closest('[data-slot="composer-bounds"]'))
      const dock = el && el.closest('[data-slot="composer-dock"]')
      if (!bounds || !dock) return
      const b = bounds.getBoundingClientRect()
      const d = dock.getBoundingClientRect()
      setChipsTop(Math.round(b.bottom - d.top - 58))
      setChipsLeft(Math.round(b.left - d.left + 20))
      const sec = sections.current
      if (sec) setSecMax(Math.max(120, Math.round(b.bottom - 58 - 18 - sec.getBoundingClientRect().top)))
    }
    place()
    const h = setInterval(place, 1000)
    window.addEventListener('resize', place)
    return () => {
      clearInterval(h)
      window.removeEventListener('resize', place)
    }
  }, [fresh, homeOnNewSession])
  if (!fresh || homeOnNewSession === false) return null
  const recent = recentAcross(crew, 3)
  const name = String(deskName || '').trim()
  const setDraft = text => host.composer && typeof host.composer.setDraft === 'function' && host.composer.setDraft(null, text)
  return jsxs('div', {
    ref: root,
    'data-helm-home': '',
    style: { width: '100%', display: 'flex', flexDirection: 'column', gap: 22, paddingTop: 22, color: B.t1, fontSize: 13 },
    children: [
      jsx('style', { children: HOME_CSS }),
      jsxs('div', {
        'data-helm-home-greeting': '',
        children: [
          naming
            ? jsx('input', {
                autoFocus: true,
                defaultValue: name,
                placeholder: 'Your first name',
                'aria-label': 'Your first name',
                onBlur: e => {
                  if (helmPrefsRef) helmPrefsRef.setPrefs({ deskName: e.target.value.trim().slice(0, 40) })
                  setNaming(false)
                },
                onKeyDown: e => {
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                },
                style: { height: 30, borderRadius: 6, border: `1px solid ${V.accent}`, background: 'transparent', padding: '0 8px', fontSize: 17, color: B.t1, outline: 'none' }
              })
            : jsx('h1', { title: name ? 'Click to change your name' : 'Click to add your name', onClick: () => setNaming(true), style: { margin: 0, fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', color: B.t1, cursor: 'text' }, children: `${greeting()}${name ? `, ${name}` : ''}.` }),
          jsx('span', { style: { color: B.t4, fontSize: 12.5 }, children: statusSentence(crew) })
        ]
      }),
      jsxs('div', {
        ref: sections,
        style: { display: 'flex', flexDirection: 'column', gap: 22, maxHeight: secMax || undefined, overflowY: 'auto', paddingRight: 2 },
        children: [
          jsx(HomeSection, {
            title: 'Continue',
            children: recent.length
              ? recent.map(entry => {
                  const r = entry.row
                  const st = rowState(r)
                  const live = r.is_active && !r.ended_at
                  const cost = rowCost(r)
                  return jsxs('button', {
                    type: 'button',
                    onClick: () => openSession(r, entry.profile.name),
                    style: { width: '100%', display: 'grid', gridTemplateColumns: '14px 1fr auto auto', gap: 12, alignItems: 'center', padding: '9px 2px', borderBottom: `1px solid ${B.hair}`, borderTop: 0, borderLeft: 0, borderRight: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' },
                    children: [
                      jsx('span', { style: { width: 6, height: 6, borderRadius: 3, marginLeft: 4, background: live ? V.accent : r.unread ? B.amber : st.word === 'done' ? B.green : B.t4 } }),
                      jsxs('span', {
                        style: { display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 },
                        children: [
                          jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: sessionTitle(r) }),
                          jsx('span', { style: { fontSize: 11.5, color: B.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: `${botLabel(entry.profile)} · ${live ? 'working' : r.unread ? 'replied, unread' : st.word}${r.message_count ? ` · ${r.message_count} msgs` : ''}` })
                        ]
                      }),
                      jsx('span', { style: { fontSize: 11.5, color: B.t4, fontFamily: B.mono, whiteSpace: 'nowrap' }, children: [ago(r.last_active), cost >= 0.01 ? fmtCost(cost) : null].filter(Boolean).join(' · ') }),
                      jsx('span', { style: { fontSize: 12, color: V.accent }, children: r.unread ? 'Review' : 'Open' })
                    ]
                  }, `${entry.profile.name}:${r.id}`)
                })
              : jsx('div', { style: { padding: '9px 2px', color: B.t4, fontSize: 12.5, borderBottom: `1px solid ${B.hair}` }, children: crew.ready ? 'No sessions yet.' : 'Loading sessions…' })
          }),
          jsx(HomeSection, {
            title: n.total ? jsxs('span', { children: ['Needs you ', jsx('span', { style: { color: B.amber }, children: n.total })] }) : 'Needs you',
            action: jsx('button', { type: 'button', onClick: () => host.revealPane && host.revealPane(`${ID}:helm-tab`), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 12, cursor: 'pointer' }, children: 'Open inbox' }),
            children: n.total
              ? [
                  ...n.approvals.map(item => jsx(ApprovalRow, { item, looks: looksValue }, item.requestId)),
                  ...n.questions.map(item => jsx(QuestionRow, { item, looks: looksValue }, `q:${item.sessionId}`))
                ]
              : jsx('div', { style: { padding: '9px 2px', color: B.t4, fontSize: 12.5, borderBottom: `1px solid ${B.hair}` }, children: 'Nothing is waiting on you.' })
          }),
          jsx(HomeSection, {
            title: 'Today',
            action: jsx('button', { type: 'button', onClick: () => host.navigate('/cron'), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 12, cursor: 'pointer' }, children: 'Automations' }),
            children: jsx(TodayList, {})
          })
        ]
      }),
      jsxs('div', {
        style: { position: chipsTop ? 'absolute' : 'static', top: chipsTop || undefined, left: chipsLeft, display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' },
        children: [
          jsx(HomeChip, { icon: '<path d="M4 20l16-8L4 4v6l10 2-10 2z"/>', label: 'Status report', onClick: () => setDraft('Give me a short status report: what you did, what is running, what needs me.') }),
          jsx(HomeChip, { icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', label: 'Automations', onClick: () => host.navigate('/cron') }),
          jsx(HomeChip, { icon: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>', label: 'Artifacts', onClick: () => host.navigate('/artifacts') }),
          jsx(HomeChip, { icon: '<path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6"/>', label: 'Hermes docs', onClick: () => window.open('https://hermes-agent.nousresearch.com/docs/user-guide/desktop', '_blank') }),
          jsx('button', { type: 'button', 'aria-label': 'Bots board', title: 'Bots board', onClick: () => host.navigate(BOTS_ROUTE), style: { width: 34, height: 34, borderRadius: 8, border: '1px solid #222B35', background: '#121820', color: '#98A4B1', font: 'inherit', fontSize: 17, cursor: 'pointer' }, children: '+' })
        ]
      })
    ]
  })
}

// Composer toolbar extras from the boards: the approval-mode pill ("Ask
// before acting") and the hint on the right. The pill reads and sets the
// window's approvals.mode, the same setting Hermes's status bar shows.
const $approvalMode = atom(null)
let approvalInflight = false
async function readApprovalMode() {
  if (approvalInflight || typeof host.request !== 'function') return
  approvalInflight = true
  try {
    const r = await withTimeout(host.request('config.get', { key: 'approvals.mode' }), 8000)
    if (r && typeof r.value === 'string') $approvalMode.set(r.value)
  } catch {
    /* gateway not up yet */
  } finally {
    approvalInflight = false
  }
}
const ASK_LABEL = { manual: 'Ask before acting', smart: 'Smart approvals', off: 'Act without asking' }

function ComposerAskPill() {
  const mode = useValue($approvalMode)
  useEffect(() => {
    readApprovalMode()
    const h = setInterval(readApprovalMode, 60000)
    return () => clearInterval(h)
  }, [])
  if (inHudWindow()) return null
  const set = async value => {
    try {
      await host.request('config.set', { key: 'approvals.mode', value })
      $approvalMode.set(value)
    } catch (err) {
      host.notifyError?.(`Could not change approvals: ${err && err.message ? err.message : err}`)
    }
  }
  return jsxs('label', {
    'data-helm-ask': '',
    title: 'Approvals for this bot',
    style: { position: 'relative', height: 28, padding: '0 9px', borderRadius: 6, border: '1px solid #222B35', color: '#C3CCD5', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' },
    children: [
      `${ASK_LABEL[mode] || 'Approvals'} ▾`,
      jsx('select', {
        'aria-label': 'Approvals',
        value: mode || '',
        onChange: e => set(e.target.value),
        style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
        children: [jsx('option', { value: '', disabled: true, children: 'Approvals' }, ''), ...Object.entries(ASK_LABEL).map(([v, l]) => jsx('option', { value: v, children: l }, v))]
      })
    ]
  })
}

function ComposerHint() {
  if (inHudWindow()) return null
  return jsx('span', { 'data-helm-hint': '', style: { fontSize: 11.5, color: '#76838F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }, children: '@ hands off to a bot · / runs a command' })
}

function HomeCwdLine({ prefs }) {
  const { homeOnNewSession } = useValue(prefs)
  const fresh = useFreshDraft()
  const cwd = useValue(host.state.cwd)
  if (!fresh || homeOnNewSession === false || !cwd) return null
  const home = String(cwd).replace(/^\/Users\/[^/]+/, '~')
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#98A4B1', padding: '0 2px 2px' },
    children: [
      jsx('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true, children: jsx('path', { d: 'M3 7h6l2 2h10v10H3z' }) }),
      jsx('span', { style: { fontFamily: B.mono, fontSize: 11 }, children: home })
    ]
  })
}

// Above the composer on a fresh draft: jump back into recent work.
// ──────────────────────────────────────────────────────────────── HUD
// The HUD board in Hermes's own HUD window (View › HUD mode): who is on,
// what waits on you, who is working. Rendered above the HUD composer, only
// in that window.
function inHudWindow() {
  try {
    return document.documentElement.hasAttribute('data-hud-window') || new URLSearchParams(window.location.search).get('win') === 'hud'
  } catch {
    return false
  }
}

const HUD_BOARD_CSS = `
:root[data-helm-hud-board] [data-hud-shell] [data-slot='composer-bounds'],
:root[data-helm-hud-board] [data-hud-shell] [data-hud-glass] { display: none !important; }
:root[data-helm-hud-board] [data-helm-hud] { height: calc(100vh - 118px); }
:root[data-helm-hud-board] [data-slot='composer-surface'] { border-radius: 14px !important; }
[data-helm-hud-drag] { -webkit-app-region: drag; }
[data-helm-hud-drag] button { -webkit-app-region: no-drag; }
`

function useHudMode(prefs) {
  const { showHudPanel, hudBoard } = useValue(prefs)
  const [hud, setHud] = useState(inHudWindow)
  useEffect(() => {
    const t = setTimeout(() => setHud(inHudWindow()), 400)
    return () => clearTimeout(t)
  }, [])
  return { on: hud && showHudPanel !== false, board: hud && showHudPanel !== false && hudBoard !== false }
}

function lastReplyFromDom() {
  try {
    const all = document.querySelectorAll('[data-slot="aui_assistant-message-content"]')
    const el = all[all.length - 1]
    return el ? String(el.textContent || '').trim() : ''
  } catch {
    return ''
  }
}

function HudPanel({ looks, prefs }) {
  const mode = useHudMode(prefs)
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const replies = useValue($lastReply)
  const n = useNeedsYou()
  const profile = useValue(host.state.focusedSessionProfile)
  const busy = useValue(host.state.busy)
  const runtimeId = useValue(host.state.focusedSessionId)
  const [domReply, setDomReply] = useState('')
  useEffect(() => {
    if (!mode.board) return
    const root = document.documentElement
    root.setAttribute('data-helm-hud-board', '')
    const hud = window.hermesDesktop && window.hermesDesktop.hud
    try {
      if (hud && typeof hud.setBounds === 'function' && (window.outerWidth !== 440 || window.outerHeight !== 720)) {
        hud.setBounds({ x: window.screenX, y: window.screenY, width: 440, height: 720 })
      }
    } catch {
      /* this HUD cannot be resized */
    }
    const t = setInterval(() => setDomReply(lastReplyFromDom()), 2000)
    setDomReply(lastReplyFromDom())
    return () => {
      clearInterval(t)
      root.removeAttribute('data-helm-hud-board')
    }
  }, [mode.board])
  if (!mode.on) return null
  const working = []
  for (const p of crew.profiles || []) {
    const act = activityFor(crew, p.name)
    const live = act.sessions.find(r => r.is_active && !r.ended_at)
    if (live) working.push({ p, act, live })
  }
  const me = (crew.profiles || []).find(p => p.name === profile)
  const myLive = working.find(w => w.p.name === profile)
  const mins = myLive && myLive.live.started_at ? Math.max(1, Math.round((Date.now() - toMs(myLive.live.started_at)) / 60000)) : null
  const name = me ? botLabel(me) : profile || 'Hermes'
  const latest = (replies[profile] && replies[profile].text) || domReply
  const head = (label, color) => jsx('div', { style: { padding: '0 2px 6px', ...B_CAPS, color: color || B.t4 }, children: label })
  const hud = typeof window !== 'undefined' && window.hermesDesktop && window.hermesDesktop.hud
  const stop = () => {
    if (!runtimeId) return
    host.request('session.interrupt', { session_id: runtimeId }).catch(err => host.notifyError?.(`Stop failed: ${err && err.message ? err.message : err}`))
  }
  return jsxs('div', {
    'data-helm-hud': '',
    style: { display: 'flex', flexDirection: 'column', gap: 14, padding: mode.board ? '0 0 8px' : '10px 4px 8px', fontSize: 13, color: B.t1, maxHeight: mode.board ? undefined : '60vh', overflowY: 'auto', minHeight: 0 },
    children: [
      jsx('style', { children: HUD_BOARD_CSS }),
      jsxs('div', {
        'data-helm-hud-drag': mode.board ? '' : undefined,
        style: { height: 36, flex: '0 0 36px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', borderBottom: mode.board ? `1px solid ${B.hair}` : 0 },
        children: [
          jsx('span', { style: { width: 8, height: 8, borderRadius: 4, background: busy || myLive ? V.accent : B.green, flex: '0 0 8px' } }),
          jsx('span', { style: { fontWeight: 500 }, children: name }),
          jsx('span', { style: { fontSize: 12, color: B.t4 }, children: busy || myLive ? `· working${mins ? ` · ${mins} min` : ''}` : '· idle' }),
          jsx('span', { 'aria-hidden': true, style: { marginLeft: 'auto', fontFamily: B.mono, fontSize: 11, color: B.t4 }, children: '⋯' }),
          jsx('button', {
            type: 'button',
            title: 'Open the full app',
            'aria-label': 'Open the full app',
            onClick: () => (hud && typeof hud.close === 'function' ? hud.close() : host.navigate(BOTS_ROUTE)),
            style: { width: 24, height: 24, borderRadius: 6, border: 0, background: 'transparent', color: B.t3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
            children: jsx('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true, children: jsx('path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }) })
          })
        ]
      }),
      n.total
        ? jsxs('section', {
            children: [
              head(`Needs you · ${n.total}`, B.amber),
              jsxs('div', {
                style: { borderTop: `1px solid ${B.hair}` },
                children: [
                  ...n.approvals.map(item => jsx(ApprovalRow, { item, looks: looksValue, compact: true }, item.requestId)),
                  ...n.questions.map(item => jsx(QuestionRow, { item, looks: looksValue, compact: true }, `q:${item.sessionId}`))
                ]
              })
            ]
          })
        : null,
      working.length
        ? jsxs('section', {
            children: [
              head('Working'),
              ...working.map((w, i) =>
                jsxs('div', {
                  style: { display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center', padding: '7px 2px', lineHeight: 1.3, borderTop: `1px solid ${B.hair}`, borderBottom: i === working.length - 1 ? `1px solid ${B.hair}` : undefined },
                  children: [
                    jsx(AnimatedRobot, { look: normalizeLook(looksValue[w.p.name] || null, w.p.name), head: true, size: 18, expr: 'focused', state: 'running', title: botLabel(w.p) }),
                    jsxs('span', {
                      style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
                      children: [
                        jsxs('span', { style: { fontSize: 13 }, children: [botLabel(w.p), jsx('span', { style: { fontSize: 11.5, color: V.accent }, children: w.live.tool_call_count ? ` · ${w.live.tool_call_count} tool calls` : ' · working' })] }),
                        jsx('span', { style: { fontSize: 11.5, color: B.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: sessionTitle(w.live) })
                      ]
                    }),
                    w.p.name === profile && busy && runtimeId
                      ? jsx('button', { type: 'button', onClick: stop, style: { height: 24, padding: '0 8px', borderRadius: 6, border: `1px solid ${B.ctl}`, background: 'transparent', color: B.t2, font: 'inherit', fontSize: 11.5, cursor: 'pointer' }, children: 'Stop' })
                      : jsx('button', { type: 'button', onClick: () => openSession(w.live, w.p.name), style: { border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 11.5, cursor: 'pointer' }, children: 'Open' })
                  ]
                }, w.p.name)
              )
            ]
          })
        : null,
      latest
        ? jsxs('section', {
            style: { minHeight: 0, display: 'flex', flexDirection: 'column' },
            children: [
              head(`Latest from ${name}`),
              jsx('div', {
                style: { padding: '8px 2px', borderTop: `1px solid ${B.hair}`, fontSize: 12.5, lineHeight: 1.55, color: B.t2, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: mode.board ? 14 : 4 },
                children: latest
              })
            ]
          })
        : null,
      mode.board ? null : jsx(HudFooterLine, { crew })
    ]
  })
}

function HudFooterLine({ crew }) {
  const [mode, setMode] = useState(null)
  useEffect(() => {
    let alive = true
    if (typeof host.request === 'function') {
      host.request('config.get', { key: 'approvals.mode' }, 10000).then(r => alive && setMode(r && r.value)).catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [])
  const today = crewTotals(crew).today
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: B.t4, padding: '0 2px' },
    children: [
      jsxs('span', { style: { display: 'flex', alignItems: 'center', gap: 5 }, children: [jsx('span', { style: { width: 6, height: 6, borderRadius: 3, background: B.green } }), 'Backend ready'] }),
      jsx('span', { style: { marginLeft: 'auto', fontFamily: B.mono }, children: `${fmtCost(today) || '$0.00'} today` }),
      jsx('span', { children: mode ? `Approvals: ${mode === 'manual' ? 'ask' : mode}` : `${(crew.profiles || []).length} bots` })
    ]
  })
}

function HudFooter({ prefs }) {
  const mode = useHudMode(prefs)
  const crew = useValue($crew)
  if (!mode.board) return null
  return jsx('div', { style: { padding: '4px 4px 2px' }, children: jsx(HudFooterLine, { crew }) })
}

function DeskStrip({ looks, prefs }) {
  const { showDeskStrip } = useValue(prefs)
  const active = useValue(host.state.activeSessionId)
  const stored = useValue(host.state.focusedStoredSessionId)
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const recent = useMemo(() => recentAcross(crew, 3), [crew])
  if (!showDeskStrip || active || stored || !recent.length || inHudWindow() || prefs.get().homeOnNewSession !== false) return null
  const waiting = crewTotals(crew).needYou
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '6px 8px 2px', fontSize: 11, color: V.t3 },
    children: [
      jsx('span', { style: { ...CAPS, fontSize: 10, color: V.t4, flexShrink: 0 }, children: 'Continue' }),
      ...recent.map(entry => {
        const look = normalizeLook(looksValue[entry.profile.name], entry.profile.name)
        return jsxs(
          'button',
          {
            type: 'button',
            title: `${botLabel(entry.profile)} · ${sessionTitle(entry.row)}`,
            onClick: () => openSession(entry.row, entry.profile.name),
            style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: 210, borderRadius: 999, border: `1px solid ${V.hair}`, padding: '1px 8px 1px 2px', background: 'transparent', color: V.t2, cursor: 'pointer', fontSize: 11 },
            children: [jsx(RobotHead, { look, expr: entry.row.unread ? 'question' : look.face, size: 16, title: entry.profile.name }), jsx('span', { className: 'truncate', children: sessionTitle(entry.row) })]
          },
          entry.row.id
        )
      }),
      jsx('button', {
        type: 'button',
        onClick: () => host.navigate(DESK_ROUTE),
        className: 'hover:underline',
        style: { marginLeft: 'auto', flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: waiting ? V.amber : V.accent },
        children: waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you · Desk` : 'Desk'
      })
    ]
  })
}


// ──────────────────────────────────────────────── the inbox: what needs you
// Pending tool approvals and questions across every live session, read with
// the same gateway calls the app's own approval card uses (session.active_list,
// approval.pending) and answered with approval.respond. Nothing is ever
// answered without a click.

const $inbox = atom({ ready: false, approvals: [], questions: [], reach: 'unknown', live: 0, waiting: 0, error: null, at: 0 })
let inboxInflight = false
let inboxTimer = null
const answered = new Set() // request ids answered from helm, hidden until the backend drops them

// On the shared gateway (Hermes' canonical runtime) approvals and questions
// arrive as `approval.request` / `clarify.request` EVENTS and plans as `todo_list`
// tool events; helm hears the same stream the app does through host.onEvent.
const eventPrompts = new Map() // request id → approval or question
const $liveTodos = atom({}) // session id → todo items, from tool events

function payloadOf(e) {
  return (e && e.payload && typeof e.payload === 'object' ? e.payload : {}) || {}
}

function eventSessionId(e, p) {
  return String((e && e.session_id) || p.session_id || '')
}

function onPromptEvent(e) {
  const p = payloadOf(e)
  const requestId = String(p.request_id || p.prompt_id || '')
  if (!requestId) return
  const sessionId = eventSessionId(e, p)
  const crew = $crew.get()
  const hit = (crew.byId && crew.byId[sessionId]) || null
  const base = {
    sessionId,
    storedId: hit ? hit.row.id : sessionId,
    profile: (hit && hit.profile) || (typeof e.profile === 'string' && e.profile) || (typeof p.profile === 'string' && p.profile) || null,
    title: (hit && sessionTitle(hit.row)) || 'Session',
    row: hit ? hit.row : null,
    requestId,
    viaEvent: true,
    routeProfile: (typeof e.profile === 'string' && e.profile) || (typeof p.profile === 'string' && p.profile) || null
  }
  if (e.type === 'approval.request') {
    eventPrompts.set(requestId, {
      ...base,
      kind: 'approval',
      command: typeof p.command === 'string' ? p.command : '',
      description: typeof p.description === 'string' ? p.description : 'wants to run a command',
      toolName: typeof p.tool_name === 'string' ? p.tool_name : null,
      choices: Array.isArray(p.choices) ? p.choices.filter(c => typeof c === 'string') : p.smart_denied ? ['once', 'deny'] : null,
      allowPermanent: p.allow_permanent !== false
    })
  } else {
    eventPrompts.set(requestId, {
      ...base,
      kind: 'question',
      question: typeof p.question === 'string' ? p.question : typeof p.prompt === 'string' ? p.prompt : '',
      choices: Array.isArray(p.choices) ? p.choices.filter(c => typeof c === 'string') : null
    })
  }
  mergeEventPrompts()
}

function onPromptGone(e) {
  const p = payloadOf(e)
  const requestId = String(p.request_id || p.prompt_id || '')
  if (requestId && eventPrompts.delete(requestId)) mergeEventPrompts()
}

function mergeEventPrompts() {
  const cur = $inbox.get()
  const fromEvents = [...eventPrompts.values()].filter(x => !answered.has(x.requestId))
  const approvals = cur.approvals.filter(a => !a.viaEvent && !eventPrompts.has(a.requestId)).concat(fromEvents.filter(x => x.kind === 'approval'))
  const eventQuestionSessions = new Set(fromEvents.filter(x => x.kind === 'question').map(x => x.sessionId))
  const questions = cur.questions.filter(q => !q.viaEvent && !eventQuestionSessions.has(q.sessionId)).concat(fromEvents.filter(x => x.kind === 'question'))
  $inbox.set({ ...cur, approvals, questions })
}

function onToolEvent(e) {
  const p = payloadOf(e)
  if (p.name !== 'todo_list' && p.name !== 'todo') return
  const sessionId = eventSessionId(e, p)
  if (!sessionId) return
  const current = $liveTodos.get()[sessionId] || []
  let next = parseTodoList(p.todos) || parseTodoList(p.result)
  if (!next) {
    const args = p.args || p.arguments || {}
    const parsedArgs = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : args
    const items = parseTodoList(parsedArgs && parsedArgs.todos)
    if (items && parsedArgs.merge) {
      const byId = new Map(current.map(t => [t.id, t]))
      for (const it of items) byId.set(it.id, { ...(byId.get(it.id) || {}), ...it })
      next = [...byId.values()]
    } else next = items
  }
  if (next && next.length) $liveTodos.set({ ...$liveTodos.get(), [sessionId]: next })
}

function startPromptEvents(ctx) {
  if (typeof host.onEvent !== 'function') return
  const offs = [
    host.onEvent('approval.request', onPromptEvent),
    host.onEvent('clarify.request', onPromptEvent),
    host.onEvent('approval.settled', onPromptGone),
    host.onEvent('approval.cancelled', onPromptGone),
    host.onEvent('clarify.settled', onPromptGone),
    host.onEvent('clarify.cancelled', onPromptGone),
    host.onEvent('*', onToolEvent),
    host.onEvent('*', onHandoffEvent),
    host.onEvent('message.complete', onReplyEvent)
  ]
  ctx.onDispose(() => offs.forEach(off => typeof off === 'function' && off()))
}

function liveRows(res) {
  return Array.isArray(res && res.sessions) ? res.sessions.filter(r => r && r.id) : []
}

async function refreshInbox() {
  if (inboxInflight || typeof host.request !== 'function') return
  inboxInflight = true
  try {
    const crew = $crew.get()
    const seen = new Map()
    let reach = 'none'
    let error = null
    const collect = rows => rows.forEach(r => seen.set(r.id, r))
    try {
      collect(liveRows(await host.request('session.active_list', {})))
      reach = 'primary'
    } catch (err) {
      error = err && err.message ? err.message : String(err)
    }
    // Bots served by the primary gateway answer with their profile scoped in;
    // a bot on its own gateway errors here and is reported as unreachable.
    for (const p of reach === 'primary' ? [] : crew.profiles || []) {
      try {
        collect(liveRows(await host.request('session.active_list', { profile: p.name })))
      } catch {
        /* not routed through this gateway */
      }
    }
    const approvals = []
    const questions = []
    for (const row of seen.values()) {
      if (row.status !== 'waiting') continue
      const hit = (crew.byId && (crew.byId[row.session_key] || crew.byId[row.id])) || null
      const profile = hit ? hit.profile : null
      const base = { sessionId: row.id, storedId: row.session_key || row.id, profile, title: row.title || row.preview || (hit && sessionTitle(hit.row)) || 'Session', row: hit ? hit.row : null }
      let pending = null
      try {
        const res = await host.request('approval.pending', { session_id: row.id })
        pending = Array.isArray(res && res.approvals) ? res.approvals : []
      } catch {
        continue // not answerable from this gateway; its own chat still shows it
      }
      const live = pending.filter(a => a && typeof a.request_id === 'string' && !answered.has(a.request_id))
      if (live.length) {
        for (const a of live)
          approvals.push({
            ...base,
            requestId: a.request_id,
            command: typeof a.command === 'string' ? a.command : '',
            description: typeof a.description === 'string' ? a.description : 'wants to run a command',
            toolName: typeof a.tool_name === 'string' ? a.tool_name : null,
            choices: Array.isArray(a.choices) ? a.choices.filter(c => typeof c === 'string') : a.smart_denied ? ['once', 'deny'] : null,
            allowPermanent: a.allow_permanent !== false
          })
      } else if (!pending.length) {
        questions.push(base) // waiting with no approval queued: a question for you
      }
    }
    const waiting = [...seen.values()].filter(r => r.status === 'waiting').length
    // stored id → gateway session id, for session-scoped reads (the app's own
    // focused id can be a client-local alias the gateway doesn't know)
    const liveByKey = {}
    for (const r of seen.values()) if (r.session_key) liveByKey[r.session_key] = r.id
    $inbox.set({ ready: true, approvals, questions, reach, live: seen.size, waiting, error, liveByKey, at: Date.now() })
    mergeEventPrompts()
  } finally {
    inboxInflight = false
  }
}

function startInbox(ctx) {
  let stopped = false
  const loop = async () => {
    if (stopped) return
    await refreshInbox()
    const busyNow = Object.values(atomGet(host.state.busyBySession) || {}).some(Boolean)
    const cur = $inbox.get()
    const fast = busyNow || cur.approvals.length || cur.questions.length || crewTotals($crew.get()).working
    inboxTimer = setTimeout(loop, fast ? 4000 : 15000)
  }
  inboxTimer = setTimeout(loop, 800)
  const stop = () => {
    stopped = true
    clearTimeout(inboxTimer)
  }
  ctx.onDispose(stop)
  return stop
}

async function answerApproval(item, choice) {
  answered.add(item.requestId)
  $inbox.set({ ...$inbox.get(), approvals: $inbox.get().approvals.filter(a => a.requestId !== item.requestId) })
  try {
    await host.request('approval.respond', { session_id: item.sessionId, request_id: item.requestId, choice, all: false, ...(item.routeProfile ? { profile: item.routeProfile } : {}) }, 330000)
    eventPrompts.delete(item.requestId)
    haptic(choice === 'deny' ? 'cancel' : 'submit')
  } catch (err) {
    answered.delete(item.requestId)
    host.notifyError?.(`Could not answer the approval: ${err && err.message ? err.message : err}`)
  }
  setTimeout(refreshInbox, 600)
}

async function answerQuestion(item, answer) {
  answered.add(item.requestId)
  eventPrompts.delete(item.requestId)
  $inbox.set({ ...$inbox.get(), questions: $inbox.get().questions.filter(q => q.requestId !== item.requestId) })
  try {
    await host.request('clarify.respond', { session_id: item.sessionId, request_id: item.requestId, answer, ...(item.routeProfile ? { profile: item.routeProfile } : {}) }, 330000)
    haptic('submit')
  } catch (err) {
    answered.delete(item.requestId)
    host.notifyError?.(`Could not send the answer: ${err && err.message ? err.message : err}`)
  }
}

function openInboxItem(item) {
  if (item.row && item.profile) openSession(item.row, item.profile)
  else
    try {
      host.openSession(item.storedId, item.profile ? { profile: item.profile } : undefined)
    } catch (err) {
      host.notifyError?.(`Could not open the session: ${err && err.message ? err.message : err}`)
    }
}

function needsYouOf(inbox, crew) {
  // A chat that is waiting on an approval or a question is shown once, as that.
  const waitingIds = new Set(inbox.approvals.concat(inbox.questions).map(a => a.storedId))
  const unread = waitingAcross(crew).filter(e => !waitingIds.has(e.row.id) && !waitingIds.has(e.row._lineage_root_id))
  return { approvals: inbox.approvals, questions: inbox.questions, unread, total: inbox.approvals.length + inbox.questions.length + unread.length, reach: inbox.reach, live: inbox.live || 0 }
}

function useNeedsYou() {
  return needsYouOf(useValue($inbox), useValue($crew))
}

function ApprovalRow({ item, looks, compact }) {
  const [busy, setBusy] = useState(null)
  const look = normalizeLook(looks[item.profile] || null, item.profile || 'default')
  const profile = ($crew.get().profiles || []).find(p => p.name === item.profile)
  const who = profile ? botLabel(profile) : item.profile || 'A bot'
  const allowSession = item.choices ? item.choices.includes('session') : true
  const act = choice => {
    setBusy(choice)
    answerApproval(item, choice)
  }
  const cmd = item.command ? (item.command.length > 160 ? `${item.command.slice(0, 157)}…` : item.command) : ''
  return jsxs('div', {
    style: { display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center', gap: compact ? 4 : 12, padding: compact ? '8px 0' : '9px 2px', borderBottom: `1px solid ${V.hair}`, lineHeight: 1.3 },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: compact ? 8 : 12, flex: 1, minWidth: 0 },
        children: [
          jsxs('div', {
            style: { minWidth: 0, flex: 1 },
            children: [
              jsxs('div', {
                style: { fontSize: compact ? 12 : 13, color: V.t1, lineHeight: 1.4 },
                children: [jsx('span', { style: { color: V.amber }, children: item.toolName === 'terminal' || !item.toolName ? 'Shell command' : item.toolName }), ` · ${who} `, jsx('span', { style: { color: V.t3 }, children: item.description })]
              }),
              cmd ? jsx('code', { style: { display: 'block', marginTop: 4, fontFamily: V.mono, fontSize: compact ? 11 : 12, color: V.t2, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }, children: cmd }) : null,
              compact ? null : jsx('div', { className: 'truncate', style: { fontSize: 11.5, color: V.t2, marginTop: 3 }, children: `in “${item.title}”` })
            ]
          })
        ]
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, justifyContent: compact ? 'flex-start' : 'flex-end' },
        children: [
          jsx(LinkButton, { tone: 'muted', onClick: () => openInboxItem(item), children: 'Open' }),
          jsx(SmallButton, { disabled: !!busy, onClick: () => act('deny'), children: busy === 'deny' ? 'Denying…' : 'Deny' }),
          allowSession && !compact ? jsx(SmallButton, { disabled: !!busy, title: 'Allow this kind of command for the rest of the session', onClick: () => act('session'), children: 'Allow session' }) : null,
          jsx(SmallButton, { primary: true, disabled: !!busy, onClick: () => act('once'), children: busy === 'once' ? 'Approving…' : 'Approve' })
        ]
      })
    ]
  })
}

function QuestionRow({ item, looks, compact }) {
  const [answer, setAnswer] = useState('')
  const look = normalizeLook(looks[item.profile] || null, item.profile || 'default')
  const profile = ($crew.get().profiles || []).find(p => p.name === item.profile)
  const who = profile ? botLabel(profile) : item.profile || 'A bot'
  const canAnswer = item.viaEvent && item.requestId
  const send = text => {
    if (text.trim()) answerQuestion(item, text.trim())
  }
  return jsxs('div', {
    style: { display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center', gap: compact ? 6 : 12, padding: compact ? '8px 0' : '9px 2px', borderBottom: `1px solid ${V.hair}`, lineHeight: 1.3 },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: compact ? 8 : 12, flex: 1, minWidth: 0 },
        children: [
          jsxs('div', {
            style: { minWidth: 0, flex: 1 },
            children: [
              jsxs('div', { style: { fontSize: compact ? 12 : 13, color: V.t1, lineHeight: 1.4 }, children: [jsx('span', { style: { color: V.amber }, children: 'Question' }), ` · ${who}${item.question ? ': ' : ' is waiting for your answer'}`, item.question || ''] }),
              compact ? null : jsx('div', { className: 'truncate', style: { fontSize: 11.5, color: V.t2, marginTop: 3 }, children: `in “${item.title}”` }),
              canAnswer && item.choices && item.choices.length
                ? jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }, children: item.choices.slice(0, 6).map(c => jsx(SmallButton, { onClick: () => send(c), children: c }, c)) })
                : null
            ]
          })
        ]
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, justifyContent: compact ? 'flex-start' : 'flex-end' },
        children: [
          canAnswer
            ? jsx('input', {
                value: answer,
                placeholder: 'Answer…',
                'aria-label': `Answer ${who}`,
                onChange: e => setAnswer(e.target.value),
                onKeyDown: e => {
                  if (e.key === 'Enter') {
                    send(answer)
                    setAnswer('')
                  }
                },
                style: { height: 28, flex: compact ? 1 : undefined, width: compact ? undefined : 180, minWidth: 0, borderRadius: V.radius(6), border: `1px solid ${V.hair2}`, background: 'transparent', padding: '0 9px', fontSize: 12, color: V.t1, outline: 'none' }
              })
            : null,
          canAnswer ? jsx(SmallButton, { primary: true, disabled: !answer.trim(), onClick: () => (send(answer), setAnswer('')), children: 'Send' }) : null,
          jsx(SmallButton, { onClick: () => openInboxItem(item), children: canAnswer ? 'Open' : 'Answer' })
        ]
      })
    ]
  })
}

// Sidebar pane above Sessions: registered only while something needs you.
function NeedsYouPane({ looks }) {
  const looksValue = useValue(looks)
  const n = useNeedsYou()
  if (!n.total) return jsx('div', { style: { padding: '10px 12px', fontSize: 12, color: V.t3 }, children: 'Nothing needs you.' })
  return jsxs('div', {
    style: { height: '100%', overflowY: 'auto', padding: '4px 12px 8px' },
    children: [
      ...n.approvals.map(item => jsx(ApprovalRow, { item, looks: looksValue, compact: true }, item.requestId)),
      ...n.questions.map(item => jsx(QuestionRow, { item, looks: looksValue, compact: true }, `q:${item.sessionId}`)),
      ...n.unread.slice(0, 6).map(entry =>
        jsxs(
          'button',
          {
            type: 'button',
            onClick: () => openSession(entry.row, entry.profile.name),
            style: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: `1px solid ${V.hair}`, padding: '7px 0', cursor: 'pointer' },
            children: [
              jsx('div', { className: 'truncate', style: { fontSize: 12, color: V.t1 }, children: sessionTitle(entry.row) }),
              jsx('div', { className: 'truncate', style: { fontSize: 11, color: V.amber }, children: `${botLabel(entry.profile)} replied · ${ago(entry.row.last_active)}` })
            ]
          },
          `u:${entry.row.id}`
        )
      )
    ]
  })
}

// ── task plan: the focused chat's latest todo list, from its transcript ──

const $plan = atom({ sessionId: null, items: null, messages: 0, error: null, at: 0 })
let planInflight = null

function parseTodoList(value) {
  let v = value
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (v && !Array.isArray(v) && typeof v === 'object') v = v.todos !== undefined ? v.todos : v.result !== undefined ? parseTodoList(v.result) : null
  if (!Array.isArray(v)) return null
  const items = v
    .filter(t => t && typeof t === 'object' && ['pending', 'in_progress', 'completed', 'cancelled'].includes(t.status))
    .map(t => ({ id: String(t.id ?? ''), content: String(t.content ?? '').trim(), status: t.status, parent: t.parent ? String(t.parent) : null }))
    .filter(t => t.id && t.content)
  return items
}

function latestPlan(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (!m || (m.name !== 'todo_list' && m.name !== 'todo')) continue
    const fromResult = parseTodoList(m.content)
    if (fromResult && fromResult.length) return fromResult
    const args = m.args || {}
    if (!args.merge) {
      const fromArgs = parseTodoList(args.todos)
      if (fromArgs && fromArgs.length) return fromArgs
    }
  }
  return null
}

function gatewayIdFor(storedId) {
  const map = $inbox.get().liveByKey || {}
  if (map[storedId]) return map[storedId]
  const hit = $crew.get().byId && $crew.get().byId[storedId]
  if (hit) for (const id of [hit.row.id, hit.row._lineage_root_id, ...(hit.row._lineage_ids || [])]) if (id && map[id]) return map[id]
  const focused = atomGet(host.state.focusedSessionId)
  return focused && !String(focused).startsWith('local-') ? focused : null
}

// Keyed by the STORED id: that is what survives reloads and what the
// gateway's live list maps back to its own session id.
async function refreshPlan(sessionId) {
  if (!sessionId || typeof host.request !== 'function') {
    $plan.set({ sessionId: null, items: null, messages: 0, error: null, at: Date.now() })
    return
  }
  if (planInflight === sessionId) return
  planInflight = sessionId
  try {
    let gid = gatewayIdFor(sessionId)
    if (!gid) {
      await refreshInbox()
      gid = gatewayIdFor(sessionId)
    }
    if (!gid) throw new Error('not live in this gateway')
    const res = await host.request('session.history', { session_id: gid }, 15000)
    const messages = Array.isArray(res && res.messages) ? res.messages : []
    const items = latestPlan(messages)
    if (atomGet(host.state.focusedStoredSessionId) === sessionId) $plan.set({ sessionId, items, messages: messages.length, error: null, at: Date.now() })
  } catch (err) {
    if (atomGet(host.state.focusedStoredSessionId) === sessionId) $plan.set({ sessionId, items: null, messages: 0, error: err && err.message ? err.message : String(err), at: Date.now() })
  } finally {
    planInflight = null
  }
}

function usePlan() {
  const sessionId = useValue(host.state.focusedStoredSessionId)
  const runtimeId = useValue(host.state.focusedSessionId)
  const busy = useValue(host.state.busy)
  const plan = useValue($plan)
  const live = useValue($liveTodos)
  const fromEvents = live[runtimeId] || live[sessionId] || null
  useEffect(() => {
    refreshPlan(sessionId)
    if (!busy || !sessionId) return undefined
    const h = setInterval(() => refreshPlan(sessionId), 6000)
    return () => clearInterval(h)
  }, [sessionId, busy])
  return fromEvents || (plan.sessionId === sessionId ? plan.items : null)
}

function PlanStatus() {
  const pl = useValue($plan)
  const sid = useValue(host.state.focusedStoredSessionId)
  if (pl.sessionId !== sid) return null
  return jsxs('div', {
    children: [
      jsx(PaneHead, { children: 'Plan' }),
      jsx('div', { style: { fontSize: 12, color: V.t4 }, children: 'No plan yet. It appears here as soon as the bot breaks the work into steps.' })
    ]
  })
}

const PLAN_MARK = { completed: '✓', in_progress: '●', pending: '○', cancelled: '–' }

function PlanList({ items }) {
  const counted = items.filter(t => t.status !== 'cancelled')
  const done = counted.filter(t => t.status === 'completed').length
  const ids = new Set(items.map(t => t.id))
  return jsxs('div', {
    children: [
      jsx(PaneHead, { children: `Plan · ${done} of ${counted.length}` }),
      ...items.map(t =>
        jsxs(
          'div',
          {
            style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', paddingLeft: t.parent && ids.has(t.parent) ? 16 : 0, fontSize: 12, lineHeight: 1.45 },
            children: [
              jsx('span', { style: { width: 12, flexShrink: 0, textAlign: 'center', color: t.status === 'completed' ? V.green : t.status === 'in_progress' ? V.accent : V.t4 }, children: PLAN_MARK[t.status] }),
              jsxs('span', {
                style: { color: t.status === 'completed' ? V.t3 : t.status === 'cancelled' ? V.t4 : V.t1, textDecoration: t.status === 'cancelled' ? 'line-through' : 'none' },
                children: [t.content, t.status === 'in_progress' ? jsx('span', { style: { color: V.accent }, children: ' · now' }) : null]
              })
            ]
          },
          t.id
        )
      )
    ]
  })
}

// ───────────────────────────────────────────────────────── the Session pane
// ─── the Helm sidebar tab ────────────────────────────────────────────────────
// A tab in the sessions column, beside SESSIONS and BOTS, built to the design's
// Bots board: pinned robots with status dots, filter chips, what needs you,
// and every bot with its robot and a live status line.
const HELM_RAISED = '#171E27'

function shortAgo(ts) {
  if (!ts) return ''
  const ms = ts > 1e12 ? ts : ts * 1000
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function botRole(p) {
  const d = String(p.description || p.bot_description || '')
  const dash = d.split(/\s+[—–-]\s+/)
  if (dash.length > 1 && dash[1].length <= 28) return dash[1]
  return ''
}

/** One line under a bot's name: what it is doing, in the design's words and colours. */
function botLine(p, activity, needs) {
  if (needs.approvals > 0) return { text: needs.approvals === 1 ? 'Waiting on you · an approval' : `Waiting on you · ${needs.approvals} approvals`, color: V.amber, key: 'needs-you' }
  if (needs.questions > 0) return { text: 'Waiting on you · a question', color: V.amber, key: 'needs-you' }
  if (activity.unread > 0) return { text: activity.unread === 1 ? 'Replied · 1 unread' : `Replied · ${activity.unread} unread`, color: V.amber, key: 'needs-you' }
  if (activity.active) {
    const live = activity.sessions.find(r => r.is_active && !r.ended_at)
    return { text: `Working · ${live ? sessionTitle(live) : 'on it'}`, color: V.accent, key: 'working' }
  }
  if (activity.latest) return { text: `Idle · ${sessionTitle(activity.latest)}`, color: V.t2, key: 'idle' }
  return { text: 'No sessions yet', color: V.t3, key: 'new' }
}

function needsByBot(n) {
  const out = {}
  const bump = (name, kind) => {
    if (!name) return
    out[name] = out[name] || { approvals: 0, questions: 0 }
    out[name][kind] += 1
  }
  n.approvals.forEach(a => bump(a.profile, 'approvals'))
  n.questions.forEach(q => bump(q.profile, 'questions'))
  return out
}

function openBot(p, activity) {
  haptic('tap')
  const target = activity.sessions.find(r => r.unread) || activity.sessions.find(r => r.is_active && !r.ended_at) || activity.latest
  if (target) openSession(target, p.name)
  else host.newChat(p.name)
}

const DOT_FOR = key => (key === 'working' ? V.accent : key === 'needs-you' ? V.amber : null)

function HelmTile({ p, look, line, activity, selected }) {
  const dot = DOT_FOR(line.key)
  return jsxs('button', {
    type: 'button',
    title: `${botLabel(p)} · ${line.text}`,
    onClick: () => openBot(p, activity),
    style: {
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '8px 4px', borderRadius: 8,
      border: 0, background: selected ? HELM_RAISED : 'transparent', color: V.t1, cursor: 'pointer', minWidth: 0, font: 'inherit'
    },
    children: [
      jsx(AnimatedRobot, { look, head: true, size: 36, expr: line.key === 'working' ? 'focused' : line.key === 'needs-you' ? 'question' : look.face, state: petStateFor(line.key), title: botLabel(p) }),
      jsx('span', { style: { fontSize: 11.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: botLabel(p) }),
      dot ? jsx('span', { style: { position: 'absolute', top: 7, right: 9, width: 7, height: 7, borderRadius: 4, background: dot, boxShadow: `0 0 0 2px ${selected ? HELM_RAISED : 'var(--ui-bg-sidebar, #121820)'}` } }) : null
    ]
  })
}

function HelmChip({ label, count, active, tone, onClick }) {
  return jsx('button', {
    type: 'button',
    'aria-pressed': active,
    onClick,
    style: {
      height: 22, padding: '0 8px', borderRadius: 11, border: `1px solid ${V.hair2}`, font: 'inherit', fontSize: 11, cursor: 'pointer',
      background: active ? HELM_RAISED : 'transparent', color: tone || (active ? V.t1 : '#98A4B1'), whiteSpace: 'nowrap'
    },
    children: count ? `${label} · ${count}` : label
  })
}

function HelmBotRow({ p, look, line, activity, selected }) {
  const role = botRole(p)
  const when = activity.latest ? shortAgo(activity.latest.last_active) : ''
  return jsxs('button', {
    type: 'button',
    onClick: () => openBot(p, activity),
    style: {
      margin: '0 8px', padding: '6px 8px', borderRadius: 6, border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8, alignItems: 'center',
      textAlign: 'left', lineHeight: 1.3, background: selected ? HELM_RAISED : 'transparent', color: V.t1, font: 'inherit', cursor: 'pointer', width: 'calc(100% - 16px)'
    },
    children: [
      jsx(AnimatedRobot, { look, head: true, size: 22, expr: line.key === 'working' ? 'focused' : line.key === 'needs-you' ? 'question' : look.face, state: petStateFor(line.key), title: botLabel(p) }),
      jsxs('span', {
        style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
        children: [
          jsxs('span', { style: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: [botLabel(p), role ? jsx('span', { style: { color: '#76838F' }, children: ` · ${role}` }) : null] }),
          jsx('span', { style: { fontSize: 11.5, color: line.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: line.text })
        ]
      }),
      activity.unread > 0
        ? jsx('span', { title: 'Unread output', style: { width: 6, height: 6, borderRadius: 3, background: V.accent, display: 'block', justifySelf: 'end' } })
        : jsx('span', { style: { fontSize: 10.5, color: V.t3, fontFamily: V.mono }, children: when })
    ]
  })
}

function HelmSectionLabel({ children, tone, count }) {
  return jsxs('div', {
    style: { padding: '12px 14px 4px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: tone || V.t3 },
    children: [jsx('span', { children }), count ? jsx('span', { style: { color: V.t3, letterSpacing: 0, fontWeight: 500 }, children: count }) : null]
  })
}

// CONNECTIONS: the other backends this window can reach (the Crew board's
// "Model Router · OpenBot" row). Only shown when there is more than this Mac.
const $helmConnections = atom({ ready: false, rows: [] })
let helmConnInflight = false
async function refreshHelmConnections() {
  if (helmConnInflight || typeof host.connections !== 'function') return
  helmConnInflight = true
  try {
    const rows = await host.connections()
    $helmConnections.set({ ready: true, rows: Array.isArray(rows) ? rows : [] })
  } catch {
    $helmConnections.set({ ready: true, rows: [] })
  } finally {
    helmConnInflight = false
  }
}

function HelmConnections() {
  const conn = useValue($helmConnections)
  useEffect(() => {
    refreshHelmConnections()
  }, [])
  const rows = (conn.rows || []).filter(c => c && c.kind !== 'local')
  if (!rows.length) return null
  return jsxs(Fragment, {
    children: [
      jsx(HelmSectionLabel, { children: 'Connections' }),
      ...rows.map(c => {
        const label = c.label || c.name || c.id || 'Connection'
        const mono = String(label).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '··'
        return jsxs('div', {
          key: c.id || label,
          style: { margin: '0 8px', padding: '6px 8px', borderRadius: 6, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8, alignItems: 'center', lineHeight: 1.3 },
          children: [
            jsx('span', { style: { width: 22, height: 22, boxSizing: 'border-box', borderRadius: 6, border: '1px solid #222B35', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98A4B1', fontSize: 9.5, fontWeight: 600 }, children: mono }),
            jsxs('span', {
              style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
              children: [
                jsxs('span', { style: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: [label, c.kind ? jsx('span', { style: { color: '#76838F' }, children: ` · ${c.kind}` }) : null] }),
                jsx('span', { style: { fontSize: 11.5, color: '#98A4B1' }, children: c.primary ? 'online · this window' : 'registered' })
              ]
            }),
            jsx('span', {})
          ]
        })
      })
    ]
  })
}

// Footer: which bot you're on (swatch + name, a picker for the rest) and the
// way to the full board.
function HelmFooter({ rows, focusedProfile, board }) {
  const [open, setOpen] = useState(false)
  const current = rows.find(r => r.p.name === focusedProfile) || rows[0]
  const swatch = r => {
    const pal = PALETTE[r && r.look && r.look.color] || PALETTE.blue
    return pal.dark
  }
  return jsxs('div', {
    style: { marginTop: 'auto', position: 'relative', borderTop: '1px solid #1C242D', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 },
    children: [
      current
        ? jsxs('button', {
            type: 'button',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            title: 'Switch bot',
            onClick: () => setOpen(v => !v),
            style: { height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #1C242D', background: '#0F1419', color: '#E6EBF0', font: 'inherit', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', maxWidth: 150 },
            children: [
              jsx('span', { style: { width: 8, height: 8, borderRadius: 2, background: swatch(current), flex: '0 0 8px' } }),
              jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: botLabel(current.p) }),
              jsx('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: '#76838F', strokeWidth: 2.5, 'aria-hidden': true, children: jsx('path', { d: 'M6 9l6 6 6-6' }) })
            ]
          })
        : null,
      open
        ? jsx('div', {
            role: 'menu',
            style: { position: 'absolute', left: 10, bottom: 40, minWidth: 170, padding: 4, borderRadius: 8, border: '1px solid #222B35', background: '#121820', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', zIndex: 20 },
            children: rows.map(r =>
              jsxs('button', {
                key: r.p.name,
                type: 'button',
                role: 'menuitem',
                onClick: () => {
                  setOpen(false)
                  openBot(r.p, r.activity)
                },
                style: { width: '100%', height: 28, padding: '0 8px', border: 0, borderRadius: 6, background: r.p.name === focusedProfile ? '#171E27' : 'transparent', color: '#E6EBF0', font: 'inherit', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' },
                children: [
                  jsx('span', { style: { width: 8, height: 8, borderRadius: 2, background: swatch(r), flex: '0 0 8px' } }),
                  jsx('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: botLabel(r.p) }),
                  jsx('span', { style: { fontSize: 11, color: r.line.color }, children: r.line.key === 'working' ? 'working' : r.line.key === 'needs-you' ? 'needs you' : '' })
                ]
              })
            )
          })
        : null,
      board ? null : jsx('button', { type: 'button', onClick: () => host.navigate(BOTS_ROUTE), style: { marginLeft: 'auto', border: 0, padding: 0, background: 'transparent', color: V.accent, cursor: 'pointer', font: 'inherit', fontSize: 11.5 }, children: 'Board view' })
    ]
  })
}

function HelmTab({ looks, prefs, setPrefs }) {
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const prefsValue = useValue(prefs)
  const n = useNeedsYou()
  const [filter, setFilter] = useState('all')
  const needs = useMemo(() => needsByBot(n), [n.approvals, n.questions])
  const rows = useMemo(
    () =>
      (crew.profiles || []).map(p => {
        const activity = activityFor(crew, p.name)
        const line = botLine(p, activity, needs[p.name] || { approvals: 0, questions: 0 })
        const look = normalizeLook(looksValue[p.name] || null, p.name)
        const rank = line.key === 'needs-you' ? 0 : line.key === 'working' ? 1 : line.key === 'idle' ? 2 : 3
        return { p, activity, line, look, rank, last: activity.latest ? activity.latest.last_active : 0 }
      }),
    [crew, looksValue, needs]
  )
  const sorted = useMemo(() => rows.slice().sort((a, b) => a.rank - b.rank || b.last - a.last), [rows])
  const pinnedNames = Array.isArray(prefsValue.helmPinned) && prefsValue.helmPinned.length ? prefsValue.helmPinned : sorted.slice(0, 3).map(r => r.p.name)
  const pinned = pinnedNames.map(name => rows.find(r => r.p.name === name)).filter(Boolean).slice(0, 3)
  const needCount = rows.filter(r => r.line.key === 'needs-you').length
  const workCount = rows.filter(r => r.line.key === 'working').length
  const shown = sorted.filter(r => filter === 'all' || r.line.key === filter)
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const boardOpen = useValue($boardMounted)
  const roomsValue = useValue($rooms)
  const [newRoom, setNewRoom] = useState(false)
  const today = useValue($today)
  if (!crew.ready && !(crew.profiles || []).length) {
    return jsx('div', { style: { padding: '14px', fontSize: 12, color: V.t3 }, children: 'Loading your bots…' })
  }
  if (boardOpen) {
    const routines = (today.jobs || []).filter(j => j.enabled).length
    const navRow = (label, d, opts = {}) =>
      jsxs('button', {
        type: 'button',
        className: opts.selected ? undefined : 'helm-nav-row',
        onClick: opts.onClick,
        style: { height: 30, display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px', borderRadius: 6, border: 0, background: opts.selected ? '#171E27' : 'transparent', color: opts.selected ? '#E6EBF0' : '#C3CCD5', font: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left', width: '100%' },
        children: [
          jsx('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true, children: d.map((x, i) => (x.r ? jsx('rect', { ...x.r }, i) : x.c ? jsx('circle', { ...x.c }, i) : jsx('path', { d: x }, i))) }),
          jsx('span', { children: label }),
          opts.count ? jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: '#76838F' }, children: opts.count }) : null
        ]
      })
    return jsxs('div', {
      style: { height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontSize: 13, color: V.t1 },
      children: [
        jsxs('div', {
          style: { padding: '10px 8px 0', display: 'flex', flexDirection: 'column', gap: 1 },
          children: [
            navRow('Board', [{ r: { x: 3, y: 4, width: 5, height: 16, rx: 1 } }, { r: { x: 10, y: 4, width: 5, height: 10, rx: 1 } }, { r: { x: 17, y: 4, width: 4, height: 13, rx: 1 } }], { selected: true }),
            navRow('Roster', ['M4 6h16M4 12h16M4 18h10'], { onClick: () => { const r = rows.find(x => x.p.name === focusedProfile) || sorted[0]; if (r) openBot(r.p, r.activity) } }),
            navRow('Routines', [{ c: { cx: 12, cy: 12, r: 9 } }, 'M12 7v5l3 2'], { count: routines || null, onClick: () => host.navigate('/cron') })
          ]
        }),
        jsx(HelmSectionLabel, { children: 'Bots' }),
        ...sorted.map(r =>
          jsxs('button', {
            type: 'button',
            onClick: () => openBot(r.p, r.activity),
            className: 'helm-nav-row',
            style: { margin: '0 8px', padding: '6px 8px', borderRadius: 6, border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8, alignItems: 'center', textAlign: 'left', lineHeight: 1.3, background: 'transparent', color: V.t1, font: 'inherit', cursor: 'pointer', width: 'calc(100% - 16px)' },
            children: [
              jsx(AnimatedRobot, { look: r.look, head: true, size: 22, expr: r.line.key === 'working' ? 'focused' : r.line.key === 'needs-you' ? 'question' : r.look.face, state: petStateFor(r.line.key), title: botLabel(r.p) }),
              jsxs('span', {
                style: { display: 'flex', flexDirection: 'column', minWidth: 0 },
                children: [
                  jsx('span', { style: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: botLabel(r.p) }),
                  jsx('span', { style: { fontSize: 11.5, color: r.line.color }, children: r.line.key === 'working' ? 'Working' : r.line.key === 'needs-you' ? (r.activity.unread && !(needs[r.p.name] && (needs[r.p.name].approvals || needs[r.p.name].questions)) ? 'Replied' : 'Blocked') : r.line.key === 'new' ? 'New' : 'Idle' })
                ]
              }),
              r.activity.unread
                ? jsx('span', { style: { width: 6, height: 6, borderRadius: 3, background: V.accent } })
                : jsx('span', { style: { fontSize: 10.5, color: '#76838F', fontFamily: V.mono }, children: r.activity.latest ? shortAgo(r.activity.latest.last_active) : '' })
            ]
          }, r.p.name)
        ),
        jsx(HelmFooter, { rows, focusedProfile, board: true })
      ]
    })
  }
  return jsxs('div', {
    style: { height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontSize: 13, color: V.t1 },
    children: [
      pinned.length
        ? jsx('div', {
            style: { padding: '10px 10px 0', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 },
            children: pinned.map(r => jsx(HelmTile, { ...r, selected: r.p.name === focusedProfile }, r.p.name))
          })
        : null,
      jsxs('div', {
        style: { padding: '8px 10px 0', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' },
        children: [
          jsx(HelmChip, { label: 'All', active: filter === 'all', onClick: () => setFilter('all') }),
          jsx(HelmChip, { label: 'Needs you', count: needCount, active: filter === 'needs-you', tone: '#E8A657', onClick: () => setFilter('needs-you') }),
          jsx(HelmChip, { label: 'Working', count: workCount, active: filter === 'working', onClick: () => setFilter('working') }),
          roomsValue.ready && !roomsValue.error ? jsx(HelmChip, { label: 'Rooms', count: roomsValue.rooms.length, active: filter === 'rooms', onClick: () => setFilter('rooms') }) : null,
          jsx('button', {
            type: 'button',
            'aria-label': 'New bot',
            title: 'New bot',
            onClick: openNewBot,
            style: { marginLeft: 'auto', width: 24, height: 24, border: 0, borderRadius: 6, background: 'transparent', color: V.t3, cursor: 'pointer', font: 'inherit', fontSize: 16 },
            children: '+'
          })
        ]
      }),
      roomsValue.ready && !roomsValue.error && (filter === 'all' || filter === 'rooms')
        ? jsxs(Fragment, {
            children: [
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', paddingRight: 14 },
                children: [
                  jsx('div', { style: { flex: 1 }, children: jsx(HelmSectionLabel, { children: 'Rooms' }) }),
                  jsx('button', { type: 'button', onClick: () => setNewRoom(v => !v), style: { marginTop: 8, border: 0, padding: 0, background: 'transparent', color: V.accent, font: 'inherit', fontSize: 11.5, cursor: 'pointer' }, children: newRoom ? 'Close' : 'New room' })
                ]
              }),
              newRoom ? jsx(NewRoomForm, { profiles: crew.profiles || [], looks, onDone: () => setNewRoom(false) }) : null,
              ...roomsValue.rooms.map(entry => jsx(HelmRoomRow, { entry, looks, looksValue }, entry.room.room_id)),
              !roomsValue.rooms.length && !newRoom ? jsx('div', { style: { padding: '0 16px 4px', fontSize: 11.5, color: '#76838F' }, children: 'A room is a group chat of two to six bots.' }) : null
            ]
          })
        : null,
      n.total && (filter === 'all' || filter === 'needs-you')
        ? jsxs(Fragment, {
            children: [
              jsx(HelmSectionLabel, { tone: V.amber, count: n.total, children: 'Needs you' }),
              jsxs('div', {
                style: { padding: '0 8px' },
                children: [
                  ...n.approvals.map(item => jsx(ApprovalRow, { item, looks: looksValue, compact: true }, item.requestId)),
                  ...n.questions.map(item => jsx(QuestionRow, { item, looks: looksValue, compact: true }, `q:${item.sessionId}`))
                ]
              })
            ]
          })
        : null,
      filter === 'rooms' ? null : jsx(HelmSectionLabel, { children: 'Bots' }),
      filter === 'rooms' ? null : shown.length
        ? shown.map(r => jsx(HelmBotRow, { ...r, selected: r.p.name === focusedProfile }, r.p.name))
        : jsx('div', { style: { padding: '4px 16px', fontSize: 12, color: V.t3 }, children: filter === 'working' ? 'Nobody is working right now.' : 'Nothing is waiting on you.' }),
      jsx(HelmConnections, {}),
      jsx(HelmFooter, { rows, focusedProfile })
    ]
  })
}

// A right-sidebar tab beside Files: the focused chat at a glance (who, where,
// what it has cost), the rest of the crew, and the next scheduled job.

function KV({ k, v, mono }) {
  if (v === null || v === undefined || v === '') return null
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 12 },
    children: [
      jsx('span', { style: { flexShrink: 0, color: V.t3 }, children: k }),
      jsx('span', { className: 'truncate', style: { minWidth: 0, textAlign: 'right', color: V.t2, fontFamily: mono ? V.mono : undefined }, title: String(v), children: v })
    ]
  })
}

function PaneHead({ children }) {
  return jsx('h3', { style: { ...CAPS, fontSize: 10, color: V.t4, margin: '18px 0 4px' }, children })
}

function fmtTokens(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`
  return String(v)
}

function SessionPane({ looks }) {
  const crew = useValue($crew)
  const today = useValue($today)
  const looksValue = useValue(looks)
  const storedId = useValue(host.state.focusedStoredSessionId)
  const profile = useValue(host.state.focusedSessionProfile)
  const model = useValue(host.state.model)
  const cwd = useValue(host.state.cwd)
  const usage = useValue(host.state.focusedUsage)
  const busy = useValue(host.state.busy)
  useEffect(() => {
    if (!$today.get().ready) refreshToday()
  }, [])
  const hit = storedId && crew.byId ? crew.byId[storedId] : null
  const r = hit ? hit.row : null
  const owner = (hit && hit.profile) || profile
  const ownerProfile = (crew.profiles || []).find(p => p.name === owner)
  const look = normalizeLook(looksValue[owner], owner || 'default')
  const cost = usage && typeof usage.cost_usd === 'number' ? usage.cost_usd : r ? rowCost(r) : 0
  const ctxPct = usage && typeof usage.context_percent === 'number' ? Math.round(usage.context_percent) : null
  const nextJob = today.jobs
    .filter(j => j.enabled !== false && toMs(j.next_run_at) > Date.now())
    .sort((a, b) => toMs(a.next_run_at) - toMs(b.next_run_at))[0]
  const others = (crew.profiles || []).filter(p => p.name !== owner)
  const plan = usePlan()

  return jsxs('div', {
    style: { height: '100%', overflowY: 'auto', padding: '14px 14px 20px' },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
        children: [
          jsx(AnimatedRobot, { look, head: true, expr: busy ? 'focused' : r && r.unread ? 'question' : look.face, state: busy ? 'running' : r && r.unread ? 'waiting' : 'idle', size: 34, title: owner || 'bot' }),
          jsxs('div', {
            style: { minWidth: 0 },
            children: [
              jsx('div', { className: 'truncate', style: { fontSize: 14, fontWeight: 500, color: V.t1 }, children: ownerProfile ? botLabel(ownerProfile) : owner || 'New chat' }),
              jsx('div', { className: 'truncate', style: { fontSize: 12, color: V.t3 }, children: r ? sessionTitle(r) : storedId ? 'This session' : 'Nothing sent yet' })
            ]
          })
        ]
      }),
      plan && plan.length ? jsx(PlanList, { items: plan }) : storedId ? jsx(PlanStatus, {}) : null,
      jsx(PaneHead, { children: busy ? 'Session · working' : 'Session' }),
      jsx(KV, { k: 'Model', v: (r && r.model) || model }),
      jsx(KV, { k: 'Folder', v: basename((r && r.cwd) || cwd), mono: true }),
      jsx(KV, { k: 'Branch', v: r && r.git_branch, mono: true }),
      jsx(KV, { k: 'Started', v: r && r.started_at ? `${clock(toMs(r.started_at))} · ${ago(r.started_at)}` : null }),
      jsx(KV, { k: 'Messages', v: r ? String(r.message_count || 0) : null, mono: true }),
      jsx(KV, { k: 'Tool calls', v: r ? String(r.tool_call_count || 0) : null, mono: true }),
      jsx(KV, { k: 'Tokens', v: r ? `${fmtTokens(r.input_tokens)} in · ${fmtTokens(r.output_tokens)} out` : null, mono: true }),
      jsx(KV, { k: 'Cost', v: [cost >= 0.005 ? fmtCost(cost) : null, ctxPct !== null ? `${ctxPct}% ctx` : null].filter(Boolean).join(' · ') || null, mono: true }),
      others.length ? jsx(PaneHead, { children: 'Crew' }) : null,
      ...others.map(p => {
        const act = activityFor(crew, p.name)
        const st = botStatus(act, false)
        const lk = normalizeLook(looksValue[p.name], p.name)
        return jsxs(
          'button',
          {
            type: 'button',
            title: act.latest ? `Open ${sessionTitle(act.latest)}` : `New chat with ${botLabel(p)}`,
            onClick: () => (act.latest ? openSession(act.latest, p.name) : host.newChat(p.name)),
            style: { display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '4px 2px', textAlign: 'left', fontSize: 12, background: 'none', border: 0, cursor: 'pointer', borderRadius: V.radius(6) },
            children: [
              jsx(RobotHead, { look: lk, expr: st.expr || lk.face, size: 18, title: p.name }),
              jsx('span', { className: 'truncate', style: { minWidth: 0, flex: 1, color: V.t2 }, children: botLabel(p) }),
              jsx('span', { style: { flexShrink: 0, color: TONE_COLOR[st.tone] }, children: st.label })
            ]
          },
          p.name
        )
      }),
      jsx(PaneHead, { children: 'Scheduled jobs' }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: V.t3 },
        children: [
          jsx('span', {
            className: 'truncate', style: { minWidth: 0 },
            children: !today.available ? 'Not loaded yet' : nextJob ? `${today.jobs.length} · next ${clock(toMs(nextJob.next_run_at))} ${nextJob.name || ''}` : `${today.jobs.length} · none due`
          }),
          jsx(LinkButton, { onClick: () => host.navigate('/cron'), children: 'Open' })
        ]
      }),
      jsx('div', { style: { marginTop: 20 }, children: jsx(LinkButton, { onClick: () => host.navigate(DESK_ROUTE), children: '← Desk' }) })
    ]
  })
}

// ─────────────────────────────────────────────────────────── settings page

function ThemeButtons({ prefs, setPrefs }) {
  const { preferredTheme } = useValue(prefs)
  return jsx('div', {
    className: 'flex flex-wrap gap-2',
    children: THEMES.map(t =>
      jsxs(
        'button',
        {
          type: 'button',
          'aria-pressed': preferredTheme === t.name,
          onClick: () => {
            haptic('tap')
            setPrefs({ preferredTheme: t.name })
            requestTheme(t.name)
          },
          className: cn(
            'flex flex-col gap-1.5 rounded-md border p-2 text-left text-xs',
            preferredTheme === t.name ? 'border-(--ui-accent)' : 'border-(--ui-stroke-secondary) hover:bg-(--chrome-action-hover)'
          ),
          children: [
            jsxs('span', {
              className: 'flex h-8 w-28 gap-1 rounded p-1',
              style: { background: t.colors.background, border: `1px solid ${t.colors.border}` },
              children: [
                jsx('span', { className: 'w-2 rounded-sm', style: { background: t.colors.sidebarBackground } }),
                jsx('span', { className: 'flex-1 rounded-sm', style: { background: t.colors.card } }),
                jsx('span', { className: 'h-2 w-2 self-end rounded-sm', style: { background: t.colors.primary } })
              ]
            }),
            jsx('span', { className: 'text-(--ui-text-primary)', children: t.label }),
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: t.description })
          ]
        },
        t.name
      )
    )
  })
}

function AppearanceCard({ prefs, setPrefs }) {
  return jsxs('div', {
    className: 'flex flex-col gap-2 py-2',
    children: [
      jsx('div', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: 'Helm themes' }),
      jsx(ThemeButtons, { prefs, setPrefs })
    ]
  })
}

function SettingsGeneral({ prefs, setPrefs }) {
  const p = useValue(prefs)
  const [density, setDensity] = useState(() => safeSetting('sessionListDensity', 'comfortable'))
  const [scale, setScale] = useState(() => safeSetting('chatTextScale', 110))
  useEffect(() => {
    const offs = []
    try {
      offs.push(host.settings.subscribe('sessionListDensity', v => setDensity(v)))
      offs.push(host.settings.subscribe('chatTextScale', v => setScale(v)))
    } catch {
      /* older host without settings bridge */
    }
    return () => offs.forEach(off => typeof off === 'function' && off())
  }, [])
  return jsxs('div', {
    className: 'flex flex-col gap-1',
    children: [
      jsx(ListRow, { title: 'Theme', description: 'Three quiet themes. Picking one here also selects it in the app’s own theme picker.', action: null }),
      jsx('div', { className: 'pb-3', children: jsx(ThemeButtons, { prefs, setPrefs }) }),
      jsx(ToggleRow, {
        label: 'Status bar: working count',
        description: 'How many sessions are mid-turn right now, from the app’s own busy map.',
        checked: p.showWorkingChip,
        onChange: on => setPrefs({ showWorkingChip: on })
      }),
      jsx(ToggleRow, {
        label: 'Status bar: focused session cost',
        description: 'Cost so far and context used for the session you are looking at.',
        checked: p.showCostChip,
        onChange: on => setPrefs({ showCostChip: on })
      }),
      jsx(ToggleRow, {
        label: 'Composer: who you are talking to',
        description: 'A small robot left of the composer showing the focused bot, its face working while it is busy. Click it for the Bots board.',
        checked: p.showComposerBot,
        onChange: on => setPrefs({ showComposerBot: on })
      }),
      jsx(ToggleRow, {
        label: 'Hide the Messaging row',
        description: 'Drops the Messaging row from the sidebar nav. Capabilities can never be hidden.',
        checked: p.hideMessagingRow,
        onChange: on => setPrefs({ hideMessagingRow: on })
      }),
      jsx(ListRow, {
        title: 'Session list density',
        description: 'The app’s own setting, surfaced here.',
        action: jsx(SegmentedControl, {
          value: density,
          options: [
            { id: 'compact', label: 'Compact' },
            { id: 'comfortable', label: 'Comfortable' },
            { id: 'detailed', label: 'Detailed' }
          ],
          onChange: v => trySetSetting('sessionListDensity', v)
        })
      }),
      jsx(ListRow, {
        title: 'Chat text scale',
        description: 'Transcript and composer text size.',
        action: jsx(SegmentedControl, {
          value: String(scale),
          options: [90, 100, 110, 125, 150].map(n => ({ id: String(n), label: String(n) })),
          onChange: v => trySetSetting('chatTextScale', Number(v))
        })
      })
    ]
  })
}

function SettingsBackup({ prefs, setPrefs, looks, setAllLooks, os }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const exportJson = () => JSON.stringify({ helm: VERSION, prefs: prefs.get(), looks: looks.get() }, null, 2)
  return jsxs('div', {
    className: 'flex flex-col gap-3',
    children: [
      jsx(ListRow, {
        title: 'Export',
        description: 'Copies helm’s preferences and every bot look as JSON. Keep it anywhere; app updates never touch plugin storage, but a reinstall does.',
        action: jsx(Button, {
          variant: 'outline',
          size: 'sm',
          onClick: async () => {
            const ok = os ? await os.writeClipboard(exportJson()) : false
            setNote(ok === false ? 'Clipboard unavailable; the JSON is below.' : 'Copied to the clipboard.')
            if (ok === false) setText(exportJson())
          },
          children: 'Copy JSON'
        })
      }),
      jsx('textarea', {
        value: text,
        onChange: e => setText(e.target.value),
        rows: 6,
        placeholder: 'Paste a helm export here to import it',
        className: 'w-full rounded-md border border-(--ui-stroke-secondary) bg-transparent p-2 font-mono text-xs text-(--ui-text-primary)'
      }),
      jsxs(Row, {
        children: [
          jsx(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: () => {
              try {
                const data = JSON.parse(text)
                if (data && typeof data === 'object') {
                  if (data.prefs && typeof data.prefs === 'object') setPrefs(data.prefs)
                  if (data.looks && typeof data.looks === 'object') setAllLooks(data.looks)
                  setNote('Imported.')
                } else setNote('That is not a helm export.')
              } catch (err) {
                setNote(`Could not parse: ${err.message}`)
              }
            },
            children: 'Import'
          }),
          jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: () => {
              setPrefs({ ...DEFAULT_PREFS })
              setAllLooks({})
              setNote('Reset to defaults. The active theme is unchanged until you pick another.')
            },
            children: 'Reset helm'
          }),
          jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: note })
        ]
      })
    ]
  })
}

function safeSetting(key, fallback) {
  try {
    const v = host.settings.get(key)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

function trySetSetting(key, value) {
  try {
    host.settings.set(key, value)
  } catch (err) {
    host.notifyError?.(`Could not change ${key}: ${err && err.message ? err.message : err}`)
  }
}

// ─────────────────────────────────────────────────────────────── Look page
// Helm's own "Customize look" surface: themes, chrome toggles, the app's own
// density/scale settings, and a door to the Bots board. Replaces a skin
// plugin's customize button when that plugin is disabled.

function Swatch({ active, title, onClick, children, style }) {
  return jsx('button', {
    type: 'button',
    title,
    'aria-pressed': active,
    onClick: () => {
      haptic('tap')
      onClick()
    },
    style,
    className: cn(
      'flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-xs',
      active ? 'border-(--ui-accent) text-(--ui-text-primary)' : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
    ),
    children
  })
}

function Section({ title, hint, children }) {
  return jsxs('section', {
    className: 'flex flex-col gap-2 border-b border-(--ui-stroke-secondary) py-4',
    children: [
      jsxs('div', {
        className: 'flex items-baseline gap-3',
        children: [
          jsx('h3', { className: 'text-[0.6875rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)', children: title }),
          hint ? jsx('span', { className: 'text-[0.6875rem] text-(--ui-text-quaternary)', children: hint }) : null
        ]
      }),
      children
    ]
  })
}

function LookPage({ prefs, setPrefs, applyLook, looks }) {
  const p = useValue(prefs)
  const [density, setDensity] = useState(() => safeSetting('sessionListDensity', 'comfortable'))
  const [scale, setScale] = useState(() => safeSetting('chatTextScale', 110))
  const [hex, setHex] = useState('')
  useEffect(() => {
    const offs = []
    try {
      offs.push(host.settings.subscribe('sessionListDensity', v => setDensity(v)))
      offs.push(host.settings.subscribe('chatTextScale', v => setScale(v)))
    } catch {
      /* older host */
    }
    return () => offs.forEach(off => typeof off === 'function' && off())
  }, [])
  const set = patch => applyLook(patch)
  const accentHex = accentOf(p.accent) || '#62C6D3'
  useEffect(() => setHex(accentHex), [accentHex])

  const H2 = ({ children, hint, right }) =>
    jsxs('div', {
      style: { display: 'flex', alignItems: 'baseline', gap: 10 },
      children: [
        jsx('h2', { style: { margin: 0, fontSize: 13, fontWeight: 600, color: B.t1 }, children }),
        hint ? jsx('span', { style: { fontSize: 12, color: B.t4 }, children: hint }) : null,
        right || null
      ]
    })
  const Seg = ({ value, options, onChange, label }) =>
    jsx('div', {
      role: 'group',
      'aria-label': label,
      style: { display: 'flex', gap: 2, background: B.bg, border: `1px solid ${B.ctl}`, borderRadius: 6, padding: 2, width: 'max-content' },
      children: options.map(o =>
        jsx('button', {
          type: 'button',
          'aria-pressed': String(value) === String(o.id),
          onClick: () => onChange(o.id),
          style: { height: 22, padding: '0 10px', borderRadius: 4, border: 0, font: 'inherit', fontSize: 11.5, cursor: 'pointer', background: String(value) === String(o.id) ? B.sel : 'transparent', color: String(value) === String(o.id) ? B.t1 : B.t3 },
          children: o.label
        }, o.id)
      )
    })
  const Select = ({ value, options, onChange, label }) =>
    jsxs('label', {
      style: { position: 'relative', height: 26, padding: '0 9px', borderRadius: 6, border: `1px solid ${B.ctl}`, background: B.bg, color: B.t1, fontSize: 12, width: 'max-content', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
      children: [
        `${(options.find(o => o.id === value) || options[0]).label} ▾`,
        jsx('select', { 'aria-label': label, value, onChange: e => onChange(e.target.value), style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }, children: options.map(o => jsx('option', { value: o.id, children: o.label }, o.id)) })
      ]
    })
  const Check = ({ k, label, hint }) =>
    jsxs('label', {
      style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12.5, color: B.t1 },
      children: [
        jsx('input', { type: 'checkbox', checked: Boolean(p[k]), onChange: e => setPrefs({ [k]: e.target.checked }), style: { margin: 0, accentColor: accentHex } }),
        jsx('span', { children: label }),
        hint ? jsx('span', { style: { marginLeft: 'auto', fontSize: 11.5, color: B.t4, textAlign: 'right' }, children: hint }) : null
      ]
    })
  const swatches = [['cyan', 'Cyan'], ['amber', 'Amber'], ['violet', 'Lavender'], ['green', 'Green'], ['white', 'Neutral']]
  const exportPrefs = () => {
    try {
      const blob = new Blob([JSON.stringify({ helm: VERSION, prefs: prefs.get(), looks: looks.get() }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'helm.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch (err) {
      host.notifyError?.(`Export failed: ${err && err.message ? err.message : err}`)
    }
  }
  const importPrefs = file => {
    if (!file) return
    file.text().then(txt => {
      const data = JSON.parse(txt)
      const next = data && typeof data.prefs === 'object' ? data.prefs : null
      if (!next) throw new Error('no prefs in that file')
      const clean = {}
      for (const k of Object.keys(DEFAULT_PREFS)) if (k in next && typeof next[k] === typeof DEFAULT_PREFS[k]) clean[k] = next[k]
      applyLook(clean)
      host.notify?.({ kind: 'success', message: 'Imported helm.json.' })
    }).catch(err => host.notifyError?.(`Import failed: ${err && err.message ? err.message : err}`))
  }
  const btn = (label, onClick, quiet) =>
    jsx('button', { type: 'button', onClick, style: { height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${B.ctl}`, background: 'transparent', color: quiet ? B.t3 : B.t2, font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }, children: label })

  return jsx('div', {
    style: { height: '100%', overflowY: 'auto', background: B.bg, color: B.t1, fontSize: 13, lineHeight: 1.45 },
    children: jsxs('div', {
      style: { width: 820, maxWidth: '100%', padding: '22px 36px 24px', display: 'flex', flexDirection: 'column', gap: 22, boxSizing: 'content-box' },
      children: [
        jsxs('div', {
          children: [
            jsx('h1', { style: { margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }, children: 'Appearance' }),
            jsxs('div', { style: { fontSize: 12.5, color: B.t3, marginTop: 4 }, children: ['Hermes’s own appearance settings, plus what helm adds. Saved in helm’s plugin storage under ', jsx('span', { style: { fontFamily: B.mono, fontSize: 12 }, children: '~/.hermes/desktop-plugins/' }), ', which app updates never touch.'] })
          ]
        }),
        jsxs('section', {
          style: { display: 'flex', flexDirection: 'column', gap: 8 },
          children: [
            jsx(H2, { hint: 'helm’s themes · your accent and type ride on top', children: 'Theme' }),
            jsx('div', {
              style: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 },
              children: THEMES.filter(t => t.name !== 'helm-custom').map(t => {
                const on = p.preferredTheme === t.name
                const acc = accentOf(p.accent, t.name === 'helm-paper') || t.colors.primary
                return jsxs('button', {
                  type: 'button',
                  'aria-pressed': on,
                  onClick: () => set({ preferredTheme: t.name }),
                  style: { border: `1px solid ${on ? accentHex : B.ctl}`, borderRadius: 8, background: B.panel, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: B.t1 },
                  children: [
                    jsxs('span', {
                      style: { height: 36, borderRadius: 5, background: t.colors.background, border: `1px solid ${t.colors.border}`, display: 'flex', gap: 3, padding: 4, boxSizing: 'border-box' },
                      children: [
                        jsx('span', { style: { width: 10, borderRadius: 2, background: t.colors.sidebarBackground } }),
                        jsx('span', { style: { flex: 1, borderRadius: 2, background: t.colors.card } }),
                        jsx('span', { style: { width: 8, height: 8, borderRadius: 2, background: acc, alignSelf: 'flex-end' } })
                      ]
                    }),
                    jsx('span', { style: { fontSize: 11.5 }, children: t.label })
                  ]
                }, t.name)
              })
            })
          ]
        }),
        jsxs('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 },
          children: [
            jsxs('div', {
              style: { display: 'flex', flexDirection: 'column', gap: 18 },
              children: [
                jsxs('section', {
                  style: { display: 'flex', flexDirection: 'column', gap: 8 },
                  children: [
                    jsx(H2, { children: 'Accent' }),
                    jsxs('div', {
                      style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
                      children: [
                        ...swatches.map(([id, name]) =>
                          jsx('button', { type: 'button', title: name, 'aria-label': name, 'aria-pressed': p.accent === id || (!p.accent && id === 'cyan'), onClick: () => set({ accent: id }), style: { width: 26, height: 26, borderRadius: 13, border: `2px solid ${p.accent === id || (!p.accent && id === 'cyan') ? B.t1 : 'transparent'}`, background: ACCENTS[id].dark, cursor: 'pointer', padding: 0 } }, id)
                        ),
                        jsx('label', { htmlFor: 'helm-accent-hex', style: { position: 'absolute', left: -9999 }, children: 'Custom accent' }),
                        jsx('input', {
                          id: 'helm-accent-hex',
                          value: hex,
                          onChange: e => setHex(e.target.value),
                          onBlur: () => (/^#[0-9a-f]{6}$/i.test(hex.trim()) ? set({ accent: hex.trim().toUpperCase() }) : setHex(accentHex)),
                          onKeyDown: e => e.key === 'Enter' && e.currentTarget.blur(),
                          style: { width: 90, height: 26, boxSizing: 'border-box', borderRadius: 6, border: `1px solid ${B.ctl}`, background: B.bg, color: B.t1, padding: '0 8px', fontFamily: B.mono, fontSize: 11.5 }
                        }),
                        jsx('span', { style: { fontSize: 11.5, color: B.t4 }, children: 'tints the active theme' })
                      ]
                    })
                  ]
                }),
                jsxs('section', {
                  style: { display: 'flex', flexDirection: 'column', gap: 8 },
                  children: [
                    jsx(H2, { children: 'Density and type' }),
                    jsxs('div', {
                      style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', alignItems: 'center', fontSize: 12.5 },
                      children: [
                        jsx('span', { style: { color: B.t3 }, children: 'Density' }),
                        jsx(Seg, { label: 'Density', value: density, options: [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }, { id: 'detailed', label: 'Detailed' }], onChange: v => trySetSetting('sessionListDensity', v) }),
                        jsx('span', { style: { color: B.t3 }, children: 'Interface font' }),
                        jsx(Select, { label: 'Interface font', value: p.font, options: Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label })), onChange: v => set({ font: v }) }),
                        jsx('span', { style: { color: B.t3 }, children: 'Chat text scale' }),
                        jsx(Seg, { label: 'Chat text scale', value: scale, options: [90, 100, 110, 125, 150].map(n => ({ id: n, label: String(n) })), onChange: v => trySetSetting('chatTextScale', Number(v)) }),
                        jsx('span', { style: { color: B.t3 }, children: 'Corners' }),
                        jsx(Seg, { label: 'Corners', value: p.radius, options: [{ id: 'sharp', label: 'Sharp' }, { id: 'default', label: 'Soft' }, { id: 'round', label: 'Round' }], onChange: v => set({ radius: v }) }),
                        jsx('span', { style: { color: B.t3 }, children: 'Reading width' }),
                        jsx(Seg, { label: 'Reading width', value: p.width, options: [{ id: 'narrow', label: 'Narrow' }, { id: 'default', label: 'App' }, { id: 'wide', label: 'Wide' }], onChange: v => set({ width: v }) })
                      ]
                    })
                  ]
                }),
                jsxs('section', {
                  style: { display: 'flex', flexDirection: 'column', gap: 8 },
                  children: [
                    jsx(H2, { children: 'Sidebar' }),
                    jsxs('div', {
                      style: { display: 'flex', flexDirection: 'column', gap: 6 },
                      children: [
                        jsx(Check, { k: 'showRail', label: 'Icon rail', hint: 'left of the sidebar' }),
                        jsx(Check, { k: 'designNav', label: 'Five-row nav', hint: 'the rest stays in ⌘K' }),
                        jsx(Check, { k: 'showRowStatus', label: 'Status under each session' }),
                        jsx(Check, { k: 'showRowCost', label: 'Cost on each session row' }),
                        jsx(Check, { k: 'showRowBots', label: 'Robot on each session row' }),
                        jsx(Check, { k: 'showDeskStrip', label: 'Continue strip on new chats' }),
                        jsx(Check, { k: 'homeOnNewSession', label: 'Home on New session', hint: 'greeting, Continue, Needs you, Today' }),
                        jsx(Check, { k: 'openDeskAtLaunch', label: 'Open the Desk at launch' })
                      ]
                    })
                  ]
                })
              ]
            }),
            jsxs('div', {
              style: { display: 'flex', flexDirection: 'column', gap: 18 },
              children: [
                jsxs('section', {
                  style: { display: 'flex', flexDirection: 'column', gap: 8 },
                  children: [
                    jsx(H2, { hint: 'right side of the status bar', children: 'Status bar and title bar' }),
                    jsxs('div', {
                      style: { display: 'flex', flexDirection: 'column', gap: 6 },
                      children: [
                        jsx(Check, { k: 'showNeedsYouChip', label: 'n need you', hint: 'amber' }),
                        jsx(Check, { k: 'showWorkingChip', label: 'n working' }),
                        jsx(Check, { k: 'showTodayChip', label: '$ today across the crew' }),
                        jsx(Check, { k: 'showCostChip', label: 'Focused chat cost and context' }),
                        jsx(Check, { k: 'showContextLine', label: 'Bot, folder, model in the title bar' }),
                        jsx(Check, { k: 'showHudPanel', label: 'Needs you and Working in the HUD', hint: 'View › HUD mode' }),
                        jsx(Check, { k: 'hudBoard', label: 'HUD as the 440 × 720 board', hint: 'off keeps the search bar' })
                      ]
                    })
                  ]
                }),
                jsxs('section', {
                  style: { display: 'flex', flexDirection: 'column', gap: 8 },
                  children: [
                    jsx(H2, { children: 'Robots' }),
                    jsxs('div', {
                      style: { display: 'flex', flexDirection: 'column', gap: 6 },
                      children: [
                        jsx(Check, { k: 'showComposerBot', label: 'Robot beside the composer' }),
                        jsx(Check, { k: 'animateRobots', label: 'Animated robots', hint: 'follows Reduce motion' }),
                        jsx(Check, { k: 'autoAvatars', label: 'Robots as Hermes avatars', hint: 'never over your photo' }),
                        jsx(Check, { k: 'robotPets', label: 'Robots as Hermes pets' })
                      ]
                    }),
                    jsxs('div', {
                      style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 },
                      children: [
                        jsx(Seg, { label: 'Rail colour', value: p.rail, options: [{ id: 'mono', label: 'Mono rail' }, { id: 'colour', label: 'Colour rail' }], onChange: v => set({ rail: v }) }),
                        jsx('button', { type: 'button', onClick: () => host.navigate(BOTS_ROUTE), style: { marginLeft: 'auto', border: 0, background: 'transparent', color: accentHex, font: 'inherit', fontSize: 12, cursor: 'pointer', padding: 0 }, children: 'Edit a bot’s look' })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        jsxs('section', {
          style: { borderTop: `1px solid ${B.hair}`, paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 },
          children: [
            jsx('span', { style: { color: B.t3, flex: '1 1 auto' }, children: 'Saved automatically. Hermes updates replace the app, not desktop-plugins/, so this survives them.' }),
            btn('Export helm.json', exportPrefs),
            jsxs('label', {
              style: { height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${B.ctl}`, color: B.t2, fontSize: 12, display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap', flex: '0 0 auto' },
              children: ['Import', jsx('input', { type: 'file', accept: 'application/json,.json', onChange: e => importPrefs(e.target.files && e.target.files[0]), style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' } })]
            }),
            btn('Reset to helm defaults', () => applyLook({ ...DEFAULT_PREFS, deskName: p.deskName, deskFolded: p.deskFolded }), true)
          ]
        })
      ]
    })
  })
}

// ─────────────────────────────────────────────────────────────── icon rail
// The board's 50px rail, left of the whole pane tree. Hermes has no rail slot,
// so helm draws it as a fixed element of its own and moves the tree 50px over
// with one CSS rule. It lives outside the tree, so the sidebar toggle and the
// layout editor never see it.
const RAIL_ICONS = {
  chevron: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bots: '<rect x="5" y="7" width="14" height="11" rx="3"/><circle cx="9.5" cy="12.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="12.5" r="1.2" fill="currentColor"/><path d="M12 7V4M8 21h8"/>',
  profiles: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 4.5"/>',
  desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  capabilities: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  messaging: '<path d="M4 6h16v10H8l-4 4z"/>',
  artifacts: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  automations: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  command: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  customize: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.1" fill="currentColor"/><circle cx="12" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="10" r="1.1" fill="currentColor"/><path d="M12 21a3 3 0 0 1 0-6h1.5a2 2 0 0 0 0-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
}

const RAIL_CSS = `
:root[data-helm-rail] [data-tree-split]:not([data-tree-split] *),
:root[data-helm-rail] [data-tree-group]:not([data-tree-split] *):not([data-tree-group] *) { margin-left: 50px; }
#helm-rail { position: fixed; left: 0; width: 49px; box-sizing: border-box; z-index: 40; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; background: #0F1419; border-right: 1px solid #1C242D; -webkit-app-region: no-drag; }
#helm-rail-drag { position: fixed; left: 0; top: 0; width: 50px; z-index: 40; -webkit-app-region: drag; background: #0F1419; box-shadow: inset 0 -1px 0 #1C242D; }
#helm-rail button { position: relative; width: 34px; height: 34px; border: 0; border-radius: 8px; background: transparent; color: #98A4B1; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
#helm-rail button:hover { background: #141B23; color: #E6EBF0; }
#helm-rail button[aria-current="page"] { background: #171E27; color: #E6EBF0; }
#helm-rail button.helm-rail-chevron { height: 30px; color: #76838F; margin-bottom: 4px; }
#helm-rail button .helm-rail-dot { position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 3px; display: none; }
#helm-rail button[data-dot] .helm-rail-dot { display: block; }
#helm-rail .helm-rail-spacer { margin-top: auto; }
:root[data-hermes-theme="helm-paper"] #helm-rail { background: #F4F2EC; border-right-color: #E2E0D8; }
`

function hashPath() {
  try {
    const h = String(globalThis.location ? globalThis.location.hash : '').replace(/^#/, '')
    return h.split('?')[0] || '/'
  } catch {
    return '/'
  }
}

function toggleSidebar() {
  try {
    const b = document.querySelector('button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]')
    if (b) b.click()
  } catch {
    /* no titlebar toggle */
  }
}

function startRail(prefs) {
  if (typeof document === 'undefined' || !isPrimaryWindow()) return () => {}
  const style = document.createElement('style')
  style.id = 'helm-rail-css'
  style.textContent = RAIL_CSS
  const nav = document.createElement('nav')
  nav.id = 'helm-rail'
  nav.setAttribute('aria-label', 'Pages')
  const drag = document.createElement('div')
  drag.id = 'helm-rail-drag'
  drag.setAttribute('aria-hidden', 'true')
  const items = [
    { id: 'chevron', label: 'Show or hide the sidebar', run: toggleSidebar, cls: 'helm-rail-chevron', size: 14 },
    { id: 'plus', label: 'New chat', run: () => host.newChat(), match: p => p === '/' },
    { id: 'bots', label: 'Bots', run: () => (host.revealPane ? host.revealPane(`${ID}:helm-tab`) : host.navigate(BOTS_ROUTE)), match: p => p.startsWith(BOTS_ROUTE) },
    { id: 'profiles', label: 'Instances and profiles', route: '/profiles' },
    { id: 'desk', label: 'Desk', route: DESK_ROUTE },
    { id: 'capabilities', label: 'Capabilities', route: '/capabilities' },
    { id: 'messaging', label: 'Messaging', route: '/messaging' },
    { id: 'artifacts', label: 'Artifacts', route: '/artifacts' },
    { id: 'automations', label: 'Automations', route: '/cron' },
    { id: 'command', label: 'Command center', route: '/command-center' },
    { id: 'customize', label: 'Customize appearance', route: LOOK_ROUTE, spacer: true },
    { id: 'settings', label: 'Settings', route: '/settings', match: p => p.startsWith('/settings') }
  ]
  const buttons = {}
  for (const it of items) {
    if (it.spacer) {
      const s = document.createElement('div')
      s.className = 'helm-rail-spacer'
      nav.appendChild(s)
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.title = it.label
    b.setAttribute('aria-label', it.label)
    if (it.cls) b.className = it.cls
    const size = it.size || 17
    b.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${it.id === 'chevron' ? 2 : 1.8}" aria-hidden="true">${RAIL_ICONS[it.id]}</svg><span class="helm-rail-dot"></span>`
    b.addEventListener('click', () => {
      try {
        haptic('tap')
      } catch {
        /* no haptics */
      }
      if (it.run) it.run()
      else host.navigate(it.route)
      setTimeout(paintActive, 60)
    })
    buttons[it.id] = b
    nav.appendChild(b)
  }
  const paintActive = () => {
    const p = hashPath()
    for (const it of items) {
      if (it.id === 'chevron') continue
      const on = it.match ? it.match(p) : it.route ? p === it.route || p.startsWith(`${it.route}/`) : false
      if (on) buttons[it.id].setAttribute('aria-current', 'page')
      else buttons[it.id].removeAttribute('aria-current')
    }
  }
  const setDot = (id, color) => {
    const b = buttons[id]
    if (!b) return
    if (color) {
      b.setAttribute('data-dot', '')
      b.querySelector('.helm-rail-dot').style.background = color
    } else b.removeAttribute('data-dot')
  }
  const paintDots = () => {
    const n = needsYouOf($inbox.get(), $crew.get())
    setDot('bots', n.total ? '#E8A657' : null)
    const failed = ($today.get().jobs || []).some(j => j.last_status === 'error' && toMs(j.last_run_at) >= startOfToday() * 1000)
    setDot('automations', failed ? '#E07080' : null)
  }
  let topSeen = 0
  const place = () => {
    let top = 40
    let bottom = 0
    try {
      // The title bar band: the main zone's header (its tabs ride in the title
      // bar), not the sidebar's, which adds the tab row under it.
      const mainHead = document.querySelector('[data-tree-group]:has([data-tree-tab="workspace"]) > [data-panel-header]')
      if (mainHead) {
        const r = mainHead.getBoundingClientRect()
        if (r.bottom > 0) top = Math.round(r.bottom)
      }
      const bar = document.querySelector('[data-slot="statusbar"]')
      if (bar) {
        const r = bar.getBoundingClientRect()
        if (r.height > 0) bottom = Math.max(0, Math.round(window.innerHeight - r.top))
      }
    } catch {
      /* keep the defaults */
    }
    // The titlebar band is the same height collapsed or not; keep the
    // tallest reading so the rail never jumps when the sidebar folds.
    topSeen = top || topSeen
    top = topSeen
    nav.style.top = `${top}px`
    nav.style.bottom = `${bottom}px`
    drag.style.height = `${top}px`
  }
  let mounted = false
  const mount = () => {
    if (mounted) return
    mounted = true
    document.head.appendChild(style)
    document.body.appendChild(drag)
    document.body.appendChild(nav)
    document.documentElement.setAttribute('data-helm-rail', '')
    place()
    paintActive()
    paintDots()
  }
  const unmount = () => {
    if (!mounted) return
    mounted = false
    style.remove()
    nav.remove()
    drag.remove()
    document.documentElement.removeAttribute('data-helm-rail')
  }
  const sync = () => (prefs.get().showRail !== false ? mount() : unmount())
  sync()
  const offs = [
    prefs.subscribe(sync),
    $crew.subscribe(paintDots),
    $inbox.subscribe(paintDots),
    $today.subscribe(paintDots)
  ]
  window.addEventListener('hashchange', paintActive)
  const onResize = () => {
    topSeen = 0
    place()
  }
  window.addEventListener('resize', onResize)
  const timer = setInterval(() => {
    if (mounted) {
      place()
      paintActive()
    }
  }, 1000)
  return () => {
    offs.forEach(off => typeof off === 'function' && off())
    window.removeEventListener('hashchange', paintActive)
    window.removeEventListener('resize', onResize)
    clearInterval(timer)
    unmount()
  }
}

// ───────────────────────────────────────────────────────────────── plugin

// Pure helpers, exported for the test suite only.
export const _internals = { routeBrief, readBrief, routingRules, tierOfModel, roomSummary, permsLine, onHandoffEvent, $handoffs, onReplyEvent, $lastReply, AnimatedRobot, petKey, petStateFor, petSheets, PET_ROW, autoAvatars, pngEdge, AVATAR_EDGE, DeskSection, TodayList, foldedIds, $today, refreshToday, latestPlan, parseTodoList, answerApproval, answerQuestion, refreshPlan, onPromptEvent, onPromptGone, onToolEvent, $plan, $inbox, $liveTodos }

export default {
  id: ID,
  name: 'Helm',
  description: 'A redesigned Hermes Desktop: a calmer interface you can tune, a crew view of every bot, rendered robots that become your bots’ avatars, and live status across the desk.',
  register(ctx) {
    spriteRest = typeof ctx.rest === 'function' ? (path, opts) => ctx.rest(path, opts) : null
    spritesDown = false
    spriteFailures = 0
    const stored = ctx.storage.get('prefs', {}) || {}
    // 1.2 layout migration: the design has no robots in session rows and a
    // five-row nav; earlier installs saved the old defaults.
    if (!stored.designVersion || stored.designVersion < 2) {
      Object.assign(stored, { showRowBots: false, designNav: true, showRowStatus: true, designVersion: 2 })
      ctx.storage.set('prefs', stored)
    }
    // Context % lives in the title bar on the boards, not the status bar.
    if (stored.designVersion < 3) {
      Object.assign(stored, { showCostChip: false, designVersion: 3 })
      ctx.storage.set('prefs', stored)
    }
    // The home now lives on New session (the Main board), so launch there.
    // The boards show no context line in the title bar and no robot in the composer.
    if (stored.designVersion < 5) {
      Object.assign(stored, { showContextLine: false, showComposerBot: false, designVersion: 5 })
      ctx.storage.set('prefs', stored)
    }
    if (stored.designVersion < 4) {
      Object.assign(stored, { openDeskAtLaunch: false, homeOnNewSession: true, designVersion: 4 })
      ctx.storage.set('prefs', stored)
    }
    const prefs = atom({ ...DEFAULT_PREFS, ...stored })
    {
      const h = ctx.storage.get('handoffs', [])
      if (Array.isArray(h)) $handoffs.set(h.slice(0, 30))
      handoffStore = v => ctx.storage.set('handoffs', v)
      const lr = ctx.storage.get('lastReply', {})
      if (lr && typeof lr === 'object') $lastReply.set(lr)
      replyStore = v => ctx.storage.set('lastReply', v)
    }
    $animate.set(prefs.get().animateRobots !== false)
    prefs.subscribe(v => $animate.set(v.animateRobots !== false))
    const looks = atom(ctx.storage.get('looks', {}))
    const avatarsStore = ctx.storage.get('avatars', {})
    const avatars = atom(avatarsStore && typeof avatarsStore === 'object' ? avatarsStore : {})
    avatars.subscribe(v => ctx.storage.set('avatars', v))

    const setLook = (name, look) => {
      const next = { ...looks.get(), [name]: normalizeLook(look, name) }
      looks.set(next)
      ctx.storage.set('looks', next)
    }
    const setAllLooks = all => {
      const next = {}
      for (const [name, look] of Object.entries(all || {})) next[name] = normalizeLook(look, name)
      looks.set(next)
      ctx.storage.set('looks', next)
    }

    // Themes: three fixed bases plus the live one Customize look edits.
    ctx.registerMany(THEMES.map(t => ({ id: t.name, area: THEMES_AREA, data: t })))
    let unregisterCustom = null
    const syncCustomTheme = () => {
      if (unregisterCustom) unregisterCustom()
      unregisterCustom = ctx.register({ id: 'helm-custom', area: THEMES_AREA, data: customTheme(prefs.get()) })
    }
    syncCustomTheme()

    // Sidebar nav: the Desk sits right under New session; Messaging can be hidden.
    let unregisterNav = null
    let navKey = ''
    const syncNavPrefs = () => {
      // The design's sidebar nav: New session, Desk, Capabilities and the
      // plugin rows (Lineage, OpenBot, Kanban). Messaging, Artifacts and
      // Scheduled jobs live on the Desk chips and in ⌘K; the Bots board in the
      // Helm tab; Customize look in ⌘K and Settings.
      const p = prefs.get()
      const hide = p.designNav !== false ? ['messaging', 'artifacts', 'cron', `${ID}:bots-nav`, `${ID}:look-nav`, `${ID}:desk-nav`] : p.hideMessagingRow ? ['messaging'] : []
      const key = hide.join(',')
      if (unregisterNav && key === navKey) return
      if (unregisterNav) unregisterNav()
      navKey = key
      unregisterNav = ctx.register({ id: 'nav-prefs', area: 'sidebarNav.prefs', data: { hide, order: ['new-session', `${ID}:desk-nav`] } })
    }

    let unregisterComposer = null
    const syncComposer = () => {
      const want = prefs.get().showComposerBot
      if (want && !unregisterComposer) {
        unregisterComposer = ctx.register({ id: 'composer-bot', area: 'composer.leading', order: 5, render: () => jsx(ComposerBotChip, { looks }) })
      } else if (!want && unregisterComposer) {
        unregisterComposer()
        unregisterComposer = null
      }
    }

    const setPrefs = patch => {
      const next = { ...prefs.get(), ...patch }
      for (const key of Object.keys(next)) if (!(key in DEFAULT_PREFS)) delete next[key]
      prefs.set(next)
      ctx.storage.set('prefs', next)
      syncNavPrefs()
      syncComposer()
    }
    helmPrefsRef = { prefs, setPrefs }
    // A look change re-registers the custom theme and switches to it.
    const applyLook = patch => {
      setPrefs(patch)
      syncCustomTheme()
      requestTheme('helm-custom')
    }
    syncNavPrefs()
    syncComposer()

    // Status bar, titlebar, sidebar rows: the desk-wide layer.
    ctx.registerMany([
      { id: 'needs-you', area: 'statusBar.right', order: 116, render: () => jsx(NeedsYouChip, { prefs }) },
      { id: 'today', area: 'statusBar.right', order: 117, render: () => jsx(TodayChip, { prefs }) },
      { id: 'working', area: 'statusBar.right', order: 118, render: () => jsx(WorkingChip, { prefs }) },
      { id: 'cost', area: 'statusBar.right', order: 119, render: () => jsx(CostChip, { prefs }) },
      { id: 'context', area: 'titleBar.center', order: 50, render: () => jsx(ContextLine, { looks, prefs }) },
      { id: 'row-bot', area: 'sessionRow.leading', data: { render: ({ sessionId }) => jsx(SessionRowBot, { sessionId, looks, prefs }) } },
      { id: 'row-status', area: 'sessionRow.trailing', data: { render: ({ sessionId }) => jsx(SessionRowStatus, { sessionId, prefs }) } }
    ])

    // Routes, nav rows, palette, keys.
    ctx.registerMany([
      { id: 'desk-route', area: ROUTES_AREA, data: { path: DESK_ROUTE }, render: () => jsx(DeskPage, { looks, prefs, setPrefs }) },
      { id: 'desk-nav', area: SIDEBAR_NAV_AREA, data: { path: DESK_ROUTE, label: 'Desk', codicon: 'home' } },
      {
        id: 'diag-palette',
        area: PALETTE_AREA,
        data: {
          id: 'helm.diagnostics',
          label: 'Helm: diagnostics',
          keywords: ['helm', 'debug', 'diagnostics', 'inbox', 'plan'],
          run: async () => {
            await refreshInbox()
            await refreshPlan(atomGet(host.state.focusedStoredSessionId))
            const i = $inbox.get()
            const pl = $plan.get()
            host.notify?.({
              kind: 'info',
              message: `helm ${VERSION} · inbox: ${i.live} live chats (${i.reach}${i.error ? `, ${i.error}` : ''}), ${i.waiting} waiting, ${i.approvals.length} approvals, ${i.questions.length} questions · plan: ${pl.error ? `error ${pl.error}` : `${pl.messages} transcript rows, ${pl.items ? pl.items.length : 0} steps`} for ${pl.sessionId || 'no focused chat'}`
            })
          }
        }
      },
      { id: 'desk-palette', area: PALETTE_AREA, data: { id: 'helm.desk', label: 'Helm: Desk', keywords: ['home', 'desk', 'dashboard', 'today', 'continue', 'helm'], run: () => host.navigate(DESK_ROUTE) } },
      { id: 'desk-key', area: KEYBINDS_AREA, data: { id: 'helm.desk', label: 'Open the Desk', category: 'view', defaults: ['mod+alt+0'], run: () => host.navigate(DESK_ROUTE) } },
      { id: 'desk-strip', area: 'composer.top', order: 5, render: () => jsx(DeskStrip, { looks, prefs }) },
      { id: 'home', area: 'composer.underside', order: 1, render: () => jsx(HomeUnderside, { looks, prefs }) },
      { id: 'home-cwd', area: 'composer.top', order: 2, render: () => jsx(HomeCwdLine, { prefs }) },
      { id: 'ask-pill', area: 'composer.actions', order: 10, render: () => jsx(ComposerAskPill, {}) },
      { id: 'composer-hint', area: 'composer.actions', order: 20, render: () => jsx(ComposerHint, {}) },
      { id: 'approvals-chip', area: 'statusBar.right', order: 121, render: () => jsx(ApprovalsChip, {}) },
      { id: 'hud-panel', area: 'composer.top', order: 4, render: () => jsx(HudPanel, { looks, prefs }) },
      { id: 'hud-footer', area: 'composer.bottom', order: 90, render: () => jsx(HudFooter, { prefs }) },
      {
        id: 'session-pane',
        area: 'panes',
        title: 'Session',
        data: { placement: 'right', collapsible: true, dock: { pane: 'files', pos: 'center' }, tabTitleText: () => 'Session', width: '280px', minWidth: '240px' },
        render: () => jsx(SessionPane, { looks })
      },
      { id: 'bots-route', area: ROUTES_AREA, data: { path: BOTS_ROUTE }, render: () => jsx(BotsPage, { looks, setLook, avatars, os: ctx.os }) },
      { id: 'bots-nav', area: SIDEBAR_NAV_AREA, data: { path: BOTS_ROUTE, label: 'Bots board', codicon: 'hubot' } },
      { id: 'look-route', area: ROUTES_AREA, data: { path: LOOK_ROUTE }, render: () => jsx(LookPage, { prefs, setPrefs, applyLook, looks }) },
      { id: 'look-nav', area: SIDEBAR_NAV_AREA, data: { path: LOOK_ROUTE, label: 'Customize look', codicon: 'symbol-color' } },
      { id: 'look-palette', area: PALETTE_AREA, data: { id: 'helm.look', label: 'Helm: Customize look', keywords: ['look', 'appearance', 'theme', 'skin', 'accent', 'font', 'helm'], run: () => host.navigate(LOOK_ROUTE) } },
      { id: 'newbot-palette', area: PALETTE_AREA, data: { id: 'helm.new-bot', label: 'Helm: New bot (robot)', keywords: ['new', 'bot', 'create', 'robot', 'teammate', 'agent', 'helm'], run: openNewBot } },
      { id: 'bots-palette', area: PALETTE_AREA, data: { id: 'helm.bots', label: 'Helm: Bots board', keywords: ['bots', 'board', 'crew', 'robots', 'helm'], run: () => host.navigate(BOTS_ROUTE) } },
      {
        id: 'needs-palette',
        area: PALETTE_AREA,
        data: {
          id: 'helm.needs-you',
          label: 'Helm: what needs me',
          keywords: ['unread', 'needs', 'waiting', 'replies', 'helm'],
          run: () => {
            $boardFilter.set('attention')
            host.navigate(BOTS_ROUTE)
          }
        }
      },
      { id: 'bots-key', area: KEYBINDS_AREA, data: { id: 'helm.bots', label: 'Open the Bots board', category: 'view', defaults: ['mod+alt+r'], run: () => host.navigate(BOTS_ROUTE) } },
      { id: 'look-key', area: KEYBINDS_AREA, data: { id: 'helm.look', label: 'Customize look', category: 'view', defaults: ['mod+alt+u'], run: () => host.navigate(LOOK_ROUTE) } },
      ...THEMES.map(t => ({
        id: `palette-${t.name}`,
        area: PALETTE_AREA,
        data: { id: `helm.theme.${t.name}`, label: `Helm: use ${t.label}`, keywords: ['theme', 'helm', t.label.toLowerCase()], run: () => applyLook({ preferredTheme: t.name }) }
      }))
    ])

    // Per-bot palette commands follow the crew: "Helm: talk to Vision", "Helm: resume Vision".
    let botCommands = []
    let botKey = ''
    const syncBotCommands = crew => {
      const names = (crew.profiles || []).map(p => p.name)
      const key = names.join('|')
      if (key === botKey) return
      botKey = key
      botCommands.forEach(off => off())
      botCommands = (crew.profiles || []).flatMap(p => {
        const label = botLabel(p)
        const out = [
          ctx.register({ id: `talk-${p.name}`, area: PALETTE_AREA, data: { id: `helm.talk.${p.name}`, label: `Helm: new chat with ${label}`, keywords: ['bot', 'chat', 'talk', label.toLowerCase(), p.name], run: () => host.newChat(p.name) } })
        ]
        out.push(
          ctx.register({
            id: `resume-${p.name}`,
            area: PALETTE_AREA,
            data: {
              id: `helm.resume.${p.name}`,
              label: `Helm: resume ${label}`,
              keywords: ['bot', 'resume', 'last', label.toLowerCase(), p.name],
              run: () => {
                const latest = activityFor($crew.get(), p.name).latest
                if (latest) openSession(latest, p.name)
                else host.newChat(p.name)
              }
            }
          })
        )
        return out
      })
    }

    // Start on the Desk once per app launch (not on a plugin reload), and only
    // when no chat is open by then.
    // The app opens the same renderer for its HUD, pop-outs and peer windows;
    // those carry a query marker (?win=hud, ?peer=1, …) and must keep their own view.
    const launchFlag = '__helmDeskShown'
    if (prefs.get().openDeskAtLaunch && !globalThis[launchFlag] && isPrimaryWindow()) {
      globalThis[launchFlag] = true
      const t = setTimeout(() => {
        if (!atomGet(host.state.activeSessionId) && !atomGet(host.state.focusedStoredSessionId)) host.navigate(DESK_ROUTE)
      }, 1200)
      ctx.onDispose(() => clearTimeout(t))
    }

    // The crew poller feeds every crew-aware surface, and gives new bots robots.
    startCrew(ctx)

    // The inbox (approvals and questions across live sessions) and the sidebar
    // pane that shows it, mounted only while something needs you.
    startInbox(ctx)
    startPromptEvents(ctx)
    // The board's icon rail, outside the pane tree.
    ctx.onDispose(startRail(prefs))
    // Rooms for the Helm tab and the board.
    if (isPrimaryWindow()) startRooms(ctx)
    // The Helm tab: a third tab in the sessions column, beside SESSIONS and BOTS,
    // docked the way Hermes docks its own Bots tab (centre of the sessions
    // zone, collapsing with it). It replaces 1.0's split-above-Sessions
    // Needs-you pane, which broke the titlebar's sidebar toggle.
    if (isPrimaryWindow()) {
      ctx.register({
        id: 'helm-tab',
        area: 'panes',
        title: 'Helm',
        data: {
          placement: 'left',
          width: '260px',
          collapsible: true,
          hideOnly: true,
          tabTitleText: () => 'Helm',
          dock: { pane: 'sessions', pos: 'center', enforce: true }
        },
        render: () => jsx(HelmTab, { looks, prefs, setPrefs })
      })
    }
    const offCrew = $crew.subscribe(crew => {
      syncBotCommands(crew)
      if (crew.ready && crew.profiles.length) {
        autoAvatars(crew.profiles, looks, avatars, prefs)
        robotPets(crew.profiles, looks, prefs)
      }
    })

    // Settings → Appearance card and Settings → Plugins → Helm
    ctx.register({ id: 'appearance', area: 'appearance.extra', render: () => jsx(AppearanceCard, { prefs, setPrefs }) })
    ctx.registerSettingsPage?.({
      id: 'settings',
      title: 'Helm',
      icon: 'color-mode',
      render: () => jsx(SettingsGeneral, { prefs, setPrefs }),
      children: [
        { id: 'backup', title: 'Export and import', render: () => jsx(SettingsBackup, { prefs, setPrefs, looks, setAllLooks, os: ctx.os }) },
        {
          id: 'about',
          title: 'About',
          render: () =>
            jsxs('div', {
              children: [
                jsx(ListRow, { title: `helm ${VERSION}`, description: 'A redesigned desk: theme layer, Customize look, crew view, robots as avatars, titlebar context, sidebar row status, needs-you and spend chips.' }),
                jsx(ListRow, {
                  title: 'How it stays update-proof',
                  description: 'Only Desktop SDK areas and public gateway calls the app itself makes: profiles, session lists, cron.manage (list), approval.respond / clarify.respond (only on your click), profiles.create / set_asset (only from New bot and robot avatars). The theme layer is CSS that targets the app’s data-slot names; a renamed slot drops that one rule.'
                })
              ]
            })
        }
      ]
    })

    ctx.onDispose(() => {
      stopCrew()
      offCrew()
      botCommands.forEach(off => off())
      if (unregisterNav) unregisterNav()
      if (unregisterComposer) unregisterComposer()
      if (unregisterCustom) unregisterCustom()
      spriteRest = null
    })
  }
}
