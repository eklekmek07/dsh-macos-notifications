import { EVENT_KINDS, normalizePreferences } from './preferences.js';
import { cleanText, presentNotification } from './presentation.js';

export const ATTENTION_KEY = 'dsh-macos-notifications.attention.v1';
const PENDING = new Set(['approval', 'question', 'plan-review']);

export function createNotificationManager({
  NotificationClass, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  onChange, storage, focus, canDeliver = () => true,
} = {}) {
  let disposed = false;
  let serial = 0;
  let queue = [];
  const native = new Map();
  const records = () => queue.map(record => ({ ...record }));
  const timestamp = () => {
    try { const value = now(); return Number.isFinite(value) && value >= 0 ? value : 0; }
    catch { return 0; }
  };
  const persist = () => {
    try { storage?.setItem(ATTENTION_KEY, JSON.stringify(queue)); } catch { /* Optional storage. */ }
    try { onChange?.(records()); } catch { /* UI observers cannot break delivery. */ }
  };

  try {
    const raw = storage?.getItem(ATTENTION_KEY);
    const saved = typeof raw === 'string' && raw.length <= 262144 ? JSON.parse(raw) : [];
    const ids = new Set();
    if (Array.isArray(saved)) {
      for (const item of saved.slice(-50)) {
        if (!item || !EVENT_KINDS.includes(item.kind) || typeof item.sessionId !== 'string' ||
            !item.sessionId.trim() || typeof item.id !== 'string' || !item.id.trim() ||
            !Number.isFinite(item.createdAt) || item.createdAt < 0) continue;
        const id = cleanText(item.id, 200);
        if (ids.has(id)) continue;
        ids.add(id);
        queue.push({ id, sessionId: cleanText(item.sessionId, 200),
          chatTitle: cleanText(item.chatTitle, 160), kind: item.kind, createdAt: item.createdAt });
      }
    }
  } catch { /* Corrupt or unavailable storage is an empty queue. */ }

  function cleanup(id, close = false) {
    const entry = native.get(id);
    if (!entry) return;
    native.delete(id);
    if (entry.timer !== undefined) {
      try { clearTimer(entry.timer); } catch { /* Timer providers may already be stopped. */ }
    }
    for (const name of ['onclick', 'onerror', 'onclose']) {
      try { entry.notice[name] = null; } catch { /* Best-effort browser cleanup. */ }
    }
    if (close) {
      // Notification.close() removes the native entry, not merely its banner.
      try { entry.notice.close(); } catch { /* Unsupported or already closed. */ }
    }
  }

  function notify(event, prefs, options = {}) {
    if (disposed) return { ok: false, reason: 'disposed' };
    if (!event || !EVENT_KINDS.includes(event.kind) || typeof event.sessionId !== 'string' ||
        !event.sessionId.trim()) return { ok: false, reason: 'invalid-event' };
    const preferences = normalizePreferences(prefs);
    const config = preferences.events[event.kind];
    if (!preferences.enabled || !config.enabled) return { ok: false, reason: 'disabled' };
    const sessionId = cleanText(event.sessionId, 200);
    let id = `notification-${timestamp()}-${++serial}`;
    while (queue.some(record => record.id === id) || native.has(id)) id = `notification-${timestamp()}-${++serial}`;
    if (config.behavior === 'keep') {
      const existing = PENDING.has(event.kind)
        ? queue.find(record => record.sessionId === sessionId && record.kind === event.kind) : undefined;
      if (existing) {
        id = existing.id;
        cleanup(id, true);
        const chatTitle = cleanText(event.chatTitle, 160);
        if (existing.chatTitle !== chatTitle) { existing.chatTitle = chatTitle; persist(); }
      } else {
        queue.push({ id, sessionId, chatTitle: cleanText(event.chatTitle, 160),
          kind: event.kind, createdAt: timestamp() });
        if (queue.length > 50) {
          const removed = queue.shift();
          cleanup(removed.id, true);
        }
        persist();
      }
    }
    if (options?.deliverNative === false) return { ok: false, reason: 'delivery-suppressed' };
    try {
      if (!NotificationClass || NotificationClass.permission !== 'granted') {
        return { ok: false, reason: 'permission-denied' };
      }
      if (!canDeliver()) return { ok: false, reason: 'delivery-suppressed' };
    } catch { return { ok: false, reason: 'delivery-unavailable' }; }
    // A gate or observer may synchronously dispose this manager.
    if (disposed) return { ok: false, reason: 'disposed' };
    const { title, body } = presentNotification(event, preferences);
    let notice;
    try {
      while (native.size >= 64) cleanup(native.keys().next().value, true);
      // requireInteraction is best effort; macOS does not guarantee sticky alerts.
      notice = new NotificationClass(title, { body, requireInteraction: config.behavior === 'keep' });
      if (disposed) {
        try { notice.close(); } catch { /* Best effort. */ }
        return { ok: false, reason: 'disposed' };
      }
      const entry = { notice, timer: undefined, sessionId, kind: event.kind };
      native.set(id, entry);
      notice.onclose = () => { if (native.get(id) === entry) cleanup(id); };
      notice.onerror = () => { if (native.get(id) === entry) cleanup(id, true); };
      notice.onclick = () => {
        if (disposed || native.get(id) !== entry) return;
        try { focus?.(sessionId); } catch { /* Focus is user navigation, never approval. */ }
      };
      if (config.behavior === 'auto-remove') {
        entry.timer = setTimer(() => cleanup(id, true), config.removeAfterSeconds * 1000);
        // Also tolerate synchronous custom timer implementations.
        if (!native.has(id) && entry.timer !== undefined) clearTimer(entry.timer);
      }
      return { ok: true };
    } catch {
      if (native.has(id)) cleanup(id, true);
      else if (notice) {
        try { notice.close(); } catch { /* Native construction/setup failed. */ }
      }
      return { ok: false, reason: 'native-error' };
    }
  }

  function dismiss(id) {
    if (disposed) return;
    cleanup(id, true);
    const next = queue.filter(record => record.id !== id);
    if (next.length !== queue.length) { queue = next; persist(); }
  }

  function resolve(sessionId) {
    if (disposed || typeof sessionId !== 'string') return;
    const key = cleanText(sessionId, 200);
    for (const [id, entry] of native) {
      if (entry.sessionId === key && PENDING.has(entry.kind)) cleanup(id, true);
    }
    const next = queue.filter(record => record.sessionId !== key || !PENDING.has(record.kind));
    if (next.length !== queue.length) { queue = next; persist(); }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of native.keys()) cleanup(id, true);
  }

  return { notify, records, dismiss, resolve, dispose };
}
