// Loads desktop/plugin.js against the SDK mock, registers it with a fake
// ctx, and renders every contributed component to a string. Any thrown
// error fails the run. Run with `npm test` from tests/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { jsx } from 'react/jsx-runtime'
import { createElement } from 'react'
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
const sdk = await import('./sdk-mock.mjs')
const host_set_stored = id => sdk.host.state.focusedStoredSessionId.set(id)
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
  // The app's view/navigation actions (ctx.runAction): record the id, allow
  // the ones the SDK lists, refuse the rest like the real host does.
  runAction: id => {
    globalThis.__actions = (globalThis.__actions || []).concat(id)
    return ['composer.focus', 'conversation.scrollPageUp', 'view.toggleStatusbar', 'view.showFiles', 'nav.cron', 'nav.settings'].includes(id) ? { ok: true } : { ok: false, reason: 'denied', error: id }
  },
  setInterval: () => () => {},
  os: { writeClipboard: async () => true },
  rest: async path => {
    globalThis.__restCalls = (globalThis.__restCalls || []).concat(path)
    const names = decodeURIComponent(path.split('names=')[1] || '').split(',')
    const sprites = {}
    for (const n of names) {
      // HELM_SCREEN renders README screenshots with the real robot layers.
      const f = join(here, '..', 'dashboard', 'sprites', n)
      sprites[n] = process.env.HELM_SCREEN && /^[a-z_]+\.png$/.test(n) && existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : 'data:image/png;base64,iVBORw0KGgo='
    }
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

// Gateway fixtures: one live Vision session waiting on a shell approval, one
// BUILDER session waiting on a question, and a todo plan in the focused chat.
globalThis.__gw = {
  'session.active_list': { sessions: [
    { id: 'rt-vision', session_key: 's2', status: 'waiting', title: 'Install helm', preview: '', message_count: 3, model: 'grok', started_at: 1, last_active: 2, current: true },
    { id: 'rt-builder', session_key: 's1', status: 'waiting', title: 'Refactor the auth flow', preview: '', message_count: 3, model: 'q', started_at: 1, last_active: 2, current: false },
    { id: 'rt-idle', session_key: 'zz', status: 'idle', title: 'x', preview: '', message_count: 1, model: 'q', started_at: 1, last_active: 2, current: false }
  ] },
  'approval.pending': p => (p.session_id === 'rt-vision' ? { approvals: [{ request_id: 'req-1', command: 'gh release create v0.1.6', description: 'publishes a release', choices: ['once', 'session', 'always', 'deny'], tool_name: 'terminal' }] } : { approvals: [] }),
  'approval.respond': p => ({ resolved: 1, echo: p }),
  // Public cron RPC: per-profile stores answer with `scoped`; the launch store repeats one id.
  'cron.manage': p => {
    const soon = new Date(Math.min(Date.now() + 60000, new Date().setHours(23, 59, 0, 0))).toISOString()
    const ran = new Date(new Date().setHours(0, 1, 0, 0)).toISOString()
    if (p.profile === 'builder') return { scoped: 'builder', jobs: [{ job_id: 'j-b', name: 'Nightly build check', schedule: 'every day 00:01', last_run_at: ran, last_status: 'error', last_error: 'Gateway timeout after 30 s while fetching build status from the CI runner. '.repeat(6), enabled: true }] }
    if (p.profile) return { scoped: p.profile, jobs: [] }
    return { jobs: [{ job_id: 'j-b', name: 'dup', last_run_at: ran }, { job_id: 'j-r', name: 'Morning digest', schedule: 'every hour', next_run_at: soon, enabled: true }] }
  },
  'session.history': { count: 3, messages: [
    { role: 'tool', name: 'todo_list', content: JSON.stringify({ todos: [{ id: 'a', content: 'Old plan', status: 'pending' }] }) },
    { role: 'assistant', text: 'ok' },
    { role: 'tool', name: 'todo_list', content: JSON.stringify({ todos: [
      { id: '1', content: 'Verify merged head CI is green', status: 'completed' },
      { id: '2', content: 'Package the artifact', status: 'in_progress' },
      { id: '3', content: 'Write the swap script', status: 'pending' },
      { id: '3a', content: 'Loopback health check', status: 'pending', parent: '3' },
      { id: '4', content: 'Old idea', status: 'cancelled' }
    ] }) }
  ] }
}

plugin.register(ctx)
await new Promise(r => setTimeout(r, 60)) // crew poller's first refresh
await new Promise(r => setTimeout(r, 1200)) // inbox poller's first pass (starts at 800 ms)

const byArea = area => contributions.filter(c => c.area === area)
const themes = byArea('themes')
assert.equal(themes.length, 5, 'four bases + the live custom theme')
for (const t of themes) {
  const d = t.data
  assert.ok(d.name.startsWith('helm-'), 'theme name prefix')
  for (const k of ['background', 'foreground', 'primary']) assert.ok(/^#[0-9A-Fa-f]{6}$/.test(d.colors[k]), `${d.name} colors.${k}`)
  assert.ok(d.customCSS.includes('data-hermes-theme^="helm"'), 'customCSS scoped to helm')
}
assert.equal(byArea('statusBar.right').length, 0, '2.0: helm adds nothing to the status bar (the bar is the user’s)')
assert.deepEqual(byArea('statusBar.left').map(c => c.id), ['statusbar-probe'], 'only the zero-width probe')
assert.deepEqual(byArea('titleBar.right').map(c => c.id).sort(), ['bot-editor', 'title-chip'], 'one title-bar chip + the bot editor mount')
assert.equal(byArea('titleBar.center').length, 1, 'titlebar context line')
assert.equal(byArea('sessionRow.leading').length, 1, 'session row robot')
assert.equal(byArea('sessionRow.trailing').length, 1, 'session row cost')
assert.equal(byArea('routes').length, 5, 'desk + bots + look + apps + routines routes')
assert.equal(byArea('sidebarNav').length, 3, 'desk + bots + look nav rows')
assert.equal(byArea('keybinds').length, 7, 'desk, bots, look, side chat, 3 layouts')
assert.ok(byArea('palette').find(c => c.data.id === 'helm.talk.vision'), 'per-bot palette commands follow the crew')
assert.ok(byArea('palette').find(c => c.data.id === 'helm.resume.builder'), 'per-bot resume command')
assert.equal(byArea('appearance.extra').length, 1)
assert.ok(settingsPage && settingsPage.children.length === 2, 'settings page with two sub-pages')
{
  const np = byArea('sidebarNav.prefs')
  assert.equal(np.length, 1, 'one nav-prefs contribution')
  assert.deepEqual(np[0].data.hide, ['messaging', 'artifacts', 'cron', 'helm:bots-nav', 'helm:look-nav', 'helm:desk-nav'], 'design nav by default: New session, Capabilities, plugin rows')
  assert.deepEqual(np[0].data.order, ['new-session', 'helm:desk-nav'], 'Desk sits under New session')
}
// The Desk: greeting, status sentence, prompt, continue, needs you, today
{
  // HELM_SCREEN=1 also writes each surface's HTML for the README screenshots (tools/screens/).
  const dump = (name, html) => { if (process.env.HELM_SCREEN) writeFileSync(join(here, '.tmp', name + '.html'), html) }
  const desk = byArea('routes').find(c => c.data.path === '/helm/desk')
  const html = renderToString(desk.render())
  for (const word of ['Good ', 'Needs you', 'What should we tackle?', 'Continue', 'Today', 'Refactor the auth flow', 'Install helm', 'Vision is', '2 things are waiting on you.', 'Draft', 'Send', 'Scheduled jobs', 'Answer'])
    assert.ok(html.includes(word), `desk: ${word}`)
  const pane = renderToString(contributions.find(c => c.area === 'panes' && c.id === 'session-pane').render())
  for (const word of ['Session', 'Model', 'Folder', 'Cost', 'Scheduled jobs', 'Open']) assert.ok(pane.includes(word), `task pane: ${word}`)
  mod._internals.$helmTabVisible.set(true)
  const botPane = renderToString(contributions.find(c => c.area === 'panes' && c.id === 'session-pane').render())
  mod._internals.$helmTabVisible.set(false)
  for (const word of ['Upcoming routines', 'Permissions', 'Computer', 'Exchanges', 'Voice', 'Edit profile', 'Duplicate', 'Share', 'ACTIVITY', 'DISPATCH', 'LIBRARY']) assert.ok(botPane.includes(word), `bot pane: ${word}`)
  assert.ok(contributions.find(c => c.area === 'composer.middleware'), 'route-automatically middleware')
  // Task plan: the latest todo_list wins; nested and cancelled items survive
  const { latestPlan, refreshPlan, $plan } = mod._internals
  const plan = latestPlan(globalThis.__gw['session.history'].messages)
  assert.deepEqual(plan.map(t => t.status), ['completed', 'in_progress', 'pending', 'pending', 'cancelled'])
  assert.equal(plan[3].parent, '3')
  host_set_stored('s2')
  await refreshPlan('s2')
  assert.equal($plan.get().items.length, 5, 'plan read through session.history for the focused chat')
  const pane2 = renderToString(contributions.find(c => c.area === 'panes' && c.id === 'session-pane').render())
  assert.ok(pane2.includes('Plan · 1 of 4') && pane2.includes('Package the artifact') && pane2.includes('#343D47'), `plan pane: ${pane2.slice(0, 300)}`)
  host_set_stored(null)

  // Today: scheduled jobs come from the gateway's cron.manage, per bot, deduped
  {
    await mod._internals.refreshToday()
    const today = mod._internals.$today.get()
    assert.ok(today.available, 'cron.manage reached')
    assert.deepEqual(today.jobs.map(j => [j.id, j.profile, j.last_status]).sort(), [['j-b', 'builder', 'error'], ['j-r', 'vision', null]], JSON.stringify(today.jobs))
    assert.equal(today.jobs.find(j => j.id === 'j-b').last_error.length, 300)
    const deskT = renderToString(byArea('routes').find(c => c.data.path === '/helm/desk').render())
    assert.ok(deskT.includes('Nightly build check') && deskT.includes('failed') && deskT.includes('Morning digest'), `today list: ${deskT.slice(0, 200)}`)
    // Folding: a folded section hides its rows, keeps its title and shows the count
    {
      const { DeskSection, TodayList, foldedIds } = mod._internals
      let saved = null
      const fold = { prefs: { deskFolded: 'today, continue' }, setPrefs: patch => { saved = patch } }
      assert.deepEqual([...foldedIds(fold.prefs)].sort(), ['continue', 'today'])
      const folded = renderToString(createElement(DeskSection, { id: 'today', fold, count: '7 · 1 failed', title: 'Today', children: createElement('p', null, 'ROWS') }))
      assert.ok(folded.includes('Today') && folded.includes('7 · 1 failed') && !folded.includes('ROWS') && folded.includes('aria-expanded="false"'), folded)
      const open = renderToString(createElement(DeskSection, { id: 'needs', fold, count: '2', title: 'Needs you', children: createElement('p', null, 'ROWS') }))
      assert.ok(open.includes('ROWS') && open.includes('aria-expanded="true"'), open)
      // A long day shows five rows and a "Show all" link
      const ran = new Date(new Date().setHours(0, 2, 0, 0)).toISOString()
      const keep = mod._internals.$today.get()
      mod._internals.$today.set({ ready: true, available: true, at: Date.now(), jobs: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, name: `daily-${i}`, last_run_at: ran, last_status: i === 6 ? 'error' : 'ok', enabled: true, profile: 'builder' })) })
      const short = renderToString(createElement(TodayList))
      assert.ok(short.includes('Show all 8') && short.includes('daily-6'), 'short Today keeps the failure and offers Show all')
      assert.equal((short.match(/daily-\d/g) || []).length, 5, short)
      mod._internals.$today.set(keep)
    }
    host_set_stored('s2')
    dump('session-pane', renderToString(contributions.find(c => c.area === 'panes' && c.id === 'session-pane').render()))
    host_set_stored(null)
  }

  // Inbox: the approval and the question surface on the Desk, with buttons
  const desk2 = renderToString(byArea('routes').find(c => c.data.path === '/helm/desk').render())
  for (const word of ['Shell command', 'gh release create v0.1.6', 'Approve', 'Deny', 'Allow session', 'is waiting for your answer']) assert.ok(desk2.includes(word), `desk inbox: ${word}`)
  dump('desk', desk2)
  const helmTab = contributions.find(c => c.area === 'panes' && c.id === 'helm-tab')
  assert.ok(helmTab, 'Helm tab registers in the sessions column')
  assert.equal(helmTab.data.dock.pane, 'sessions', 'Helm tab docks into the sessions zone')
  assert.equal(helmTab.data.dock.pos, 'center', 'Helm tab is a tab, not a split (a split breaks the sidebar toggle)')
  assert.ok(!contributions.find(c => c.id === 'needs-you-pane'), 'no split-above-Sessions pane any more')
  const tabHtml = renderToString(helmTab.render())
  for (const word of ['data-helm-sidebar', 'Search bots and chats', 'Crew', 'Projects', 'All chats', 'data-helm-hero', 'New chat', 'Needs you', 'gh release create', 'Approve', 'Waiting on you', 'Apps', 'All apps', 'Routines', 'SIEMless', 'Lineage', 'Kanban', 'Bot Mode', 'New bot', 'Customize', 'Settings']) assert.ok(tabHtml.includes(word), `helm sidebar: ${word}`)
  assert.ok(!/text-transform:\s*uppercase/.test(tabHtml), 'sidebar is sentence case')
  dump('helm-tab', tabHtml)
  const home = renderToString(contributions.find(c => c.id === 'home').render())
  for (const word of ['data-helm-home', 'Continue', 'Install helm', 'Needs you', 'Today', 'Open inbox', 'Status report', 'Hermes docs']) assert.ok(home.includes(word), `new-session home: ${word} in ${home.slice(0, 200)}`)
  dump('home', home)
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
assert.ok(boardHtml.includes('Working'), 'active profile shows Working')
assert.ok(boardHtml.includes('Replied') || boardHtml.includes('Blocked'), `attention row: ${boardHtml.slice(0, 200)}`)
if (process.env.HELM_SCREEN) writeFileSync(join(here, '.tmp', 'bots.html'), boardHtml)
assert.ok(boardHtml.includes('Refactor the auth flow'), 'latest session in Now')
assert.ok(boardHtml.includes('Needs you') && boardHtml.includes('DISPATCH') && boardHtml.includes('Send'), 'chips, dispatch panel, brief')
assert.ok(boardHtml.includes('Next routine') && boardHtml.includes('today across the crew'), 'table header + spend')


