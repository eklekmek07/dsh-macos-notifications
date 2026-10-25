import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsPanel } from '../src/settings-panel.jsx';
import { defaultPreferences } from '../src/preferences.js';

function render(props = {}) {
  return renderToStaticMarkup(<SettingsPanel preferences={defaultPreferences()} records={[]} permission="default" nativeAvailable={false} {...props} />);
}

test('settings render truthful delivery and privacy notices without invoking callbacks', () => {
  let calls = 0;
  const action = () => { calls++; };
  const html = render({ onSave: action, onReset: action, onRequestPermission: action, onTest: action, onDismiss: action });
  assert.match(html, /Apple controls banners versus alerts/);
  assert.match(html, /not as a sticky macOS banner/);
  assert.match(html, /renderer must stay open/);
  assert.match(html, /never approve tools/);
  assert.match(html, /lock screen/);
  assert.match(html, /Notification Center, not just the banner/);
  assert.match(html, /OS-controlled notification/);
  assert.match(html, /Keep in DSH attention list/);
  assert.match(html, /type="submit"[^>]*>Save/);
  assert.equal(calls, 0);
});

test('minimal mode disables custom options and renders every event', () => {
  const preferences = { ...defaultPreferences(), contentMode: 'minimal' };
  const html = render({ preferences });
  assert.match(html, /<fieldset class="dmn-custom" disabled=""/);
  for (const event of ['Completed', 'Error', 'Aborted', 'Blocked', 'Token limit reached', 'Tool approval', 'Question', 'Plan review']) {
    assert.ok(html.includes(`<legend>${event}</legend>`));
  }
});

test('auto-remove input is bounded and has an accessible label', () => {
  const preferences = defaultPreferences();
  preferences.events.completed.behavior = 'auto-remove';
  const html = render({ preferences });
  assert.match(html, /Auto-remove delay \(seconds\)/);
  assert.match(html, /type="number" min="1" max="3600" step="1" required=""/);
});

test('Turkish locale, escaped attention records and storage errors render safely', () => {
  const html = render({
    locale: 'tr-TR',
    saveError: '<storage unavailable>',
    records: [{ id: 'one', sessionId: 'session', chatTitle: '<script>alert(1)</script>', kind: 'approval', createdAt: 0 }],
  });
  assert.match(html, /lang="tr"/);
  assert.match(html, /Bildirim izni/);
  assert.match(html, /Görüldü olarak işaretle/);
  assert.match(html, /role="alert"/);
  assert.match(html, /&lt;storage unavailable&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('unavailable native integration disables permission and test actions', () => {
  const html = render({ onRequestPermission() {}, onTest() {}, permission: 'granted' });
  assert.match(html, /disabled="">Request permission/);
  assert.match(html, /disabled="">Send test notification/);
});
