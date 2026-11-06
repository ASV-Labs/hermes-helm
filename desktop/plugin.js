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
const VERSION = '0.3.0'
const BOTS_ROUTE = '/helm/bots'
const LOOK_ROUTE = '/helm/look'

// ───────────────────────────────────────────────────────────────── themes

const HELM_CSS_SCOPE = ':root[data-hermes-theme^="helm"]'

// Chrome rules shared by every helm theme. Each selector is an app `data-slot`;
// a renamed slot simply drops that rule.
const HELM_CSS = `
${HELM_CSS_SCOPE} {
  --noise-opacity-mul: 0;
  --radius-scalar: 0.9;
}
${HELM_CSS_SCOPE} [data-slot="profile-rail"] {
  filter: saturate(0.62);
}
${HELM_CSS_SCOPE} [data-slot="statusbar"] {
  font-variant-numeric: tabular-nums;
}
${HELM_CSS_SCOPE} [data-slot="pane-tab"],
${HELM_CSS_SCOPE} [data-tree-tab] {
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 11px;
}
${HELM_CSS_SCOPE} [data-slot="composer-surface"] {
  box-shadow: none !important;
}
${HELM_CSS_SCOPE} [data-slot="sidebar"] {
  border-right: 1px solid var(--ui-stroke-secondary) !important;
}
${HELM_CSS_SCOPE} [data-slot="aui_turn-activity"],
${HELM_CSS_SCOPE} [data-slot="tool-block"] {
  border-left: 1px solid var(--ui-stroke-secondary);
  padding-left: 10px;
  margin-left: 2px;
}
`

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
  preferredTheme: 'helm-dark'
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
const HEAD_CROP = [120, 90, 400, 400] // x, y, w, h of the head in sprite space
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
  return [
    spriteName('back', look.back, look.color),
    spriteName('base', 'base', look.color),
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
  const baseIdx = names.findIndex(n => n.startsWith('base_'))
  if (!urls[baseIdx]) return null
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

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
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
              jsx(Button, { size: 'sm', className: 'ml-auto', onClick: onClose, children: 'Done' })
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
          jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary)', children: 'Saved in helm’s plugin storage, never in the profile. Bot Mode’s own avatar is untouched.' })
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

// Per-bot activity, from the bot's own persisted sessions (the same
// /api/profiles/sessions read the sidebar uses; no gateway dial). is_active is
// the backend's 300 s activity window, unread its read-watermark flag.
function useBotActivity(profileName) {
  const canRead = typeof host.listPersistedSessions === 'function'
  const q = useQuery({
    queryKey: [ID, 'bot-sessions', profileName],
    queryFn: () => host.listPersistedSessions(null, { profile: profileName, limit: 25 }),
    enabled: canRead,
    refetchInterval: 20000,
    staleTime: 10000
  })
  return useMemo(() => {
    const rows = ((q.data && q.data.sessions) || []).filter(r => r && !r.hidden && !r.is_internal_child)
    rows.sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
    const spend = rows.reduce((sum, r) => sum + (Number(r.actual_cost_usd) || Number(r.estimated_cost_usd) || 0), 0)
    return {
      available: canRead && !q.error,
      loading: canRead && q.isLoading,
      sessions: rows,
      latest: rows[0] || null,
      active: rows.some(r => r.is_active && !r.ended_at),
      unread: rows.filter(r => r.unread).length,
      spend,
      total: (q.data && q.data.total) || rows.length
    }
  }, [q.data, q.error, q.isLoading, canRead])
}

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