// Router, rooms, permissions, handoffs, latest reply
{
  const I = mod._internals
  assert.equal(I.readBrief('Review PR #42 on hermes-lineage for regressions').tier, 'fast', 'review reads as fast')
  assert.equal(I.readBrief('Deploy the swap script to foundrykit').tier, 'frontier', 'deploy reads as frontier')
  assert.equal(I.readBrief('Pull current pricing for three VPS hosts').tier, 'balanced', 'pricing reads as balanced')
  assert.equal(I.readBrief('Draft a reply to the X thread').tier, 'nano', 'draft reads as nano')
  assert.equal(I.tierOfModel('claude-opus-5-5'), 'frontier')
  assert.equal(I.tierOfModel('claude-haiku-5-5'), 'nano')
  const rows = [
    { p: { name: 'vision', model: 'grok-4.7' }, rank: 1 },
    { p: { name: 'builder', model: 'claude-opus-5-5' }, rank: 3 },
    { p: { name: 'theo', model: 'claude-haiku-5-5' }, rank: 3 }
  ]
  const r1 = I.routeBrief('Deploy the release', rows, {})
  assert.equal(r1.tier, 'frontier'); assert.equal(r1.bot, 'builder', `free frontier bot wins: ${r1.why}`)
  const r2 = I.routeBrief('Review the diff', rows, { fast: ['theo'] })
  assert.equal(r2.bot, 'theo', 'edited rules route fast to theo')
  assert.ok(r2.why.includes('read-only review'), r2.why)
  const room = { room_id: 'r1', name: 'Release crew', members: [{ member_id: 'm1', profile: 'builder', handle: 'builder' }, { member_id: 'm2', profile: 'vision', handle: 'vision' }] }
  assert.equal(I.roomSummary(room, { driver_status: { pending_actions: [{ kind: 'approval', member_id: 'm1' }] } }, []).text, 'builder is waiting on you')
  assert.ok(I.roomSummary(room, { driver_status: { member_activity: [{ member_id: 'm2', status: 'running' }] } }, []).text.includes('vision working'))
  assert.equal(I.roomSummary(room, {}, [{ kind: 'turn.settled', payload: { member_id: 'm1', passed: true } }, { kind: 'turn.settled', payload: { member_id: 'm2' } }]).text, 'vision replied · builder passed')
  assert.equal(I.permsLine({ mode: 'manual', servers: ['github', 'notion'] }), 'github · notion · asks first')
  assert.equal(I.permsLine({ mode: 'off', servers: [] }), 'built-in tools · no approvals')
  I.onHandoffEvent({ type: 'tool.start', session_id: 's1', payload: { name: 'message_agent', tool_id: 't1', args: { target: 'theo', message: 'Review the release notes' } } })
  I.onHandoffEvent({ type: 'tool.complete', session_id: 's1', payload: { name: 'message_agent', tool_id: 't1', result: 'Delivered; theo will reply on its next run' } })
  const h = I.$handoffs.get()[0]
  assert.equal(h.to, 'theo'); assert.equal(h.status, 'delivered', JSON.stringify(h))
  I.onReplyEvent({ type: 'message.complete', session_id: 's1', payload: { text: 'Packaged with a rollback copy.' } })
  assert.ok(Object.values(I.$lastReply.get()).some(v => v.text.includes('rollback')), 'latest reply captured')
}

