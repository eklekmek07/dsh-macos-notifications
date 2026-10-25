export const EVENT_KINDS = Object.freeze([
  'completed', 'error', 'aborted', 'blocked', 'max-tokens', 'approval', 'question', 'plan-review',
]);
export const PREFERENCES_KEY = 'dsh-macos-notifications.preferences.v1';
const pending = new Set(['approval', 'question', 'plan-review']);
const enabled = new Set(['completed', 'error', 'approval', 'question']);

export function defaultPreferences() {
  return {
    enabled: true,
    contentMode: 'custom',
    titleMode: 'chat',
    showPreview: false,
    showDuration: true,
    backgroundOnly: true,
    events: Object.fromEntries(EVENT_KINDS.map(kind => [kind, {
      enabled: enabled.has(kind),
      behavior: pending.has(kind) ? 'keep' : 'os-default',
      removeAfterSeconds: 8,
    }])),
  };
}

const defaults = defaultPreferences();
for (const value of Object.values(defaults.events)) Object.freeze(value);
Object.freeze(defaults.events);
export const DEFAULT_PREFERENCES = Object.freeze(defaults);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizePreferences(input) {
  const result = defaultPreferences();
  try {
    const source = object(input);
    for (const key of ['enabled', 'showPreview', 'showDuration', 'backgroundOnly']) {
      if (typeof source[key] === 'boolean') result[key] = source[key];
    }
    if (['custom', 'minimal'].includes(source.contentMode)) result.contentMode = source.contentMode;
    if (['chat', 'event'].includes(source.titleMode)) result.titleMode = source.titleMode;
    const events = object(source.events);
    for (const kind of EVENT_KINDS) {
      const event = object(events[kind]);
      if (typeof event.enabled === 'boolean') result.events[kind].enabled = event.enabled;
      if (['os-default', 'keep', 'auto-remove'].includes(event.behavior)) {
        result.events[kind].behavior = event.behavior;
      }
      if (typeof event.removeAfterSeconds === 'number' && Number.isFinite(event.removeAfterSeconds)) {
        result.events[kind].removeAfterSeconds = Math.min(3600, Math.max(1, Math.round(event.removeAfterSeconds)));
      }
    }
  } catch { /* Treat hostile or unavailable input like missing preferences. */ }
  return result;
}

export function loadPreferences(storage) {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY);
    return normalizePreferences(typeof raw === 'string' && raw.length <= 65536 ? JSON.parse(raw) : undefined);
  } catch { return defaultPreferences(); }
}

export function savePreferences(storage, prefs) {
  const normalized = normalizePreferences(prefs);
  try { storage?.setItem(PREFERENCES_KEY, JSON.stringify(normalized)); } catch { /* Storage is optional. */ }
  return normalized;
}
