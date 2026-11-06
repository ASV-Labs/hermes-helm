// Loads desktop/plugin.js against the SDK mock, registers it with a fake
// ctx, and renders every contributed component to a string. Any thrown
// error fails the run. Run with `npm test` from tests/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { jsx } from 'react/jsx-runtime'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'desktop', 'plugin.js'), 'utf8')
const mockUrl = pathToFileURL(join(here, 'sdk-mock.mjs')).href
const rewritten = src.replace("from '@hermes/plugin-sdk'", `from '${mockUrl}'`)
assert.notEqual(rewritten, src, 'plugin must import @hermes/plugin-sdk')
mkdirSync(join(here, '.tmp'), { recursive: true })
const tmp = join(here, '.tmp', 'plugin.rewritten.mjs')
writeFileSync(tmp, rewritten)

const mod = await import(pathToFileURL(tmp).href)
const plugin = mod.default
assert.equal(plugin.id, 'helm')
assert.equal(typeof plugin.register, 'function')

const store = new Map()
const contributions = []
let settingsPage = null
let disposed = []
const ctx = {
  storage: {
    get: (k, fb) => (store.has(k) ? store.get(k) : fb),
    set: (k, v) => store.set(k, v),
    remove: k => store.delete(k)
  },
  register: c => {
    contributions.push(c)
    return () => {
      const i = contributions.indexOf(c)
      if (i >= 0) contributions.splice(i, 1)
    }
  },
  registerMany: cs => cs.map(c => ctx.register(c)),
  registerSettingsPage: p => {
    settingsPage = p
    return () => {}
  },
  onDispose: fn => disposed.push(fn),
  setInterval: () => () => {},
  os: { writeClipboard: async () => true },
  rest: async path => {
    globalThis.__restCalls = (globalThis.__restCalls || []).concat(path)
    const names = decodeURIComponent(path.split('names=')[1] || '').split(',')
    const sprites = {}
    for (const n of names) sprites[n] = 'data:image/png;base64,iVBORw0KGgo='
    return { sprites }
  }
}

const now = Date.now() / 1000
globalThis.__helmSessions = {
  builder: [{ id: 's1', _lineage_root_id: 'root-1', title: 'Refactor the auth flow', last_active: now - 120, is_active: false, unread: true, actual_cost_usd: 0.31 }],
  vision: [{ id: 's2', title: 'Install helm', last_active: now - 30, is_active: true, unread: false, estimated_cost_usd: 0.05 }]
}
globalThis.__helmQuery = {
  data: { profiles: [{ name: 'vision', bot_title: 'Vision', model: 'grok-4.7', provider: 'xai', skill_count: 12, is_default: false, has_env: true, path: '' }, { name: 'default', is_default: true, model: null, provider: null, skill_count: 3, has_env: true, path: '' }, { name: 'builder', bot_title: 'BUILDER', model: 'claude-opus-5-5', provider: 'anthropic', skill_count: 7, is_default: false, has_env: false, path: '/Users/x/.hermes/profiles/builder' }] },
  isLoading: false,
  error: null
}

plugin.register(ctx)
await new Promise(r => setTimeout(r, 60)) // crew poller's first refresh

