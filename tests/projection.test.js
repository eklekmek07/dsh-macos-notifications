import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationProjection, applyNotificationEvent } from '../src/projection.js'

test('fold computes duration from committed timestamps, bounds preview and excludes reasoning/tools', () => {
  const unit = notificationProjection(8)
  let state = unit.init()
  state = unit.apply(state, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  const started = state
  state = unit.apply(state, { type: 'tool/call', time: 2000, data: { turn: 1, arguments: 'private' } })
  assert.equal(state, started)
  state = unit.apply(state, { type: 'assistant/message', data: { turn: 1, message: { channel: 'analysis', content: [{ type: 'text', text: 'secret analysis' }] } } })
  assert.equal(state, started)
  state = unit.apply(state, { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'reasoning', text: 'secret' }, { type: 'text', text: 'Finished output!' }] } } })
  state = unit.apply(state, { type: 'turn/end', time: 66000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.deepEqual(unit.wire.viewSchema.parse(unit.wire.view(state)), { turn: 1, kind: 'completed', preview: 'Finished', durationMs: 65000 })
  unit.stateSchema.parse(state)
})

test('missing/invalid/reversed timestamps do not invent duration', () => {
  for (const [start, end] of [[undefined, undefined], [100, 50], ['invalid', 'invalid']]) {
    const unit = notificationProjection()
    let state = unit.apply(unit.init(), { type: 'turn/start', time: start, data: { turn: 1 } })
    state = unit.apply(state, { type: 'turn/end', time: end, data: { turn: 1, reason: { kind: 'error' } } })
    assert.equal(unit.wire.view(state).durationMs, null)
  }
})

test('ISO timestamps work and unrelated turns do not mutate the fold', () => {
  let state = { open: null, last: null }
  state = applyNotificationEvent(state, { type: 'turn/start', time: '2026-10-25T12:00:00Z', data: { turn: 3 } }, 4)
  assert.equal(applyNotificationEvent(state, { type: 'turn/end', time: 2000, data: { turn: 2 } }, 4), state)
  state = applyNotificationEvent(state, { type: 'assistant/message', data: { turn: 3, message: { content: [{ type: 'text', text: '😀😀😀😀😀' }] } } }, 4)
  state = applyNotificationEvent(state, { type: 'turn/end', time: '2026-10-25T12:00:10Z', data: { turn: 3, reason: { kind: 'completed' } } }, 4)
  assert.equal(state.last.preview, '😀😀😀😀')
  assert.equal(state.last.durationMs, 10000)
})