// Desk-wide layer
const rowBot = byArea('sessionRow.leading')[0].data.render({ sessionId: 'root-1' })
assert.equal(renderToString(rowBot), '', 'no robot heads in session rows by default (the design has none)')
const rowStatus = renderToString(byArea('sessionRow.trailing')[0].data.render({ sessionId: 's1' }))
assert.ok(rowStatus.includes('data-helm-row-status') && rowStatus.includes('Question'), `row status line: ${rowStatus}`)
assert.ok(renderToString(byArea('sessionRow.trailing')[0].data.render({ sessionId: 'nope' })).includes('Idle'), 'rows older than the read say Idle')
const ctxLine = renderToString(byArea('titleBar.center')[0].render())
assert.equal(ctxLine, '', 'no context line by default (the boards have none)')
{
  const chip = renderToString(byArea('titleBar.right').find(c => c.id === 'title-chip').render())
  assert.ok(chip.includes('data-helm-title-chip') && chip.includes('working') && chip.includes('aria-haspopup="menu"'), `title chip: ${chip}`)
}
assert.ok(!contributions.find(c => c.area === 'composer.leading'), 'no composer robot by default (the boards have none)')
const ask = contributions.find(c => c.id === 'ask-pill')
assert.ok(ask && contributions.find(c => c.id === 'composer-hint'), 'approval pill and hint in the composer')

