import { normalizePreferences } from './preferences.js';

const LABELS = Object.freeze({
  completed: 'Completed', error: 'Error', aborted: 'Aborted', blocked: 'Blocked',
  'max-tokens': 'Token limit reached', approval: 'Approval needed',
  question: 'Question needs an answer', 'plan-review': 'Plan review needed',
});

export function cleanText(value, limit) {
  return typeof value === 'string'
    ? value.slice(0, Math.max(limit * 8, 4096)).replace(/[\s\u0000-\u001f\u007f-\u009f]+/gu, ' ').trim().slice(0, limit)
    : '';
}

function duration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  const seconds = Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function presentNotification(event = {}, prefs) {
  const preferences = normalizePreferences(prefs);
  const label = Object.hasOwn(LABELS, event?.kind) ? LABELS[event.kind] : 'Notification';
  if (preferences.contentMode === 'minimal') return { title: label, body: label };
  const title = preferences.titleMode === 'chat' ? cleanText(event?.chatTitle, 160) || label : label;
  const parts = [label];
  const elapsed = preferences.showDuration ? duration(event?.durationMs) : '';
  if (elapsed) parts.push(elapsed);
  if (preferences.showPreview) {
    const preview = cleanText(event?.preview, 400);
    if (preview) parts.push(preview);
  }
  return { title, body: cleanText(parts.join(' · '), 400) };
}