function BotsPage({ looks, setLook, os }) {
  const q = useQuery({
    queryKey: [ID, 'profiles'],
    queryFn: () => host.profiles.list(),
    refetchInterval: 30000
  })
  const looksValue = useValue(looks)
  const busy = useValue(host.state.busy)
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')
  const [ranks, setRanks] = useState({})
  const onStatus = (name, rank) => setRanks(prev => (prev[name] === rank ? prev : { ...prev, [name]: rank }))

  const profiles = (q.data && q.data.profiles) || []
  const editingProfile = editing ? profiles.find(p => p.name === editing) : null
  const needsYou = profiles.filter(p => ranks[p.name] === 0).length
  const working = profiles.filter(p => ranks[p.name] === 1).length

  const header = jsxs('div', {
    className: 'flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2 text-xs',
    children: [
      jsx(Codicon, { name: 'hubot', size: 14 }),
      jsx('span', { className: 'font-medium text-(--ui-text-secondary)', children: 'Bots board' }),
      jsx('span', {
        className: 'text-(--ui-text-tertiary)',
        children: q.isLoading ? 'loading profiles…' : [`${profiles.length} bots`, needsYou ? `${needsYou} need you` : null, working ? `${working} working` : null].filter(Boolean).join(' · ')
      }),
      editingProfile
        ? jsx(Button, { variant: 'ghost', size: 'sm', className: 'ml-auto', onClick: () => setEditing(null), children: 'Back to board' })
        : jsx('div', {
            className: 'ml-auto',
            children: jsx(SegmentedControl, {
              value: filter,
              options: [
                { id: 'all', label: 'All' },
                { id: 'attention', label: 'Needs you' },
                { id: 'working', label: 'Working' }
              ],
              onChange: setFilter
            })
          })
    ]
  })

  let body
  if (editingProfile) {
    const look = normalizeLook(looksValue[editingProfile.name], editingProfile.name)
    body = jsx(LookEditor, {
      profile: editingProfile,
      look,
      onChange: next => setLook(editingProfile.name, next),
      onClose: () => setEditing(null)
    })
  } else if (q.error) {
    body = jsx('div', { className: 'p-6 text-sm text-(--ui-text-secondary)', children: `Could not list profiles: ${q.error.message || q.error}` })
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
      : jsx('div', { className: 'p-6 text-sm text-(--ui-text-tertiary)', children: filter === 'attention' ? 'Nobody is waiting on you.' : 'No bot is working right now.' })
  }

  return jsxs('div', { className: 'flex h-full w-full min-h-0 flex-col', children: [header, editingProfile ? null : jsx(SpriteNotice, {}), body] })
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

function LookPage({ prefs, setPrefs, looks }) {
  const looksValue = useValue(looks)
  const sample = normalizeLook(looksValue.helm || null, 'helm')
  return jsxs('div', {
    className: 'flex h-full w-full min-h-0 flex-col',
    children: [
      jsxs('div', {
        className: 'flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2 text-xs',
        children: [
          jsx(Codicon, { name: 'symbol-color', size: 14 }),
          jsx('span', { className: 'font-medium text-(--ui-text-secondary)', children: 'Customize look' }),
          jsx('span', { className: 'ml-auto text-(--ui-text-quaternary)', children: 'Helm owns the desk’s look. Bots have their own board.' })
        ]
      }),
      jsxs('div', {
        className: 'flex min-h-0 flex-1 gap-6 overflow-auto p-4',
        children: [
          jsx('div', { className: 'min-w-0 max-w-2xl flex-1', children: jsx(SettingsGeneral, { prefs, setPrefs }) }),
          jsxs('div', {
            className: 'flex w-56 shrink-0 flex-col items-center gap-2',
            children: [
              jsx(RobotFull, { look: sample, size: 180 }),
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => host.navigate(BOTS_ROUTE), children: 'Open the Bots board' }),
              jsx('div', { className: 'text-center text-[0.6875rem] text-(--ui-text-tertiary)', children: 'Every bot gets its own rendered look: ears, face, chest module, what it carries and wears, colour.' })
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
  description: 'A quieter Hermes Desktop: themes, a Customize look page, status chips, a Bots board with rendered robot looks.',
  register(ctx) {
    spriteRest = typeof ctx.rest === 'function' ? path => ctx.rest(path) : null
    spritesDown = false
    spriteFailures = 0
    const prefs = atom({ ...DEFAULT_PREFS, ...ctx.storage.get('prefs', {}) })
    const looks = atom(ctx.storage.get('looks', {}))

    const setPrefs = patch => {
      const next = { ...prefs.get(), ...patch }
      for (const key of Object.keys(next)) if (!(key in DEFAULT_PREFS)) delete next[key]
      prefs.set(next)
      ctx.storage.set('prefs', next)
      syncNavPrefs()
      syncComposer()
    }
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

    // Themes
    ctx.registerMany(THEMES.map(t => ({ id: t.name, area: THEMES_AREA, data: t })))

    // Status bar
    ctx.registerMany([
      { id: 'working', area: 'statusBar.right', order: 118, render: () => jsx(WorkingChip, { prefs }) },
      { id: 'cost', area: 'statusBar.right', order: 119, render: () => jsx(CostChip, { prefs }) }
    ])

    // Sidebar nav prefs: registered only while the toggle is on, so turning it
    // off removes the contribution and the row comes back.
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
    syncNavPrefs()

    // Bots board
    ctx.registerMany([
      { id: 'bots-route', area: ROUTES_AREA, data: { path: BOTS_ROUTE }, render: () => jsx(BotsPage, { looks, setLook, os: ctx.os }) },
      { id: 'bots-nav', area: SIDEBAR_NAV_AREA, data: { path: BOTS_ROUTE, label: 'Bots board', codicon: 'hubot' } },
      { id: 'look-route', area: ROUTES_AREA, data: { path: LOOK_ROUTE }, render: () => jsx(LookPage, { prefs, setPrefs, looks }) },
      { id: 'look-nav', area: SIDEBAR_NAV_AREA, data: { path: LOOK_ROUTE, label: 'Customize look', codicon: 'symbol-color' } },
      {
        id: 'look-palette',
        area: PALETTE_AREA,
        data: { id: 'helm.look', label: 'Helm: Customize look', keywords: ['look', 'appearance', 'theme', 'skin', 'helm'], run: () => host.navigate(LOOK_ROUTE) }
      },
      {
        id: 'bots-palette',
        area: PALETTE_AREA,
        data: { id: 'helm.bots', label: 'Helm: Bots board', keywords: ['bots', 'board', 'crew', 'robots', 'helm'], run: () => host.navigate(BOTS_ROUTE) }
      },
      {
        id: 'bots-key',
        area: KEYBINDS_AREA,
        data: { id: 'helm.bots', label: 'Open the Bots board', category: 'view', defaults: ['mod+alt+b'], run: () => host.navigate(BOTS_ROUTE) }
      },
      ...THEMES.map(t => ({
        id: `palette-${t.name}`,
        area: PALETTE_AREA,
        data: {
          id: `helm.theme.${t.name}`,
          label: `Helm: use ${t.label}`,
          keywords: ['theme', 'helm', t.label.toLowerCase()],
          run: () => {
            setPrefs({ preferredTheme: t.name })
            requestTheme(t.name)
          }
        }
      }))
    ])

    // Composer: the bot you are talking to
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
    syncComposer()

    // Settings → Appearance card
    ctx.register({ id: 'appearance', area: 'appearance.extra', render: () => jsx(AppearanceCard, { prefs, setPrefs }) })

    // Settings → Plugins → Helm
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
                jsx(ListRow, { title: `helm ${VERSION}`, description: 'Themes, status chips, Bots board. Desktop-only; the agent half registers nothing.' }),
                jsx(ListRow, {
                  title: 'What it will not do',
                  description: 'It cannot restyle the transcript’s message bubbles beyond the theme, reorder the sidebar’s Pinned/Recents sections, or replace the built-in Bots tab. The board sits beside it.'
                }),
                jsx(ListRow, {
                  title: 'Surviving updates',
                  description: 'Lives in desktop-plugins/, which hermes update never touches. The theme CSS targets the app’s data-slot names; a renamed slot drops that one rule, nothing else.'
                })
              ]
            })
        }
      ]
    })

    ctx.onDispose(() => {
      if (unregisterNav) unregisterNav()
      if (unregisterComposer) unregisterComposer()
      spriteRest = null
    })
  }
}
