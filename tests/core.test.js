import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_KINDS, DEFAULT_PREFERENCES, defaultPreferences, normalizePreferences,
  loadPreferences, savePreferences, PREFERENCES_KEY } from '../src/preferences.js';
import { presentNotification } from '../src/presentation.js';
import { createNotificationManager, ATTENTION_KEY } from '../src/notification-manager.js';

const event = (kind = 'approval', extra = {}) => ({ sessionId: 'session', chatTitle: 'My chat', kind, ...extra });
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
function harness(options = {}) {
  const notices = [];
  const timers = new Map();
  let next = 0;
  class Notification {
    static permission = 'granted';
    constructor(title, settings) { this.title = title; this.settings = settings; this.closed = false; notices.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  }
  const manager = createNotificationManager({ NotificationClass: Notification, now: () => 42,
    setTimer: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => timers.delete(id), ...options });
  return { manager, Notification, notices, timers };
}

test('defaults are independent, frozen and enable only intended events', () => {
  assert.equal(EVENT_KINDS.length, 8);
  assert.equal(Object.isFrozen(DEFAULT_PREFERENCES.events.approval), true);
  const prefs = defaultPreferences();
  assert.deepEqual(EVENT_KINDS.filter(kind => prefs.events[kind].enabled), ['completed', 'error', 'approval', 'question']);
  prefs.events.approval.enabled = false;
  assert.equal(defaultPreferences().events.approval.enabled, true);
  assert.equal(defaultPreferences().events['plan-review'].behavior, 'keep');
});

test('normalization is bounded, typed and ignores unknown fields', () => {
  const prefs = normalizePreferences({ enabled: 'false', showPreview: true, titleMode: 'wrong', unknown: true,
    events: { approval: { enabled: false, behavior: 'auto-remove', removeAfterSeconds: -8, secret: 'no' },
      error: { removeAfterSeconds: 999999 }, completed: { removeAfterSeconds: Infinity } } });
  assert.equal(prefs.enabled, true);
  assert.equal(prefs.showPreview, true);
  assert.equal(prefs.titleMode, 'chat');
  assert.deepEqual(prefs.events.approval, { enabled: false, behavior: 'auto-remove', removeAfterSeconds: 1 });
  assert.equal(prefs.events.error.removeAfterSeconds, 3600);
  assert.equal(prefs.events.completed.removeAfterSeconds, 8);
  assert.equal(Object.hasOwn(prefs, 'unknown'), false);
  for (const value of [null, [], true, 'text', new Proxy({}, { get() { throw Error(); } })]) {
    assert.doesNotThrow(() => normalizePreferences(value));
  }
});

test('preferences persist normalized values and tolerate failed storage', () => {
  const store = storage();
  savePreferences(store, { showPreview: true });
  assert.equal(loadPreferences(store).showPreview, true);
  assert.equal(store.data.has(PREFERENCES_KEY), true);
  store.setItem(PREFERENCES_KEY, '{bad');
  assert.deepEqual(loadPreferences(store), defaultPreferences());
  const broken = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.deepEqual(loadPreferences(broken), defaultPreferences());
  assert.doesNotThrow(() => savePreferences(broken, {}));
});

test('custom presentation cleans and bounds plain text with optional duration and preview', () => {
  const result = presentNotification(event('completed', { chatTitle: ' A\n chat\u0000 ', durationMs: 64000, preview: ' secret\ntext ' }),
    { showPreview: true });
  assert.deepEqual(result, { title: 'A chat', body: 'Completed · 1m 4s · secret text' });
  const bounded = presentNotification(event('completed', { chatTitle: 'a'.repeat(500), preview: 'b'.repeat(1000) }), { showPreview: true });
  assert.equal(bounded.title.length, 160);
  assert.equal(bounded.body.length, 400);
  assert.equal(presentNotification(event('completed', { chatTitle: '' })).title, 'Completed');
  assert.equal(presentNotification(event('completed'), { titleMode: 'event' }).title, 'Completed');
});

test('minimal presentation never includes chat, preview or duration', () => {
  assert.deepEqual(presentNotification(event('completed', { durationMs: 64000, preview: 'secret' }),
    { contentMode: 'minimal', showPreview: true }), { title: 'Completed', body: 'Completed' });
  assert.equal(presentNotification(event('approval')).body, 'Approval needed');
  assert.equal(presentNotification(event('approval', { durationMs: 0 })).body, 'Approval needed · 0s');
  for (const durationMs of [-1, NaN, Infinity, '1000', null]) {
    assert.equal(presentNotification(event('completed', { durationMs })).body, 'Completed');
  }
});

test('native denial still persists pending metadata without previews or event extras', () => {
  const store = storage();
  let changes = 0;
  const h = harness({ storage: store, onChange: () => changes++ });
  h.Notification.permission = 'denied';
  assert.deepEqual(h.manager.notify(event('approval', { preview: 'SECRET', turn: { secret: true } })),
    { ok: false, reason: 'permission-denied' });
  assert.equal(changes, 1);
  assert.deepEqual(Object.keys(h.manager.records()[0]), ['id', 'sessionId', 'chatTitle', 'kind', 'createdAt']);
  assert.equal(store.data.get(ATTENTION_KEY).includes('SECRET'), false);
  const restored = harness({ storage: store });
  assert.deepEqual(restored.manager.records(), h.manager.records());
  assert.equal(restored.notices.length, 0);
  const copy = restored.manager.records(); copy[0].chatTitle = 'changed';
  assert.equal(restored.manager.records()[0].chatTitle, 'My chat');
});

test('disabled events and preferences produce no queue or native notice', () => {
  const h = harness();
  assert.equal(h.manager.notify(event('approval'), { enabled: false }).reason, 'disabled');
  assert.equal(h.manager.notify(event('blocked')).reason, 'disabled');
  assert.equal(h.manager.notify(event('unknown')).reason, 'invalid-event');
  assert.equal(h.manager.notify(event('approval', { sessionId: '' })).reason, 'invalid-event');
  assert.equal(h.manager.records().length, 0);
  assert.equal(h.notices.length, 0);
});

test('delivery gates preserve pending records and suppress native delivery', () => {
  const h = harness({ canDeliver: () => false });
  assert.equal(h.manager.notify(event()).reason, 'delivery-suppressed');
  assert.equal(h.manager.records().length, 1);
  const seeded = harness();
  assert.equal(seeded.manager.notify(event(), undefined, { deliverNative: false }).reason, 'delivery-suppressed');
  assert.equal(seeded.notices.length, 0);
  assert.equal(seeded.manager.records().length, 1);
});

test('keep is best effort interaction, clicking only focuses and pending is durable after native close', () => {
  const focused = [];
  const h = harness({ focus: session => focused.push(session) });
  assert.equal(h.manager.notify(event()).ok, true);
  assert.equal(h.notices[0].settings.requireInteraction, true);
  h.notices[0].onclick();
  assert.deepEqual(focused, ['session']);
  h.notices[0].close();
  assert.equal(h.notices[0].onclick, null);
  assert.equal(h.manager.records().length, 1);
  h.manager.dismiss(h.manager.records()[0].id);
  assert.equal(h.manager.records().length, 0);
});

test('auto-remove closes native Notification Center entry and clears timer/listeners', () => {
  const h = harness();
  h.manager.notify(event('completed'), { events: { completed: { behavior: 'auto-remove', removeAfterSeconds: 3 } } });
  assert.equal(h.notices[0].settings.requireInteraction, false);
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 3000);
  timer.callback();
  assert.equal(h.notices[0].closed, true);
  assert.equal(h.notices[0].onclick, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.manager.records().length, 0);
});