// New robots become Hermes avatars: get_asset probe ran for every bot
assert.ok((globalThis.__requests || []).some(([m, n]) => m === 'profiles.get_asset' && n === 'builder'), 'auto avatar probe')

// Animated robots: the key matches the backend's look_key, statuses map to sheet
// rows, and a robot shows its row (or the still robot until its sheet arrives).
{
  const { AnimatedRobot, petKey, petStateFor, petSheets, PET_ROW } = mod._internals
  const look = { topper: 'antenna', face: 'idle', chest: 'planet', tool: 'wrench', back: 'jetpack', color: 'blue' }
  assert.equal(petKey(look), 'blue-antenna-idle-planet-wrench-jetpack', 'pet key matches pet_sheet.look_key')
  assert.equal(petStateFor('working'), 'running')
  assert.equal(petStateFor('needs-you'), 'waiting')
  assert.equal(petStateFor('new'), 'idle')
  assert.deepEqual([PET_ROW.idle.index, PET_ROW.waiting.index, PET_ROW.review.index], [0, 6, 8])
  const still = renderToString(createElement(AnimatedRobot, { look, state: 'waiting', size: 60 }))
  assert.ok(!still.includes('background-image'), 'no sheet yet: the still robot')
  petSheets.set(petKey(look), 'data:image/webp;base64,AAAA')
  const moving = renderToString(createElement(AnimatedRobot, { look, state: 'waiting', size: 96, title: 'bot' }))
  assert.ok(moving.includes('background-image'), 'sheet shown')
  assert.ok(moving.includes('-624px'), 'waiting row (6 × 104 px)')
  const head = renderToString(createElement(AnimatedRobot, { look, state: 'idle', size: 44.7, head: true }))
  assert.ok(head.includes('rounded-full'), 'head crop')
  petSheets.clear()
}