const byArea = area => contributions.filter(c => c.area === area)
const themes = byArea('themes')
assert.equal(themes.length, 4, 'three bases + the live custom theme')
for (const t of themes) {
  const d = t.data
  assert.ok(d.name.startsWith('helm-'), 'theme name prefix')
  for (const k of ['background', 'foreground', 'primary']) assert.ok(/^#[0-9A-Fa-f]{6}$/.test(d.colors[k]), `${d.name} colors.${k}`)
  assert.ok(d.customCSS.includes('data-hermes-theme^="helm"'), 'customCSS scoped to helm')
}
assert.equal(byArea('statusBar.right').length, 4, 'needs-you, today, working, cost chips')
assert.equal(byArea('titleBar.center').length, 1, 'titlebar context line')
assert.equal(byArea('sessionRow.leading').length, 1, 'session row robot')
assert.equal(byArea('sessionRow.trailing').length, 1, 'session row cost')
assert.equal(byArea('routes').length, 3, 'desk + bots + look routes')
assert.equal(byArea('sidebarNav').length, 3, 'desk + bots + look nav rows')
assert.equal(byArea('keybinds').length, 3)
assert.ok(byArea('palette').find(c => c.data.id === 'helm.talk.vision'), 'per-bot palette commands follow the crew')
assert.ok(byArea('palette').find(c => c.data.id === 'helm.resume.builder'), 'per-bot resume command')
assert.equal(byArea('appearance.extra').length, 1)
assert.ok(settingsPage && settingsPage.children.length === 2, 'settings page with two sub-pages')
{
  const np = byArea('sidebarNav.prefs')
  assert.equal(np.length, 1, 'one nav-prefs contribution')
  assert.deepEqual(np[0].data.hide, [], 'messaging row visible by default')
  assert.deepEqual(np[0].data.order, ['new-session', 'helm:desk-nav'], 'Desk sits under New session')
}
// The Desk: greeting, status sentence, prompt, continue, needs you, today
{
  const desk = byArea('routes').find(c => c.data.path === '/helm/desk')
  const html = renderToString(desk.render())
  for (const word of ['Good ', 'What should we tackle?', 'Continue', 'Needs you · 1', 'Today', 'Refactor the auth flow', 'Install helm', 'Vision is', 'One thing is waiting on you.', 'Draft', 'Send', 'Scheduled jobs', 'Reply…'])
    assert.ok(html.includes(word), `desk: ${word}`)
  const strip = renderToString(byArea('composer.top')[0].render())
  assert.ok(strip.includes('Continue') && strip.includes('Install helm') && strip.includes('1 needs you'), `desk strip: ${strip.slice(0, 300)}`)
}

const rendered = []
for (const c of contributions) {
  if (typeof c.render === 'function') rendered.push([c.id, renderToString(c.render()).length])
}

// Board: crew view
const route = byArea('routes').find(r => r.data.path === '/helm/bots')
const boardHtml = renderToString(route.render())
assert.ok(boardHtml.includes('Vision'), 'board lists the bot title')
assert.ok(boardHtml.includes('<svg') || boardHtml.includes('<img'), 'board draws robot heads')
assert.ok(boardHtml.includes('working'), 'active profile shows working')
assert.ok(boardHtml.includes('reply waiting'), 'unread session shows reply waiting')
assert.ok(boardHtml.includes('Refactor the auth flow') && boardHtml.includes('Resume'), 'latest session + resume')
assert.ok(boardHtml.includes('$0.31 recent'), 'recent spend')
assert.ok(boardHtml.includes('Needs you') && boardHtml.includes('New bot'), 'filter + new bot')

// Desk-wide layer
const rowBot = byArea('sessionRow.leading')[0].data.render({ sessionId: 'root-1' })
assert.ok(renderToString(rowBot).length > 20, 'row robot renders for a lineage root id')
assert.ok(renderToString(byArea('sessionRow.trailing')[0].data.render({ sessionId: 's1' })).includes('$0.31'), 'row cost')
assert.equal(renderToString(byArea('sessionRow.trailing')[0].data.render({ sessionId: 'nope' })), '', 'unknown rows untouched')
const ctxLine = renderToString(byArea('titleBar.center')[0].render())
assert.ok(ctxLine.includes('vision') && ctxLine.includes('$0.42'), `context line: ${ctxLine.slice(0, 200)}`)
const chips = Object.fromEntries(byArea('statusBar.right').map(c => [c.id, renderToString(c.render())]))
assert.ok(chips['needs-you'].includes('1 needs you'), `needs-you chip: ${chips['needs-you']}`)
assert.ok(chips.today.includes('$0.36 today'), `today chip: ${chips.today}`)
assert.ok(chips.working.includes('2 working'), `working chip: ${chips.working}`)
assert.ok(chips.cost.includes('$0.42') && chips.cost.includes('18% ctx'), `cost chip: ${chips.cost}`)
const composer = contributions.find(c => c.area === 'composer.leading')
assert.ok(renderToString(composer.render()).includes('Talking to vision'), 'composer chip names the focused bot')

// New robots become Hermes avatars: get_asset probe ran for every bot
assert.ok((globalThis.__requests || []).some(([m, n]) => m === 'profiles.get_asset' && n === 'builder'), 'auto avatar probe')

// Settings + Look page
const settingsHtml = renderToString(settingsPage.render())
assert.ok(settingsHtml.includes('Helm Dark'), 'settings shows themes')
for (const child of settingsPage.children) renderToString(child.render())
const lookRoute = byArea('routes').find(r => r.data.path === '/helm/look')
const lookHtml = renderToString(lookRoute.render())
for (const word of ['Customize look', 'Accent', 'Type', 'Corners', 'Reading width', 'Rail', 'Session list', 'Titlebar context', 'Open the Bots board']) assert.ok(lookHtml.includes(word), `look page: ${word}`)

// Customize look rebuilds the live theme and switches to it
const cmd = byArea('palette').find(c => c.data.id === 'helm.theme.helm-paper')
cmd.data.run()
assert.equal(globalThis.__requestedTheme, 'helm-custom')
assert.equal(store.get('prefs').preferredTheme, 'helm-paper')
const custom = byArea('themes').find(t => t.data.name === 'helm-custom')
assert.equal(custom.data.colors.background, '#F7F6F2', 'custom theme follows the chosen base')

disposed.forEach(fn => fn())
console.log('helm smoke: ok —', contributions.length, 'contributions,', rendered.length, 'rendered')
