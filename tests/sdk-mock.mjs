// A stand-in for @hermes/plugin-sdk: enough to load desktop/plugin.js, run
// register(), and render every contributed component with react-dom/server.
import React from 'react'
import { jsx } from 'react/jsx-runtime'

export const THEMES_AREA = 'themes'
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'

const listeners = new Set()
export function atom(initial) {
  let value = initial
  const a = {
    get: () => value,
    set: v => {
      value = v
      listeners.forEach(l => l(a))
    },
    subscribe: l => {
      const fn = () => l(value)
      listeners.add(fn)
      fn()
      return () => listeners.delete(fn)
    }
  }
  return a
}
export const useValue = a => a.get()
export const useQuery = ({ queryKey }) => {
  // synchronous stand-in: resolve from the mock's presets
  if (queryKey && queryKey[1] === 'bot-sessions') {
    const sessions = (globalThis.__helmSessions || {})[queryKey[2]] || []
    return { data: { sessions, total: sessions.length }, isLoading: false, error: null }
  }
  return globalThis.__helmQuery || { data: undefined, isLoading: true, error: null }
}
export const cn = (...xs) => xs.flat().filter(Boolean).join(' ')
export const haptic = () => {}
export const requestTheme = name => {
  globalThis.__requestedTheme = name
}
export const Button = ({ children, ...p }) => jsx('button', { type: 'button', ...stripHandlers(p), children })
export const Codicon = ({ name }) => jsx('i', { className: `codicon codicon-${name}` })
export const ListRow = ({ title, description, action }) => jsx('div', { className: 'list-row', children: [jsx('b', { children: title }, 't'), jsx('p', { children: description }, 'd'), jsx('span', { children: action }, 'a')] })
export const ToggleRow = ({ label, description, checked }) => jsx('label', { children: [label, String(checked), description] })
export const SegmentedControl = ({ options, value }) => jsx('div', { 'data-value': value, children: options.map(o => jsx('span', { children: o.label }, o.id)) })

function stripHandlers(p) {
  const out = {}
  for (const [k, v] of Object.entries(p)) if (typeof v !== 'function') out[k] = v
  return out
}

export const host = {
  state: {
    busyBySession: atom({ a: true, b: false, c: true }),
    focusedUsage: atom({ cost_usd: 0.4213, context_percent: 18.4 }),
    busy: atom(true),
    focusedSessionProfile: atom('vision')
  },
  settings: {
    get: key => ({ sessionListDensity: 'comfortable', chatTextScale: 110 })[key],
    set: (key, value) => {
      globalThis.__settings = { ...(globalThis.__settings || {}), [key]: value }
    },
    subscribe: () => () => {}
  },
  profiles: { list: async () => ({ profiles: [] }) },
  newChat: name => {
    globalThis.__newChat = name
  },
  navigate: path => {
    globalThis.__navigated = path
  },
  notifyError: () => {},
  listPersistedSessions: async () => ({ sessions: [] }),
  openSession: (id, opts) => {
    globalThis.__opened = [id, opts]
  },
  restartGateway: async () => true
}