// Avatar self-heal: helm's 256 px robot is kept, a photo is never touched,
// and Bot Mode's 160 px face backfill is not mistaken for a photo.
{
  const { autoAvatars, pngEdge, AVATAR_EDGE } = mod._internals
  const png = edge => {
    const b = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b)
    b.writeUInt32BE(edge, 16)
    b.writeUInt32BE(edge, 20)
    return 'data:image/png;base64,' + b.toString('base64')
  }
  assert.equal(pngEdge(png(160)), 160, 'png edge reader')
  globalThis.__assets = { ours: png(AVATAR_EDGE), photo: png(96), face: png(160) }
  let map = {}
  const avatars = { get: () => map, set: v => { map = v } }
  const looks = { get: () => ({}) }
  const prefs = { get: () => ({ autoAvatars: true }) }
  await autoAvatars([{ name: 'ours' }, { name: 'photo' }, { name: 'face' }], looks, avatars, prefs)
  assert.equal(map.ours, 'helm', 'own robot recognised')
  assert.equal(map.photo, 'user', 'photo left alone')
  assert.notEqual(map.face, 'user', 'face backfill is not a photo')
  globalThis.__assets = {}
}

// Settings + Look page
const settingsHtml = renderToString(settingsPage.render())
assert.ok(settingsHtml.includes('Helm Dark'), 'settings shows themes')
for (const child of settingsPage.children) renderToString(child.render())
const lookRoute = byArea('routes').find(r => r.data.path === '/helm/look')
const lookHtml = renderToString(lookRoute.render())
for (const word of ['Appearance', 'Theme', 'Accent', 'Density and type', 'Code font', 'Surfaces', 'Chat text scale', 'Rail and sidebar', 'Rail order', 'Layout presets', 'Capture current layout as a preset', 'Keyboard shortcuts', 'Status and cost under each session', 'Export helm.json', 'Reset to Hermes defaults', 'Helm · Ember']) assert.ok(lookHtml.includes(word), `look page: ${word}`)
if (process.env.HELM_SCREEN) writeFileSync(join(here, '.tmp', 'look.html'), lookHtml)

