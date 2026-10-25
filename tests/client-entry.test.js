import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { PREFERENCES_KEY } from '../src/preferences.js'

function observable(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of listeners) fn() }, size: () => listeners.size }
}
function fixture({ native = true, storageFails = false, permission = 'granted' } = {}) {
  const list = observable({ phase: 'ready', ids: ['s'], byId: { s: { id: 's', displayTitle: 'Current chat', retainedBy: { mainView: 1 }, projectionValues: { macosNotifications: { turn: 0 } } } } })
  const pending = observable(new Map())
  const saved = new Map(), notices = [], effects = [], slots = new Map(), events = new Map()
  let permissionRequests = 0, styleRemoved = false
  class MockNotification {
    static permission = permission
    static async requestPermission() { permissionRequests++; this.permission = 'granted'; return 'granted' }
    constructor(title, options) { this.title = title; this.options = options; notices.push(this) }
    close() { this.closed = true }
  }
  const window = {
    location: { protocol: native ? 'dsh-app:' : 'http:', hostname: native ? 'app' : '127.0.0.1' },
    navigator: { platform: 'MacIntel', language: 'tr-TR' }, dshDesktop: { protocolVersion: 1, deviceInfo() {} },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem(key, value) { if (storageFails) throw new Error('denied'); saved.set(key, value) } },
    addEventListener() {}, removeEventListener() {}, focus() {},
  }
  window.top = window
  const document = { hidden: true, createElement: () => ({ dataset: {}, remove() { styleRemoved = true } }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} }
  let plugin
  window.__ModuleLoader__ = { load(entry) {
    assert.equal(entry.id, 'dsh-macos-notifications')
    plugin = entry.factory(name => {
      if (name === 'react') return { useSyncExternalStore: (_subscribe, get) => get() }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      throw new Error(`Unexpected runtime dependency: ${name}`)
    })
  } }
  vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window, document, Notification: MockNotification, console, setTimeout, clearTimeout,
  })
  const ctx = {
    get: name => name === 'sessions' ? { list } : name === 'uiSession' ? { sessionStatus: pending } : undefined,
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose) },
    locale: { register() { return () => {} }, bind: () => key => key },
    on(name, fn) { events.set(name, fn); return () => events.delete(name) },
    slots: { inject(_name, fn) { return fn() }, register(entry, component) { slots.set(entry.name, { entry, component }); return () => {} } },
  }
  plugin.apply(ctx)
  return { list, pending, saved, notices, slots,
    props: () => slots.get('settings.section').component().props,
    dispose() { for (const off of effects.reverse()) off() },
    styleRemoved: () => styleRemoved, permissionRequests: () => permissionRequests,
  }
}

test('generated client integrates both DSH settings slots, saved content settings and durable attention', () => {
  const f = fixture()
  assert.equal(f.slots.get('plugins.bundle.config').entry.key, 'dsh-macos-notifications')
  assert.equal(f.props().locale, 'tr-TR')
  assert.equal(f.permissionRequests(), 0, 'plugin load must never prompt')
  assert.equal(f.props().onTest().ok, true)
  assert.equal(f.notices.at(-1).title, 'Current chat')
  assert.match(f.notices.at(-1).options.body, /1m 5s/)
  assert.doesNotMatch(f.notices.at(-1).options.body, /local test/)
  const next = f.props().preferences
  assert.equal(f.props().onSave({ ...next, contentMode: 'minimal' }).ok, true)
  assert.equal(JSON.parse(f.saved.get(PREFERENCES_KEY)).contentMode, 'minimal')
  f.props().onTest()
  assert.equal(f.notices.at(-1).title, 'Completed')
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:1' } }]]))
  assert.equal(f.props().records.length, 1)
  const id = f.props().records[0].id
  f.props().onDismiss(id)
  assert.equal(f.props().records.length, 0)
  assert.equal(f.pending.getSnapshot().get('s').pendingInteraction.kind, 'approval', 'acknowledgement must never approve a tool')
  f.dispose()
  assert.equal(f.list.size(), 0); assert.equal(f.pending.size(), 0)
  assert.equal(f.styleRemoved(), true)
})

test('external browsers cannot send DSH-native notifications but can retain the attention list', () => {
  const f = fixture({ native: false })
  assert.equal(f.props().nativeAvailable, false)
  assert.equal(f.props().onTest().ok, false)
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'question', key: 'question:1' } }]]))
  assert.equal(f.notices.length, 0)
  assert.equal(f.props().records.length, 1)
  f.dispose()
})

test('storage denial is visible and does not falsely commit preference changes', () => {
  const f = fixture({ storageFails: true })
  const result = f.props().onSave({ ...f.props().preferences, contentMode: 'minimal' })
  assert.equal(result.ok, false)
  assert.equal(f.props().preferences.contentMode, 'custom')
  assert.match(f.props().saveError, /storage/i)
  f.dispose()
})

test('permission requests occur only through explicit UI action', async () => {
  const f = fixture({ permission: 'default' })
  assert.equal(f.permissionRequests(), 0)
  assert.equal(f.props().permission, 'default')
  assert.equal((await f.props().onRequestPermission()).ok, true)
  assert.equal(f.permissionRequests(), 1)
  assert.equal(f.props().permission, 'granted')
  f.dispose()
})
