import React, { useSyncExternalStore } from 'react'
import { SettingsPanel } from './settings-panel.jsx'
import { defaultPreferences, loadPreferences, normalizePreferences, PREFERENCES_KEY } from './preferences.js'
import { createNotificationManager } from './notification-manager.js'
import { createSessionObserver, selectedSessionId } from './session-observer.js'
import { isMacDesktop } from './environment.js'
import styles from './styles.css'

export const inject = ['sessions', 'slots', 'locale']
const NAMESPACE = 'macosNotifications'
const STORAGE_WARNING = 'Local storage is unavailable. Settings and attention records may not survive a reload.'

function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    update(patch) { state = { ...state, ...patch }; for (const listener of listeners) listener() },
  }
}

export function apply(ctx) {
  const sessions = ctx.get('sessions')
  const uiSession = ctx.get('uiSession')
  const nativeAvailable = isMacDesktop({ location: window.location, navigator: window.navigator,
    desktop: window.dshDesktop, topLevel: window.top === window })
  const NotificationClass = typeof Notification === 'undefined' ? undefined : Notification
  const permission = () => NotificationClass?.permission ?? 'unavailable'
  let rawStorage
  let storageError = ''
  try { rawStorage = window.localStorage } catch { storageError = STORAGE_WARNING }
  let store
  const storage = {
    getItem(key) {
      try { return rawStorage?.getItem(key) ?? null }
      catch { storageError = STORAGE_WARNING; return null }
    },
    setItem(key, value) {
      try {
        if (!rawStorage) throw new Error('Storage unavailable')
        rawStorage.setItem(key, value)
      } catch {
        storageError = STORAGE_WARNING
        store?.update({ saveError: storageError })
        throw new Error(STORAGE_WARNING)
      }
    },
  }
  const preferences = loadPreferences(storage)
  store = createStore({ preferences, records: [], nativeAvailable, permission: permission(), saveError: storageError })
  const manager = createNotificationManager({
    NotificationClass, storage, canDeliver: () => nativeAvailable,
    focus: () => window.focus(),
    onChange: records => store.update({ records, saveError: storageError }),
  })
  store.update({ records: manager.records() })
  const observer = createSessionObserver({ sessions, uiSession, manager,
    getPreferences: () => store.getSnapshot().preferences, document })

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshMacosNotifications = 'true'
    style.textContent = styles
    document.head.appendChild(style)
    return () => style.remove()
  }, 'macos-notifications: styles')
  ctx.effect(() => ctx.locale.register(NAMESPACE, {
    en: { nav: 'macOS Notifications' }, tr: { nav: 'macOS Bildirimleri' }, zh: { nav: 'macOS Notifications' },
  }), 'macos-notifications: locale')
  const t = ctx.locale.bind(NAMESPACE)
  ctx.effect(() => ctx.on('connection/reset', () => observer.reset()), 'macos-notifications: reconnect')
  ctx.effect(() => {
    const updatePermission = () => store.update({ permission: permission() })
    window.addEventListener('focus', updatePermission)
    document.addEventListener('visibilitychange', updatePermission)
    return () => { window.removeEventListener('focus', updatePermission); document.removeEventListener('visibilitychange', updatePermission) }
  }, 'macos-notifications: permission status')
  ctx.effect(() => () => { observer.dispose(); manager.dispose() }, 'macos-notifications: lifecycle')

  const save = next => {
    const normalized = normalizePreferences(next)
    try { storage.setItem(PREFERENCES_KEY, JSON.stringify(normalized)) }
    catch { return { ok: false, message: STORAGE_WARNING } }
    storageError = ''
    store.update({ preferences: normalized, saveError: '' })
    observer.reset()
    observer.refresh()
    return { ok: true }
  }
  const requestPermission = async () => {
    if (!nativeAvailable || !NotificationClass) return { ok: false, message: 'Open the macOS DSH application to request native notification permission.' }
    try {
      const next = await NotificationClass.requestPermission()
      store.update({ permission: next })
      return { ok: next === 'granted', message: next === 'granted' ? 'Permission granted. macOS controls visible delivery.' : 'Permission was not granted. Check macOS notification settings.' }
    } catch { return { ok: false, message: 'Notification permission request failed.' } }
  }
  const sendTest = () => {
    const state = sessions.list.getSnapshot()
    const row = state.byId[selectedSessionId(state)]
    const result = manager.notify({ sessionId: row?.id ?? 'test', chatTitle: row?.displayTitle ?? row?.title ?? 'Test chat',
      kind: 'completed', preview: 'This is a local test notification, not a chat reply.', durationMs: 65000 }, store.getSnapshot().preferences)
    return { ...result, message: result.ok ? 'Notification requested. macOS settings, Focus and permissions control its appearance.' : `No native request: ${result.reason}. Check saved preferences and permissions.` }
  }
  function SettingsEntry() {
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    return <SettingsPanel {...state} locale={window.navigator.language ?? 'en'} onSave={save} onReset={() => save(defaultPreferences())}
      onRequestPermission={requestPermission} onTest={sendTest} onDismiss={id => { manager.dismiss(id); return { ok: true } }} />
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'macos-notifications', order: 61,
    label: () => t('nav'), locale: NAMESPACE }, SettingsEntry))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-macos-notifications', locale: NAMESPACE }, SettingsEntry))
}
