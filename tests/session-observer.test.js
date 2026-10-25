import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionObserver, selectedSessionId } from '../src/session-observer.js'
import { defaultPreferences } from '../src/preferences.js'
import { isMacDesktop } from '../src/environment.js'

function observable(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const listener of listeners) listener() }, size: () => listeners.size }
}
function fixture(initial = state(2)) {
  const list = observable(initial)
  const pending = observable(new Map())
  const calls = [], resolved = []
  const manager = { notify: (...args) => calls.push(args), resolve: id => resolved.push(id), records: () => [] }
  const document = { hidden: true }
  const observer = createSessionObserver({ sessions: { list }, uiSession: { sessionStatus: pending }, manager, getPreferences: defaultPreferences, document })
  return { list, pending, calls, resolved, document, observer }
}
function state(turn, fields = {}) {
  return { phase: 'ready', ids: ['s'], byId: { s: { id: 's', displayTitle: 'Chat title', retainedBy: { mainView: 1 },
    projectionValues: { macosNotifications: { turn, kind: 'completed', preview: 'Done', durationMs: 65000 } }, ...fields } } }
}

test('completion history seeds, new turns notify once and duration/title come from correct session', () => {
  const f = fixture()
  assert.equal(f.calls.length, 0)
  f.list.set(state(3))
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0][0], { sessionId: 's', chatTitle: 'Chat title', kind: 'completed', preview: 'Done', durationMs: 65000, turn: 3 })
  f.list.set(state(3)); assert.equal(f.calls.length, 1)
  f.list.set(state(3, { projectionValues: {} }))
  f.list.set(state(4)); assert.equal(f.calls.length, 2)
  f.observer.reset(); f.list.set(state(10)); assert.equal(f.calls.length, 2)
  f.observer.dispose(); f.list.set(state(11)); assert.equal(f.calls.length, 2)
  assert.equal(f.list.size(), 0); assert.equal(f.pending.size(), 0)
})

test('foreground gate suppresses native only, pending requests remain eligible for attention queue', () => {
  const f = fixture()
  f.document.hidden = false
  f.list.set(state(3))
  assert.equal(f.calls[0][2].deliverNative, false)
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:1' } }]]))
  assert.equal(f.calls[1][0].kind, 'approval')
  assert.equal(f.calls[1][2].deliverNative, false)
  const count = f.calls.length
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:1' } }]]))
  assert.equal(f.calls.length, count)
  f.pending.set(new Map())
  assert.equal(f.resolved.at(-1), 's')
  f.observer.dispose()
})

test('existing pending request seeds attention without a stale native alert', () => {
  const f = fixture(state(2, { pendingInteraction: 'question' }))
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][0].kind, 'question')
  assert.equal(f.calls[0][2].deliverNative, false)
  f.observer.dispose()
})

test('incomplete list is not reconciled, removed sessions resolve and subagents never notify', () => {
  const f = fixture({ phase: 'loading', ids: [], byId: {} })
  assert.equal(f.resolved.length, 0)
  f.list.set(state(1))
  f.list.set(state(2, { origin: 'subagent' })); assert.equal(f.calls.length, 0)
  f.list.set({ phase: 'ready', ids: [], byId: {} })
  assert.equal(f.resolved.at(-1), 's')
  f.observer.dispose()
})

test('real rc3 status keys distinguish consecutive same-kind requests', () => {
  const f = fixture(state(2, { running: false }))
  f.list.set(state(2, { running: true }))
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:1' } }]]))
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][2].deliverNative, true)
  f.pending.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:2' } }]]))
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1][2].deliverNative, true)
  assert.equal(f.resolved.at(-1), 's')
  f.observer.dispose()
})

test('late pending hydration preserves saved attention and does not replay a historical native alert', () => {
  const list = observable(state(2))
  const status = observable(new Map())
  const saved = [{ id: 'saved', sessionId: 's', kind: 'approval' }]
  const calls = [], resolved = []
  const manager = { records: () => saved, notify: (...args) => calls.push(args), resolve: id => resolved.push(id) }
  const observer = createSessionObserver({ sessions: { list }, uiSession: { sessionStatus: status }, manager, getPreferences: defaultPreferences, document: { hidden: true } })
  assert.equal(resolved.length, 0, 'a ready list is not proof that pending status has hydrated')
  status.set(new Map([['s', { pendingInteraction: { kind: 'approval', key: 'approval:1' } }]]))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][2].deliverNative, false)
  assert.equal(resolved.length, 0)
  status.set(new Map([['s', { pendingInteraction: undefined }]]))
  assert.equal(resolved.at(-1), 's', 'known pending-to-none is a resolution signal')
  observer.dispose()
})

test('native environment distinguishes signed DSH renderer route from external browsers', () => {
  const env = { location: { protocol: 'dsh-app:', hostname: 'app' }, navigator: { platform: 'MacIntel' }, desktop: { protocolVersion: 1, deviceInfo() {} } }
  assert.equal(isMacDesktop(env), true)
  assert.equal(isMacDesktop({ ...env, location: { protocol: 'http:', hostname: '127.0.0.1' } }), false)
  assert.equal(isMacDesktop({ ...env, topLevel: false }), false)
  assert.equal(isMacDesktop({ ...env, navigator: { platform: 'Linux x86_64' } }), false)
  assert.equal(isMacDesktop({ ...env, desktop: { protocolVersion: 1 } }), false)
  assert.equal(selectedSessionId(state(1)), 's')
})
