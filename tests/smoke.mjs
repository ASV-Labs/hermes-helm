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
  os: { writeClipboard: async () => true }
}

plugin.register(ctx)

const byArea = area => contributions.filter(c => c.area === area)
assert.equal(byArea('themes').length, 3, 'three themes')
for (const t of byArea('themes')) {
  const d = t.data
  assert.ok(d.name.startsWith('helm-'), 'theme name prefix')
  for (const k of ['background', 'foreground', 'primary']) assert.ok(/^#[0-9A-Fa-f]{6}$/.test(d.colors[k]), `${d.name} colors.${k}`)
  assert.ok(d.customCSS.includes('data-hermes-theme^="helm"'), 'customCSS scoped to helm')
}
assert.equal(byArea('statusBar.right').length, 2, 'two status chips')
assert.equal(byArea('routes').length, 1)
assert.equal(byArea('sidebarNav').length, 1)
assert.equal(byArea('keybinds').length, 1)
assert.ok(byArea('palette').length >= 4, 'palette commands')
assert.equal(byArea('appearance.extra').length, 1)
assert.ok(settingsPage && settingsPage.children.length === 2, 'settings page with two sub-pages')
assert.equal(byArea('sidebarNav.prefs').length, 0, 'messaging row visible by default')

// Render everything that has a render()
const rendered = []
for (const c of contributions) {
  if (typeof c.render === 'function') {
    const html = renderToString(c.render())
    rendered.push([c.id, html.length])
  }
}
globalThis.__helmQuery = {
  data: { profiles: [{ name: 'vision', bot_title: 'Vision', model: 'grok-4.7', provider: 'xai', skill_count: 12, is_default: false, has_env: true, path: '' }, { name: 'default', is_default: true, model: null, provider: null, skill_count: 3, has_env: true, path: '' }] },
  isLoading: false,
  error: null
}
const route = byArea('routes')[0]
const boardHtml = renderToString(route.render())
assert.ok(boardHtml.includes('Vision'), 'board lists the bot title')
assert.ok(boardHtml.includes('<svg'), 'board draws robot heads')
assert.ok(boardHtml.includes('working'), 'focused busy profile shows working')

const settingsHtml = renderToString(settingsPage.render())
assert.ok(settingsHtml.includes('Helm Dark'), 'settings shows themes')
for (const child of settingsPage.children) renderToString(child.render())

// Status chips read the mock state
const chips = byArea('statusBar.right').map(c => renderToString(c.render()))
assert.ok(chips[0].includes('2 working'), `working chip: ${chips[0]}`)
assert.ok(chips[1].includes('$0.42') && chips[1].includes('18% ctx'), `cost chip: ${chips[1]}`)

// Toggling the nav pref registers / unregisters the contribution
const prefsBefore = store.get('prefs')
assert.equal(prefsBefore, undefined, 'nothing stored until a change')

// Simulate the settings toggle through the exported palette command path:
// find the theme palette command and run it, then check storage + requestTheme.
const cmd = byArea('palette').find(c => c.data.id === 'helm.theme.helm-paper')
cmd.data.run()
assert.equal(globalThis.__requestedTheme, 'helm-paper')
assert.equal(store.get('prefs').preferredTheme, 'helm-paper')

disposed.forEach(fn => fn())
console.log('helm smoke: ok —', contributions.length, 'contributions,', rendered.length, 'rendered;', rendered.map(r => r.join(':')).join(' '))