test('os-default schedules no close timer; pending auto-remove creates no durable record', () => {
  const h = harness();
  h.manager.notify(event('completed'));
  assert.equal(h.timers.size, 0);
  h.manager.notify(event('approval'), { events: { approval: { behavior: 'auto-remove' } } });
  assert.equal(h.manager.records().length, 0);
});

test('resolve clears only session pending notices and metadata, not completed notices', () => {
  const h = harness();
  h.manager.notify(event());
  h.manager.notify(event('question', { sessionId: 'other' }));
  h.manager.notify(event('completed'));
  h.manager.resolve('session');
  assert.equal(h.notices[0].closed, true);
  assert.equal(h.notices[1].closed, false);
  assert.equal(h.notices[2].closed, false);
  assert.deepEqual(h.manager.records().map(record => record.sessionId), ['other']);
});

test('keep completion metadata persists and survives pending session resolution', () => {
  const store = storage();
  const h = harness({ storage: store });
  h.manager.notify(event());
  h.manager.notify(event('completed'), { events: { completed: { behavior: 'keep' } } });
  h.manager.resolve('session');
  assert.deepEqual(h.manager.records().map(record => record.kind), ['completed']);
  assert.equal(h.notices[1].closed, false);
  assert.equal(harness({ storage: store }).manager.records()[0].kind, 'completed');
  h.manager.dismiss(h.manager.records()[0].id);
  assert.equal(h.notices[1].closed, true);
});

