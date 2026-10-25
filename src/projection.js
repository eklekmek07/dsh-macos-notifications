import { z } from 'zod'

export const PROJECTION_KEY = 'macosNotifications'
const EMPTY = Object.freeze({ turn: 0, kind: '', preview: '', durationMs: null })
const timestamp = value => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
const clip = (value, limit) => [...value].slice(0, limit).join('')

/** Pure fold; no wall-clock dependency, tool arguments, reasoning or full logs. */
export function applyNotificationEvent(state, event, maxPreviewChars) {
  const data = event?.data
  if (event?.type === 'turn/start') {
    return { ...state, open: { turn: data.turn, startedAt: timestamp(event.time), preview: '' } }
  }
  const open = state.open
  if (!open || open.turn !== data?.turn) return state
  if (event.type === 'assistant/message') {
    const message = data.message
    if (message?.channel === 'analysis') return state
    const text = (Array.isArray(message?.content) ? message.content : [])
      .filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text).join('')
    if (!text.trim()) return state
    const preview = clip(text, maxPreviewChars)
    return preview === open.preview ? state : { ...state, open: { ...open, preview } }
  }
  if (event.type === 'turn/end') {
    const endedAt = timestamp(event.time)
    const elapsed = open.startedAt !== null && endedAt !== null ? endedAt - open.startedAt : null
    return {
      open: null,
      last: {
        turn: data.turn,
        kind: typeof data.reason?.kind === 'string' ? data.reason.kind : '',
        preview: open.preview.trim(),
        durationMs: elapsed !== null && elapsed >= 0 ? elapsed : null,
      },
    }
  }
  return state
}

export function notificationProjection(maxPreviewChars = 400) {
  const viewSchema = z.object({
    turn: z.number().int().nonnegative(), kind: z.string(), preview: z.string().max(maxPreviewChars * 2),
    durationMs: z.number().nonnegative().nullable(),
  }).strict()
  return {
    key: PROJECTION_KEY,
    stateVersion: 1,
    stateSchema: z.object({
      open: z.object({ turn: z.number().int().nonnegative(), startedAt: z.number().nonnegative().nullable(), preview: z.string().max(maxPreviewChars * 2) }).strict().nullable(),
      last: viewSchema.nullable(),
    }).strict(),
    init: () => ({ open: null, last: null }),
    apply: (state, event) => applyNotificationEvent(state, event, maxPreviewChars),
    wire: { viewSchema, view: state => state.last ?? EMPTY },
  }
}
