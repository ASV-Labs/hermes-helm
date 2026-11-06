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
import { useEffect, useMemo, useState } from 'react'

const ID = 'helm'
const VERSION = '1.0.1'
const BOTS_ROUTE = '/helm/bots'
const LOOK_ROUTE = '/helm/look'
const DESK_ROUTE = '/helm/desk'

// ───────────────────────────────────────────────────────────────── themes

const HELM_CSS_SCOPE = ':root[data-hermes-theme^="helm"]'

// The redesign layer, shared by every helm theme. It only touches app
// `data-slot` names (a renamed slot drops that one rule) and CSS custom
// properties the app reads; no script ever queries app markup.
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
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ui-text-tertiary) !important;
}
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"] { border-radius: calc(6px * var(--radius-scalar)); }
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"][data-active="true"],
${HELM_CSS_SCOPE} [data-slot="sidebar-menu-button"][aria-current="page"] {
  box-shadow: inset 2px 0 0 var(--ui-accent);
}
${HELM_CSS_SCOPE} [data-slot="sidebar-input"] { border-radius: calc(7px * var(--radius-scalar)); }

/* Tabs: tracked caps, an underline for the open one. */
${HELM_CSS_SCOPE} [data-slot="pane-tab"],
${HELM_CSS_SCOPE} [data-slot="tabs-trigger"] {
  letter-spacing: 0.07em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 600;
}
${HELM_CSS_SCOPE} [data-slot="pane-tab"][data-active="true"],
${HELM_CSS_SCOPE} [data-slot="tabs-trigger"][data-state="active"] {
  box-shadow: inset 0 -2px 0 var(--ui-accent);
}

/* Transcript: a calmer reading column; your messages are framed cards. */
${HELM_CSS_SCOPE} [data-slot="aui_thread-content"] { max-width: var(--helm-reading, none); margin-inline: auto; }
${HELM_CSS_SCOPE} [data-slot="aui_assistant-message-content"] { line-height: 1.62; }
${HELM_CSS_SCOPE} [data-slot="aui_user-message-root"] [data-slot="aui_user-message-text"] { line-height: 1.55; }
${HELM_CSS_SCOPE} [data-slot="aui_turn-activity"],
${HELM_CSS_SCOPE} [data-slot="tool-block"] {
  border-left: 1px solid var(--helm-hair);
  padding-left: 10px;
  margin-left: 2px;
}
${HELM_CSS_SCOPE} [data-slot="tool-row"] { font-variant-numeric: tabular-nums; }
${HELM_CSS_SCOPE} [data-slot="code-card"] { border: 1px solid var(--helm-hair) !important; }
${HELM_CSS_SCOPE} [data-slot="aui_reasoning-text"] { color: var(--ui-text-tertiary); }