test('repeated pending delivery deduplicates and updates safe metadata', () => {
  const h = harness();
  h.manager.notify(event());
  const id = h.manager.records()[0].id;
  h.manager.notify(event('approval', { chatTitle: 'New title', preview: 'hidden' }));
  assert.equal(h.manager.records().length, 1);
  assert.equal(h.manager.records()[0].id, id);
  assert.equal(h.manager.records()[0].chatTitle, 'New title');
  assert.equal(h.notices[0].closed, true);
});

test('stale callbacks from replaced pending native notices cannot affect replacement', () => {
  const focused = [];
  const h = harness({ focus: sessionId => focused.push(sessionId) });
  h.manager.notify(event());
  const { onclose, onerror, onclick } = h.notices[0];
  h.manager.notify(event());
  onclose(); onerror(); onclick();
  assert.equal(h.notices[1].closed, false);
  assert.deepEqual(focused, []);
  h.manager.dispose();
  assert.equal(h.notices[1].closed, true);
});

test('queue and native refs are bounded; evicted notices close', () => {
  const h = harness();
  for (let index = 0; index < 80; index++) h.manager.notify(event('approval', { sessionId: `session-${index}` }));
  assert.equal(h.manager.records().length, 50);
  assert.equal(h.notices.filter(notice => !notice.closed).length, 50);
  for (let index = 0; index < 100; index++) h.manager.notify(event('completed'));
  assert.equal(h.notices.filter(notice => !notice.closed).length, 64);
  h.manager.dispose();
  assert.equal(h.notices.filter(notice => !notice.closed).length, 0);
});

test('dispose closes all native refs, clears timers, retains durable records and prevents stale delivery', () => {
  const h = harness();
  h.manager.notify(event());
  h.manager.notify(event('completed'), { events: { completed: { behavior: 'auto-remove' } } });
  const staleClick = h.notices[0].onclick;
  const staleTimer = [...h.timers.values()][0].callback;
  h.manager.dispose(); h.manager.dispose();
  staleClick(); staleTimer();
  assert.equal(h.timers.size, 0);
  assert.equal(h.notices.every(notice => notice.closed && notice.onclick === null), true);
  assert.equal(h.manager.records().length, 1);
  assert.equal(h.manager.notify(event()).reason, 'disposed');
});

test('constructor, async onerror, gate, timer and storage failures cannot throw or lose attention', () => {
  class Broken { static permission = 'granted'; constructor() { throw Error('no'); } }
  const broken = createNotificationManager({ NotificationClass: Broken,
    storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, onChange() { throw Error(); } });
  assert.equal(broken.notify(event()).reason, 'native-error');
  assert.equal(broken.records().length, 1);
  const h = harness();
  h.manager.notify(event()); h.notices[0].onerror();
  assert.equal(h.notices[0].closed, true);
  assert.equal(h.notices[0].onerror, null);
  assert.equal(h.manager.records().length, 1);
  const gate = harness({ canDeliver() { throw Error(); } });
  assert.equal(gate.manager.notify(event()).reason, 'delivery-unavailable');
  const timer = harness({ setTimer() { throw Error(); } });
  assert.equal(timer.manager.notify(event('completed'), { events: { completed: { behavior: 'auto-remove' } } }).reason, 'native-error');
  assert.equal(timer.notices[0].closed, true);
});

test('loaded attention is sanitized, bounded, duplicate-free and never includes stored preview', () => {
  const store = storage();
  const rows = Array.from({ length: 80 }, (_, index) => ({ id: `${index}`, sessionId: `s${index}`, chatTitle: 'title',
    kind: 'approval', createdAt: 1, preview: 'SECRET' }));
  rows.push({ ...rows.at(-1) }, { ...rows.at(-1), id: 'bad', kind: 'invalid' });
  store.setItem(ATTENTION_KEY, JSON.stringify(rows));
  const h = harness({ storage: store });
  assert.ok(h.manager.records().length <= 50);
  assert.equal(new Set(h.manager.records().map(record => record.id)).size, h.manager.records().length);
  assert.equal(JSON.stringify(h.manager.records()).includes('SECRET'), false);
  store.setItem(ATTENTION_KEY, '{broken');
  assert.deepEqual(harness({ storage: store }).manager.records(), []);
});