// Customize look rebuilds the live theme and switches to it
const cmd = byArea('palette').find(c => c.data.id === 'helm.theme.helm-paper')
cmd.data.run()
assert.equal(globalThis.__requestedTheme, 'helm-custom')
assert.equal(store.get('prefs').preferredTheme, 'helm-paper')
const custom = byArea('themes').find(t => t.data.name === 'helm-custom')
assert.equal(custom.data.colors.background, '#F7F6F2', 'custom theme follows the chosen base')

{
  // Approve answers through approval.respond with the request id, then hides the row
  const { answerApproval, $inbox } = mod._internals
  const item = $inbox.get().approvals[0]
  await answerApproval(item, 'once')
  const sent = globalThis.__rpc.filter(([m]) => m === 'approval.respond').pop()[1]
  assert.deepEqual(sent, { session_id: 'rt-vision', request_id: 'req-1', choice: 'once', all: false })
  assert.equal($inbox.get().approvals.length, 0, 'answered approval leaves the inbox immediately')
}
{
  // Shared-gateway path: prompts and plans arrive as events
  const { onPromptEvent, onPromptGone, onToolEvent, answerQuestion, answerApproval, $inbox, $liveTodos } = mod._internals
  assert.ok((globalThis.__eventSubs || []).some(([t]) => t === 'approval.request'), 'listens for approval.request')
  onPromptEvent({ type: 'approval.request', session_id: 's1', profile: 'builder', payload: { prompt_id: 'p-9', command: 'rm -rf build', description: 'deletes the build folder', choices: ['once', 'deny'] } })
  const ev = $inbox.get().approvals.find(a => a.requestId === 'p-9')
  assert.ok(ev && ev.profile === 'builder' && ev.title === 'Refactor the auth flow', 'event approval mapped to its bot and chat')
  onPromptEvent({ type: 'clarify.request', session_id: 's2', payload: { prompt_id: 'c-1', question: 'Which host?', choices: ['foundrykit-vps', 'kinetik'] } })
  const deskQ = renderToString(byArea('routes').find(c => c.data.path === '/helm/desk').render())
  for (const w of ['rm -rf build', 'Which host?', 'foundrykit-vps', 'Answer…']) assert.ok(deskQ.includes(w), `desk event prompt: ${w}`)
  await answerApproval(ev, 'deny')
  assert.deepEqual(globalThis.__rpc.filter(([m]) => m === 'approval.respond').pop()[1], { session_id: 's1', request_id: 'p-9', choice: 'deny', all: false, profile: 'builder' })
  const q = $inbox.get().questions.find(x => x.requestId === 'c-1')
  await answerQuestion(q, 'kinetik')
  assert.deepEqual(globalThis.__rpc.filter(([m]) => m === 'clarify.respond').pop()[1], { session_id: 's2', request_id: 'c-1', answer: 'kinetik' })
  onPromptEvent({ type: 'approval.request', session_id: 's1', payload: { prompt_id: 'p-10', command: 'ls' } })
  onPromptGone({ type: 'approval.settled', payload: { prompt_id: 'p-10' } })
  assert.ok(!$inbox.get().approvals.some(a => a.requestId === 'p-10'), 'settled approvals leave')
  // Plans from tool events: full list, then a merge patch
  onToolEvent({ type: 'tool.complete', session_id: 'rt-x', payload: { name: 'todo_list', todos: [{ id: '1', content: 'A', status: 'in_progress' }, { id: '2', content: 'B', status: 'pending' }] } })
  onToolEvent({ type: 'tool.start', session_id: 'rt-x', payload: { name: 'todo_list', args: { merge: true, todos: [{ id: '1', content: 'A', status: 'completed' }] } } })
  assert.deepEqual($liveTodos.get()['rt-x'].map(t => t.status), ['completed', 'pending'])
}
disposed.forEach(fn => fn())
// Catalog rule 8: the desktop half never selects the app's own markup from
// script. The sidebar filter pills are a sidebar.profileGroup.header render
// (not an element parked under the sidebar search), the rail measures the
// status bar from helm's own probe item, and the composer is reached through
// host.composer / the app's actions.
{
  const { SidebarPills, $rowFilter, runAppAction, focusComposer } = mod._internals
  const pills = renderToString(createElement(SidebarPills))
  assert.ok(pills.includes('data-helm-sidebar-pills') && pills.includes('Needs you · 1') && pills.includes('aria-pressed="true"'), `sidebar pills: ${pills}`)
  $rowFilter.set('working')
  assert.ok(renderToString(createElement(SidebarPills)).includes('data-k="working" aria-pressed="true"'), 'pressed pill follows the filter')
  $rowFilter.set('all')
  const probe = contributions.find(c => c.area === 'statusBar.left' && c.id === 'statusbar-probe')
  assert.ok(probe && renderToString(probe.render()).includes('data-helm-statusbar-probe'), 'status-bar probe item registered')
  assert.equal(runAppAction('conversation.scrollPageUp'), true, 'allowed app action runs')
  assert.equal(runAppAction('session.archive'), false, 'refused app action degrades to false')
  focusComposer()
  assert.ok((globalThis.__actions || []).includes('composer.focus'), 'focusComposer falls back to the composer.focus app action when host.composer.focus is absent')
  const src = readFileSync(join(here, '..', 'desktop', 'plugin.js'), 'utf8').replace(/\/\/[^\n]*/g, '')
  assert.ok(!/document\.querySelector(All)?\(\s*['"`][^'"`]*\[data-(slot|tour|sidebar|testid)\b/.test(src), 'no document.querySelector on the app\'s data-slot markup (catalog lint: app DOM reach)')
}

// ── 2.0 shell
{
  const I = mod._internals
  // All apps: Hermes pages, plugin pages, tools; SIEMless hides only when turned off
  const appsHtml = renderToString(byArea('routes').find(c => c.data.path === '/helm/apps').render())
  for (const w of ['All apps', 'Capabilities', 'Messaging', 'Scheduled jobs', 'Command center', 'SIEMless', 'Lineage', 'Kanban', 'Files', 'Review', 'Status bar', 'Pin a page', 'Unpin']) assert.ok(appsHtml.includes(w), `apps page: ${w}`)
  assert.equal(I.pluginAppVisible({ plugin: 'siemless' }, { siemless: false }), false, 'a plugin turned off leaves Apps')
  assert.equal(I.pluginAppVisible({ plugin: 'siemless' }, {}), true, 'no decision = listed')
  assert.deepEqual(I.pinnedApps({ appsPinned: ['routines', 'siemless', 'nope'] }, { siemless: false }).map(a => a.id), ['routines'])
  assert.ok(I.allApps({ appsCustom: [{ label: 'Broker', route: '/broker' }, { label: 'bad', route: 'x' }] }, {}).some(a => a.id === 'custom:/broker'), 'pinned custom page')
  assert.ok(!I.allApps({ appsCustom: [{ label: 'bad', route: 'x' }] }, {}).some(a => a.label === 'bad'), 'a route must start with /')
  // SIEMless findings badge the Apps row through its documented event
  const sub = (globalThis.__eventSubs || []).find(([t]) => t === 'plugin.siemless.finding')
  assert.ok(sub, 'listens for plugin.siemless.finding')
  sub[1]({ severity: 'high' })
  sub[1]({ severity: 'low' })
  assert.equal(I.$appBadges.get().siemless, 2)
  const side = renderToString(contributions.find(c => c.area === 'panes' && c.id === 'helm-tab').render())
  if (process.env.HELM_SCREEN) { writeFileSync(join(here, '.tmp', 'sidebar.html'), side); writeFileSync(join(here, '.tmp', 'apps.html'), appsHtml) }
  assert.ok(/SIEMless[\s\S]{0,600}>2</.test(side), 'badge on the SIEMless row')
  // Routines by desk
  assert.deepEqual(['ads-weekly', 'cos-brief', 'csat_digest', 'gtm launch', 'sales-pipe', 'x-watcher', 'Morning digest'].map(n => I.deskOf({ name: n })), ['ads', 'cos', 'csat', 'gtm', 'sales', 'watchers', 'other'])
  const keep = I.$statusbarShown.get()
  mod._internals.$statusbarShown.set(true)
  const routinesHtml = renderToString(byArea('routes').find(c => c.data.path === '/helm/routines').render())
  if (process.env.HELM_SCREEN) writeFileSync(join(here, '.tmp', 'routines.html'), routinesHtml)
  for (const w of ['Routines', 'Edit in Scheduled jobs', 'Pause', 'Open', 'Everything else', 'By bot']) assert.ok(routinesHtml.includes(w), `routines: ${w}`)
  // Today is one line on the home
  const line = renderToString(createElement(I.TodayLine))
  assert.ok(line.includes('data-helm-today-line') && line.includes('Routines'), line)
  // Whole shell: theme, status bar and the helm pane on your click; Back to stock restores
  globalThis.__requestedTheme = null
  globalThis.__actions = []
  I.enterWholeShell()
  assert.equal(store.get('prefs').fullShell, true)
  assert.ok(globalThis.__actions.includes('view.toggleStatusbar'), 'rests the status bar')
  assert.ok(String(globalThis.__requestedTheme || '').startsWith('helm'), 'applies a helm theme')
  assert.equal(store.get('prefs').stockSnapshot.statusbar, true, 'remembers the bar was up')
  I.$statusbarShown.set(false)
  globalThis.__actions = []
  I.backToStock()
  assert.equal(store.get('prefs').fullShell, false)
  assert.ok(globalThis.__actions.includes('view.toggleStatusbar'), 'brings the status bar back')
  assert.equal(store.get('prefs').stockSnapshot, null)
  I.$statusbarShown.set(keep)
  // Projects through the gateway's own projects RPCs
  globalThis.__gw['projects.tree'] = { projects: [{ id: 'p1', label: 'Vision', color: '#5FB8D8', archived: false, isAuto: true }, { id: 'home', label: 'x', isNoProject: true }, { id: 'p2', label: 'Old', archived: true }], active_id: 'p1' }
  globalThis.__gw['projects.project_sessions'] = { project: { id: 'p1', repos: [{ groups: [{ sessions: [{ id: 'a', title: 'Older', last_active: 1 }, { id: 'b', title: 'Newer', last_active: 9 }] }] }] } }
  await I.refreshProjects('vision')
  assert.deepEqual(I.$projects.get().list.map(x => x.name), ['Home', 'Vision'], 'Home first, archived projects hidden')
  assert.deepEqual((await I.projectSessions('p1', 'vision')).map(x => x.title), ['Newer', 'Older'])
  // Nothing written to app settings at register
  assert.ok(!globalThis.__settings || !('tabStripDefault' in globalThis.__settings), 'never sets tabStripDefault')
}

console.log('helm smoke: ok —', contributions.length, 'contributions,', rendered.length, 'rendered')
