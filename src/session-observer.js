const PENDING = new Set(['approval', 'question', 'plan-review'])
const FINISHED = new Set(['completed', 'error', 'aborted', 'blocked', 'max-tokens'])

export function selectedSessionId(state) {
  return state.current ?? state.ids.find(id => (state.byId[id]?.retainedBy?.mainView ?? 0) > 0)
}

function pendingInteraction(state, id, uiSession) {
  // rc3 owns pending facts on sessionStatus, not on the controller list row.
  const status = uiSession?.sessionStatus?.getSnapshot()?.get(id)?.pendingInteraction
  const legacy = uiSession?.pendingInteractions?.getSnapshot()?.get(id)
  const row = state.byId[id]?.pendingInteraction
  const value = status ?? legacy ?? (typeof row === 'string' ? { kind: row } : row)
  return PENDING.has(value?.kind) ? { kind: value.kind, key: value.key ?? value.kind } : undefined
}
export function pendingKind(state, id, uiSession) {
  return pendingInteraction(state, id, uiSession)?.kind
}

/** Reads supported session observables; does not mutate, approve or steer sessions. */
export function createSessionObserver({ sessions, uiSession, manager, getPreferences, document }) {
  let disposed = false
  const observed = new Map()
  const sequences = new Map()

  const run = () => {
    if (disposed) return
    const state = sessions.list.getSnapshot()
    if (!Array.isArray(state.ids) || !state.byId || (state.phase && state.phase !== 'ready')) return
    const prefs = getPreferences()
    const selected = selectedSessionId(state)
    const deliver = id => !prefs.backgroundOnly || document.hidden || selected !== id
    const live = new Set(state.ids)
    for (const id of state.ids) {
      const row = state.byId[id]
      if (!row || row.origin === 'subagent') continue
      const projection = row.projectionValues?.macosNotifications
      const turn = Number.isSafeInteger(projection?.turn) && projection.turn >= 0 ? projection.turn : undefined
      const pending = pendingInteraction(state, id, uiSession)
      const previous = observed.get(id)
      const chatTitle = row.displayTitle ?? row.title ?? ''
      const freshTurn = Boolean(previous && turn !== undefined && previous.turn !== undefined && turn > previous.turn)
      const running = row.running === true
      // A new run/completion is live activity. An already-running session at startup is history.
      const liveActivity = Boolean(previous?.liveActivity || (previous && !previous.running && running) || freshTurn)
      observed.set(id, { turn: turn ?? previous?.turn, pending, running, liveActivity })
      if (freshTurn && FINISHED.has(projection.kind)) {
        manager.notify({ sessionId: id, chatTitle, kind: projection.kind, preview: projection.preview, durationMs: projection.durationMs, turn }, prefs, { deliverNative: deliver(id) })
      }
      const changed = pending?.kind !== previous?.pending?.kind || pending?.key !== previous?.pending?.key
      if ((previous?.pending && changed) || (freshTurn && !pending)) manager.resolve(id)
      if (pending && (!previous || changed)) {
        const sequence = (sequences.get(id) ?? 0) + 1
        sequences.set(id, sequence)
        // The status feed may hydrate after the ready list. Preserve saved attention,
        // and seed first requests silently until there is evidence of live activity.
        const knownRequest = Boolean(previous?.pending)
        manager.notify({ sessionId: id, chatTitle, kind: pending.kind, sequence }, prefs,
          { deliverNative: Boolean(previous) && (knownRequest || liveActivity) && deliver(id) })
      }
    }
    for (const id of [...observed.keys()]) {
      if (!live.has(id)) { observed.delete(id); sequences.delete(id); manager.resolve(id) }
    }
    // Do not delete persisted records merely because initial list/status hydration lacks them.
    // A known pending->none, later terminal turn, observed removal, or explicit acknowledgement resolves them.
  }

  run()
  const offList = sessions.list.subscribe(run)
  const offStatus = uiSession?.sessionStatus?.subscribe(run)
  const offLegacy = !uiSession?.sessionStatus ? uiSession?.pendingInteractions?.subscribe(run) : undefined
  return {
    reset() { observed.clear() },
    refresh: run,
    dispose() { disposed = true; offList(); offStatus?.(); offLegacy?.(); observed.clear(); sequences.clear() },
  }
}
