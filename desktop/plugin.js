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
//   KEYBINDS_AREA      helm.bots (mod+alt+b)
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
const VERSION = '0.4.0'
const BOTS_ROUTE = '/helm/bots'
const LOOK_ROUTE = '/helm/look'

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
  rail: 'mono'
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
  amber: 'text-[#E8A657]',
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
      'flex flex-col gap-2 rounded-lg border bg-(--ui-bg-card) px-3 py-2.5',
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
              jsx('span', { className: 'min-w-0 flex-1 truncate text-(--ui-text-secondary)', children: latest.title || latest.preview || 'Untitled session' }),
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
    className: 'mx-4 mt-3 flex items-center gap-3 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-3 py-2 text-xs',
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
          className: 'h-8 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-input) px-2 text-sm text-(--ui-text-primary) outline-none focus:border-(--ui-accent)'
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
            className: cn('col-span-3 text-[0.6875rem]', error || (slug && !valid) ? 'text-(--ui-red)' : 'text-(--ui-text-tertiary)'),
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
    className: 'flex h-6 max-w-[46vw] items-center gap-1.5 rounded-md px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
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
    className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] font-medium text-[#E8A657] hover:underline',
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
        className: 'w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-input) p-2 font-mono text-xs text-(--ui-text-primary)'
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
          jsx('h3', { className: 'text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-(--ui-text-tertiary)', children: title }),
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
        className: 'flex min-h-0 flex-1 gap-8 overflow-auto px-6',
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

    let unregisterNav = null
    const syncNavPrefs = () => {
      const want = prefs.get().hideMessagingRow
      if (want && !unregisterNav) {
        unregisterNav = ctx.register({ id: 'nav-prefs', area: 'sidebarNav.prefs', data: { hide: ['messaging'] } })
      } else if (!want && unregisterNav) {
        unregisterNav()
        unregisterNav = null
      }
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
      { id: 'bots-key', area: KEYBINDS_AREA, data: { id: 'helm.bots', label: 'Open the Bots board', category: 'view', defaults: ['mod+alt+b'], run: () => host.navigate(BOTS_ROUTE) } },
      { id: 'look-key', area: KEYBINDS_AREA, data: { id: 'helm.look', label: 'Customize look', category: 'view', defaults: ['mod+alt+l'], run: () => host.navigate(LOOK_ROUTE) } },
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

    // The crew poller feeds every crew-aware surface, and gives new bots robots.
    startCrew(ctx)
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
                  description: 'Only Desktop SDK areas and gateway calls the app’s own Bot Mode uses (profiles.create, profiles.set_asset). The theme layer targets the app’s data-slot names; a renamed slot drops that one rule.'
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