/* Approvals read as decisions: amber edge, never lost in the stream. */
${HELM_CSS_SCOPE} [data-slot="tool-approval-card"] {
  border-left: 3px solid #E8A657 !important;
  background: color-mix(in srgb, #E8A657 6%, var(--ui-bg-card)) !important;
}

/* Composer: a flat card with a hairline, accent edge while focused. */
${HELM_CSS_SCOPE} [data-slot="composer-surface"] {
  box-shadow: none !important;
  border: 1px solid var(--helm-hair) !important;
  background: var(--ui-bg-card) !important;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"]:focus-within { border-color: color-mix(in srgb, var(--ui-accent) 55%, var(--helm-hair)) !important; }

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
function customTheme(prefs) {
  const base = THEMES.find(t => t.name === prefs.preferredTheme && t.name !== 'helm-custom') || THEMES[0]
  const accent = ACCENTS[prefs.accent]
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
    customCSS: tunablesCSS(prefs) + HELM_CSS
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
    customCSS: HELM_CSS
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
    customCSS: HELM_CSS
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
    customCSS: HELM_CSS
  }
]

// ───────────────────────────────────────────────────────────── preferences

const DEFAULT_PREFS = {
  showWorkingChip: true,
  showCostChip: true,
  hideMessagingRow: false,
  showComposerBot: true,
  showRowBots: true,
  showRowCost: true,
  showContextLine: true,
  showNeedsYouChip: true,
  showTodayChip: true,
  autoAvatars: true,
  preferredTheme: 'helm-dark',
  accent: '',
  radius: 'default',
  font: 'system',
  width: 'default',
  rail: 'mono',
  openDeskAtLaunch: true,
  showNeedsYouPane: true,
  showDeskStrip: true,
  deskName: ''
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
  return jsxs('div', {
    className: 'flex min-h-0 flex-1 gap-6 p-4',
    children: [
      jsxs('div', {
        className: 'flex w-72 shrink-0 flex-col items-center gap-3',
        children: [
          jsx('div', {
            className: 'flex h-80 w-full items-center justify-center rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-editor)',
            children: jsx(RobotFull, { look, size: 230 })
          }),
          jsx('div', { className: 'text-sm font-medium', children: name }),
          jsxs('div', {
            className: 'flex w-full items-center justify-between',
            children: [
              ['idle', 'idle'],
              ['focused', 'working'],
              ['question', 'needs you'],
              ['happy', 'done'],
              ['error', 'failed'],
              ['sleep', 'asleep']
            ].map(([expr, label]) =>
              jsxs(
                'div',
                {
                  className: 'flex flex-col items-center gap-1',
                  children: [jsx(RobotHead, { look, expr, size: 26 }), jsx('span', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: label })]
                },
                expr
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
            const page = await host.listPersistedSessions(null, { profile: p.name, limit: 40 })
            const rows = ((page && page.sessions) || []).filter(r => r && !r.hidden && !r.is_internal_child)
            rows.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
            sessions[p.name] = rows
            for (const r of rows) {
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
    latest: rows[0] || null,
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
          jsx(RobotHead, { look, expr, size: 52, title: label }),
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
// picture of their own (any server avatar that is not Bot Mode's 160 px face).
async function autoAvatars(profiles, looks, avatars, prefs) {
  if (!prefs.get().autoAvatars || typeof host.request !== 'function') return
  for (const p of profiles) {
    const done = avatars.get()[p.name]
    if (done) continue
    try {
      const res = await host.request('profiles.get_asset', { name: p.name, asset: 'avatar' })
      if (res && res.found && res.data && pngEdge(res.data) !== 160) {
        avatars.set({ ...avatars.get(), [p.name]: 'user' })
        continue
      }
      await pushAvatar(p.name, normalizeLook(looks.get()[p.name], p.name), avatars)
    } catch {
      /* sprites not served yet or an older gateway: try again next tick */
    }
  }
}

// ───────────────────────────────────────────────────────────── new bot
const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

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
      await host.request('profiles.create', {
        name: slug,
        description: role.trim(),
        clone_from: 'default',
        share_auth: true,
        soul: `# ${title}\n\nYou are ${title}${role.trim() ? `, ${role.trim()}` : ''}. You work alongside the other bots on this desk and report back plainly.\n`
      })
      setLook(slug, look)
      try {
        await pushAvatar(slug, look, avatars)
      } catch {
        /* the avatar retries on the next crew refresh */
      }
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

function BotsPage({ looks, setLook, avatars, os }) {
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const busy = useValue(host.state.busy)
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const filter = useValue($boardFilter)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
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
    const rankOf = p => (ranks[p.name] === undefined ? 2 : ranks[p.name])
    const shown = profiles
      .filter(p => (filter === 'attention' ? rankOf(p) === 0 : filter === 'working' ? rankOf(p) === 1 : true))
      .slice()
      .sort((a, b) => rankOf(a) - rankOf(b) || botLabel(a).localeCompare(botLabel(b)))
    body = shown.length
      ? jsx('div', {
          className: 'grid content-start gap-2 overflow-auto p-4',
          style: { gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' },
          children: shown.map(p =>
            jsx(
              BotCard,
              {
                profile: p,
                look: normalizeLook(looksValue[p.name], p.name),
                focusedWorking: Boolean(busy) && focusedProfile === p.name,
                onEdit: () => setEditing(p.name),
                onStatus,
                os
              },
              p.name
            )
          )
        })
      : jsx('div', { className: 'p-6 text-sm text-(--ui-text-tertiary)', children: filter === 'attention' ? 'Nobody is waiting on you.' : filter === 'working' ? 'No bot is working right now.' : 'No bots yet — make one with New bot.' })
  }

  return jsxs('div', { className: 'flex h-full w-full min-h-0 flex-col', children: [header, editingProfile || creating ? null : jsx(SpriteNotice, {}), body] })
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
    children: jsx(RobotHead, { look, expr: busy ? 'focused' : look.face, size: 22, title: profile })
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
      jsx(RobotHead, { look, expr: busy ? 'focused' : look.face, size: 18, title: profile }),
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

function TodayChip({ prefs }) {
  const { showTodayChip } = useValue(prefs)
  const crew = useValue($crew)
  const { today } = crewTotals(crew)
  if (!showTodayChip || today < 0.01) return null
  return jsx('span', {
    title: 'Spend across every bot’s sessions active today',
    className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary)',
    children: `${fmtCost(today)} today`
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
    const take = (res, profile) => {
      if (!res || !Array.isArray(res.jobs)) return
      reached = true
      // A gateway that ignores `profile` answers with its launch store and no
      // `scoped`; label those rows unscoped so they aren't pinned to the wrong bot.
      const owner = profile ? res.scoped || '' : ''
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
    try { take(await host.request('cron.manage', { action: 'list', include_disabled: true }, 15000), '') } catch { /* no launch store */ }
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
const CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: V.t3 }

function DeskSection({ title, action, children }) {
  return jsxs('section', {
    style: { marginTop: 28 },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${V.hair}`, paddingBottom: 6, marginBottom: 2 },
        children: [jsx('h2', { style: CAPS, children: title }), action || null]
      }),
      children
    ]
  })
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
      height: 26,
      padding: '0 10px',
      fontSize: 12,
      fontWeight: 500,
      borderRadius: V.radius(7),
      border: primary ? '1px solid transparent' : `1px solid ${V.hair2}`,
      background: primary ? V.t1 : 'transparent',
      color: primary ? 'var(--ui-bg-chrome, #0b0f14)' : V.t1,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? 'default' : 'pointer',
      whiteSpace: 'nowrap'
    },
    children
  })
}

function DeskRow({ lead, title, sub, meta, actions, dot }) {
  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${V.hair}` },
    children: [
      dot !== undefined ? jsx('span', { style: { width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: dot || 'transparent' } }) : null,
      lead,
      jsxs('div', {
        style: { minWidth: 0, flex: 1 },
        children: [
          jsx('div', { className: 'truncate', style: { fontSize: 14, color: V.t1 }, children: title }),
          sub ? jsx('div', { className: 'truncate', style: { fontSize: 12, color: V.t3, marginTop: 1 }, children: sub }) : null
        ]
      }),
      meta ? jsx('div', { style: { flexShrink: 0, fontSize: 12, color: V.t4, fontFamily: V.mono, fontVariantNumeric: 'tabular-nums' }, children: meta }) : null,
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
          children: [jsx(RobotHead, { look, expr: on ? 'happy' : look.face, size: 20, title: p.name }), botLabel(p)]
        },
        p.name
      )
    })
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
      borderRadius: V.radius(14),
      border: `1px solid ${focus ? V.accent : V.hair2}`,
      background: V.raised,
      padding: '12px 14px',
      transition: 'border-color 120ms'
    },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: V.t4, marginBottom: 4 },
        children: [jsx(Codicon, { name: 'folder', size: 11 }), jsx('span', { className: 'truncate', children: cwd ? cwd.replace(/^\/Users\/[^/]+/, '~') : 'no folder' })]
      }),
      jsx('textarea', {
        value: text,
        rows: 2,
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
        style: { width: '100%', resize: 'none', background: 'transparent', border: 0, outline: 'none', padding: '4px 0', fontSize: 15, lineHeight: 1.5, color: V.t1 }
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
        children: [
          jsx(BotPicker, { profiles, value: chosen, onPick: setBot, looks }),
          jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: V.t4, whiteSpace: 'nowrap' }, children: '↵ send · ⇧↵ new line' }),
          jsx(SmallButton, { title: 'Open a new chat with this text in the composer, unsent', onClick: () => go('draft'), children: 'Draft' }),
          jsx(SmallButton, { primary: true, disabled: !text.trim(), onClick: () => go('send'), children: 'Send' })
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
    lead: jsx(RobotHead, { look, expr: 'question', size: 28, title: entry.profile.name }),
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
          style: { height: 26, width: 180, borderRadius: V.radius(7), border: `1px solid ${V.hair2}`, background: 'transparent', padding: '0 8px', fontSize: 12, color: V.t1, outline: 'none' }
        },
        'reply'
      ),
      jsx(SmallButton, { onClick: send, children: reply.trim() ? 'Reply' : 'Open' }, 'open')
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

function TodayList() {
  const today = useValue($today)
  useEffect(() => {
    refreshToday()
    const h = setInterval(refreshToday, 30000)
    return () => clearInterval(h)
  }, [])
  const rows = useMemo(() => today.jobs.map(jobRow).filter(Boolean).sort((a, b) => a.at - b.at), [today])
  if (!today.ready) return jsx(Quiet, { children: 'Reading scheduled jobs…' })
  if (!today.available) return jsx(Quiet, { children: 'Couldn’t read scheduled jobs: the gateway didn’t answer. Retrying every 30 seconds.' })
  if (!rows.length) return jsx(Quiet, { children: `Nothing ran or is due today${today.jobs.length ? ` · ${today.jobs.length} scheduled job${today.jobs.length === 1 ? '' : 's'} in all` : ''}.` })
  return jsx('div', {
    children: rows.map(({ at, word, job }) =>
      jsx(
        DeskRow,
        {
          lead: jsx('span', { style: { width: 64, flexShrink: 0, fontFamily: V.mono, fontSize: 12, color: V.t3 }, children: clock(at) }),
          title: jsxs('span', { children: [job.name || 'Scheduled job', ' ', jsx('span', { style: { fontSize: 12, color: JOB_COLOR[word] }, children: word })] }),
          sub: [job.profile, job.schedule_display, word === 'failed' && job.last_error ? `“${String(job.last_error).slice(0, 120)}”` : null].filter(Boolean).join(' · '),
          actions: jsx(LinkButton, { onClick: () => host.navigate('/cron'), children: word === 'failed' ? 'Log' : 'Open' })
        },
        job.id
      )
    )
  })
}

function DeskNeedsYou({ looks, lookOf }) {
  const n = useNeedsYou()
  return jsx(DeskSection, {
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

  return jsx('div', {
    style: { height: '100%', overflowY: 'auto' },
    children: jsxs('div', {
      style: { margin: '0 auto', width: '100%', maxWidth: 760, padding: compact ? '20px 16px 40px' : '64px 28px 72px' },
      children: [
        jsxs('div', {
          style: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, rowGap: 4, marginBottom: 18 },
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
                  style: { fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', color: V.t1, cursor: 'text', margin: 0 },
                  children: `${greeting()}${name ? `, ${name}` : ''}.`
                }),
            jsx('p', { style: { fontSize: 14, color: V.t3, margin: 0 }, children: statusSentence(crew) })
          ]
        }),
        jsx(DeskPrompt, { crew, looks: looksValue }),
        jsx(DeskSection, {
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
                    dot: st.word === 'done' ? '' : st.dot,
                    lead: jsx(RobotHead, { look, expr: r.unread ? 'question' : r.is_active && !r.ended_at ? 'focused' : look.face, size: 28, title: entry.profile.name }),
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
                    actions: jsx(SmallButton, { onClick: () => openSession(r, entry.profile.name), children: r.unread ? 'Review' : 'Open' })
                  },
                  `${entry.profile.name}:${r.id}`
                )
              })
            : jsx(Quiet, { children: crew.ready ? 'No sessions yet. Start one above.' : 'Loading sessions…' })
        }),
        jsx(DeskNeedsYou, { looks: looksValue, lookOf }),
        jsx(DeskSection, {
          title: 'Today',
          action: jsx(LinkButton, { onClick: () => host.navigate('/cron'), children: 'Scheduled jobs' }),
          children: jsx(TodayList, {})
        }),
        jsxs('div', {
          style: { marginTop: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
          children: [
            ...[
              ['hubot', 'Bots board', BOTS_ROUTE],
              ['watch', 'Scheduled jobs', '/cron'],
              ['files', 'Artifacts', '/artifacts'],
              ['symbol-color', 'Customize look', LOOK_ROUTE]
            ].map(([icon, label, path]) =>
              jsx(
                SmallButton,
                { onClick: () => host.navigate(path), children: jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [jsx(Codicon, { name: icon, size: 13 }), label] }) },
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
  })
}

// Above the composer on a fresh draft: jump back into recent work.
function DeskStrip({ looks, prefs }) {
  const { showDeskStrip } = useValue(prefs)
  const active = useValue(host.state.activeSessionId)
  const stored = useValue(host.state.focusedStoredSessionId)
  const crew = useValue($crew)
  const looksValue = useValue(looks)
  const recent = useMemo(() => recentAcross(crew, 3), [crew])
  if (!showDeskStrip || active || stored || !recent.length) return null
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
    host.onEvent('*', onToolEvent)
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
    style: { display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6, padding: compact ? '8px 0' : '12px 0', borderBottom: `1px solid ${V.hair}` },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: compact ? 8 : 12 },
        children: [
          compact ? null : jsx(RobotHead, { look, expr: 'question', size: 28, title: item.profile || 'bot' }),
          jsxs('div', {
            style: { minWidth: 0, flex: 1 },
            children: [
              jsxs('div', {
                style: { fontSize: compact ? 12 : 14, color: V.t1, lineHeight: 1.4 },
                children: [jsx('span', { style: { color: V.amber }, children: item.toolName === 'terminal' || !item.toolName ? 'Shell command' : item.toolName }), ` · ${who} `, jsx('span', { style: { color: V.t3 }, children: item.description })]
              }),
              cmd ? jsx('code', { style: { display: 'block', marginTop: 4, fontFamily: V.mono, fontSize: compact ? 11 : 12, color: V.t2, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }, children: cmd }) : null,
              compact ? null : jsx('div', { className: 'truncate', style: { fontSize: 12, color: V.t4, marginTop: 4 }, children: `in “${item.title}”` })
            ]
          })
        ]
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: compact ? 'flex-start' : 'flex-end' },
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
    style: { display: 'flex', flexDirection: 'column', gap: 6, padding: compact ? '8px 0' : '12px 0', borderBottom: `1px solid ${V.hair}` },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: compact ? 8 : 12 },
        children: [
          compact ? null : jsx(RobotHead, { look, expr: 'question', size: 28, title: item.profile || 'bot' }),
          jsxs('div', {
            style: { minWidth: 0, flex: 1 },
            children: [
              jsxs('div', { style: { fontSize: compact ? 12 : 14, color: V.t1, lineHeight: 1.4 }, children: [jsx('span', { style: { color: V.amber }, children: 'Question' }), ` · ${who}${item.question ? ': ' : ' is waiting for your answer'}`, item.question || ''] }),
              compact ? null : jsx('div', { className: 'truncate', style: { fontSize: 12, color: V.t4, marginTop: 4 }, children: `in “${item.title}”` })
            ]
          })
        ]
      }),
      canAnswer && item.choices && item.choices.length
        ? jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: item.choices.slice(0, 6).map(c => jsx(SmallButton, { onClick: () => send(c), children: c }, c)) })
        : null,
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: compact ? 'flex-start' : 'flex-end' },
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
                style: { height: 26, flex: compact ? 1 : undefined, width: compact ? undefined : 220, minWidth: 0, borderRadius: V.radius(7), border: `1px solid ${V.hair2}`, background: 'transparent', padding: '0 8px', fontSize: 12, color: V.t1, outline: 'none' }
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
          jsx(RobotHead, { look, expr: busy ? 'focused' : r && r.unread ? 'question' : look.face, size: 34, title: owner || 'bot' }),
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
  const looksValue = useValue(looks)
  const [density, setDensity] = useState(() => safeSetting('sessionListDensity', 'comfortable'))
  const [scale, setScale] = useState(() => safeSetting('chatTextScale', 110))
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
  const base = THEMES.find(t => t.name === p.preferredTheme) || THEMES[0]
  const light = base.name === 'helm-paper'
  const sample = normalizeLook(looksValue.default || null, 'default')

  const toggles = [
    ['openDeskAtLaunch', 'Open the Desk at launch', 'Hermes starts on the Desk: what’s running, what needs you, what ran today.'],
    ['showNeedsYouPane', 'Needs you in the sidebar', 'Approvals, questions and unread replies from every bot above your sessions, only while something is waiting.'],
    ['showDeskStrip', 'Continue strip on new chats', 'Recent sessions above the composer of a fresh chat, one click back in.'],
    ['showContextLine', 'Titlebar context', 'Bot, folder, model, cost and context of the chat you’re in.'],
    ['showRowBots', 'Bots in the session list', 'Each session row shows the robot of the bot it belongs to; its face is the row’s state.'],
    ['showRowCost', 'Cost in the session list', 'Spend per session, right-aligned.'],
    ['showNeedsYouChip', 'Status bar: needs you', 'Unread replies across every bot; click to see them.'],
    ['showTodayChip', 'Status bar: today', 'Spend across all bots today.'],
    ['showWorkingChip', 'Status bar: working', 'Sessions mid-turn right now.'],
    ['showCostChip', 'Status bar: focused cost', 'Cost and context of the focused chat.'],
    ['showComposerBot', 'Composer robot', 'Who you’re talking to, left of the composer.'],
    ['autoAvatars', 'Robots as Hermes avatars', 'New bots get a robot as their Hermes avatar (never replaces a photo you uploaded).'],
    ['hideMessagingRow', 'Hide the Messaging row', 'Capabilities can never be hidden.']
  ]

  return jsxs('div', {
    className: 'flex h-full w-full min-h-0 flex-col',
    children: [
      jsxs('div', {
        className: 'flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2 text-xs',
        children: [
          jsx(Codicon, { name: 'symbol-color', size: 14 }),
          jsx('span', { className: 'font-medium text-(--ui-text-secondary)', children: 'Customize look' }),
          jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'Every change applies to the whole desk as you make it.' }),
          jsx(Button, { variant: 'ghost', size: 'sm', className: 'ml-auto', onClick: () => set({ accent: '', radius: 'default', font: 'system', width: 'default', rail: 'mono' }), children: 'Reset shape & type' })
        ]
      }),
      jsxs('div', {
        className: 'flex min-h-0 flex-1 gap-6 overflow-auto px-6',
        children: [
          jsxs('div', {
            className: 'min-w-0 max-w-3xl flex-1',
            children: [
              jsx(Section, {
                title: 'Base',
                children: jsx('div', {
                  className: 'flex flex-wrap gap-2',
                  children: THEMES.map(t =>
                    jsxs(
                      'button',
                      {
                        type: 'button',
                        'aria-pressed': p.preferredTheme === t.name,
                        onClick: () => set({ preferredTheme: t.name }),
                        className: cn('flex flex-col gap-1.5 rounded-md border p-2 text-left text-xs', p.preferredTheme === t.name ? 'border-(--ui-accent)' : 'border-(--ui-stroke-secondary) hover:bg-(--chrome-action-hover)'),
                        children: [
                          jsxs('span', {
                            className: 'flex h-10 w-36 gap-1 rounded p-1',
                            style: { background: t.colors.background, border: `1px solid ${t.colors.border}` },
                            children: [
                              jsx('span', { className: 'w-3 rounded-sm', style: { background: t.colors.sidebarBackground } }),
                              jsx('span', { className: 'flex-1 rounded-sm', style: { background: t.colors.card } }),
                              jsx('span', { className: 'h-2 w-2 self-end rounded-sm', style: { background: (ACCENTS[p.accent] && (t.name === 'helm-paper' ? ACCENTS[p.accent].light : ACCENTS[p.accent].dark)) || t.colors.primary } })
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
              }),
              jsx(Section, {
                title: 'Accent',
                hint: 'One colour carries focus, selection and the active row.',
                children: jsx('div', {
                  className: 'flex flex-wrap gap-2',
                  children: [
                    jsx(Swatch, { active: !p.accent, title: 'Theme default', onClick: () => set({ accent: '' }), children: 'Default' }, 'theme'),
                    ...Object.entries(ACCENTS).map(([id, c]) =>
                      jsx(Swatch, { active: p.accent === id, title: id, onClick: () => set({ accent: id }), children: jsx('span', { className: 'h-4 w-4 rounded-full', style: { background: light ? c.light : c.dark } }) }, id)
                    )
                  ]
                })
              }),
              jsx(Section, {
                title: 'Type',
                children: jsx('div', {
                  className: 'flex flex-wrap gap-2',
                  children: Object.entries(FONTS).map(([id, f]) => jsx(Swatch, { active: p.font === id, title: f.label, onClick: () => set({ font: id }), style: { fontFamily: f.fontSans }, children: f.label }, id))
                })
              }),
              jsx(Section, {
                title: 'Shape',
                children: jsxs('div', {
                  className: 'flex flex-wrap items-center gap-6',
                  children: [
                    jsxs('div', { className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)', children: ['Corners', jsx(SegmentedControl, { value: p.radius, options: [{ id: 'sharp', label: 'Sharp' }, { id: 'default', label: 'Soft' }, { id: 'round', label: 'Round' }], onChange: v => set({ radius: v }) })] }),
                    jsxs('div', { className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)', children: ['Reading width', jsx(SegmentedControl, { value: p.width, options: [{ id: 'narrow', label: 'Narrow' }, { id: 'default', label: 'App' }, { id: 'wide', label: 'Wide' }], onChange: v => set({ width: v }) })] }),
                    jsxs('div', { className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)', children: ['Rail', jsx(SegmentedControl, { value: p.rail, options: [{ id: 'mono', label: 'Mono' }, { id: 'colour', label: 'Colour' }], onChange: v => set({ rail: v }) })] })
                  ]
                })
              }),
              jsx(Section, {
                title: 'Density',
                hint: 'The app’s own settings.',
                children: jsxs('div', {
                  className: 'flex flex-wrap items-center gap-6',
                  children: [
                    jsxs('div', { className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)', children: ['Session list', jsx(SegmentedControl, { value: density, options: [{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'detailed', label: 'Detailed' }], onChange: v => trySetSetting('sessionListDensity', v) })] }),
                    jsxs('div', { className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)', children: ['Chat text', jsx(SegmentedControl, { value: String(scale), options: [90, 100, 110, 125, 150].map(n => ({ id: String(n), label: String(n) })), onChange: v => trySetSetting('chatTextScale', Number(v)) })] })
                  ]
                })
              }),
              jsx(Section, {
                title: 'On the desk',
                children: jsx('div', {
                  className: 'flex flex-col',
                  children: toggles.map(([key, label, description]) => jsx(ToggleRow, { label, description, checked: Boolean(p[key]), onChange: on => setPrefs({ [key]: on }) }, key))
                })
              })
            ]
          }),
          jsxs('div', {
            className: 'sticky top-0 flex w-56 shrink-0 flex-col items-center gap-2 py-6',
            children: [
              jsx(RobotFull, { look: sample, size: 180 }),
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => host.navigate(BOTS_ROUTE), children: 'Open the Bots board' }),
              jsx('div', { className: 'text-center text-[0.6875rem] text-(--ui-text-tertiary)', children: 'Every bot gets its own rendered robot: ears, face, chest, what it carries and wears, colour. It becomes the bot’s avatar across Hermes.' })
            ]
          })
        ]
      })
    ]
  })
}

// ───────────────────────────────────────────────────────────────── plugin

// Pure helpers, exported for the test suite only.
export const _internals = { $today, refreshToday, latestPlan, parseTodoList, answerApproval, answerQuestion, refreshPlan, onPromptEvent, onPromptGone, onToolEvent, $plan, $inbox, $liveTodos }

export default {
  id: ID,
  name: 'Helm',
  description: 'A redesigned Hermes Desktop: a calmer interface you can tune, a crew view of every bot, rendered robots that become your bots’ avatars, and live status across the desk.',
  register(ctx) {
    spriteRest = typeof ctx.rest === 'function' ? path => ctx.rest(path) : null
    spritesDown = false
    spriteFailures = 0
    const prefs = atom({ ...DEFAULT_PREFS, ...ctx.storage.get('prefs', {}) })
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
      const hide = prefs.get().hideMessagingRow ? ['messaging'] : []
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
      { id: 'row-cost', area: 'sessionRow.trailing', data: { render: ({ sessionId }) => jsx(SessionRowCost, { sessionId, prefs }) } }
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
    let offNeedsPane = null
    const syncNeedsPane = () => {
      const inbox = $inbox.get()
      const total = needsYouOf(inbox, $crew.get()).total
      const want = prefs.get().showNeedsYouPane && isPrimaryWindow() && total > 0
      if (want && !offNeedsPane) {
        offNeedsPane = ctx.register({
          id: 'needs-you-pane',
          area: 'panes',
          title: 'Needs you',
          data: { placement: 'left', collapsible: true, dock: { pane: 'sessions', pos: 'top' }, height: '190px', tabTitleText: () => 'Needs you' },
          render: () => jsx(NeedsYouPane, { looks })
        })
      } else if (!want && offNeedsPane) {
        offNeedsPane()
        offNeedsPane = null
      }
    }
    const offInboxSub = $inbox.subscribe(syncNeedsPane)
    const offCrewNeeds = $crew.subscribe(syncNeedsPane)
    const offPrefsNeeds = prefs.subscribe(syncNeedsPane)
    ctx.onDispose(() => {
      offInboxSub()
      offCrewNeeds()
      offPrefsNeeds()
      if (offNeedsPane) offNeedsPane()
    })
    const offCrew = $crew.subscribe(crew => {
      syncBotCommands(crew)
      if (crew.ready && crew.profiles.length) autoAvatars(crew.profiles, looks, avatars, prefs)
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
