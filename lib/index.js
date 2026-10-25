// src/index.js
import Schema from "@deepseek-ai/schemastery";

// src/projection.js
import { z } from "zod";
var PROJECTION_KEY = "macosNotifications";
var EMPTY = Object.freeze({ turn: 0, kind: "", preview: "", durationMs: null });
var timestamp = (value) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
var clip = (value, limit) => [...value].slice(0, limit).join("");
function applyNotificationEvent(state, event, maxPreviewChars) {
  const data = event?.data;
  if (event?.type === "turn/start") {
    return { ...state, open: { turn: data.turn, startedAt: timestamp(event.time), preview: "" } };
  }
  const open = state.open;
  if (!open || open.turn !== data?.turn) return state;
  if (event.type === "assistant/message") {
    const message = data.message;
    if (message?.channel === "analysis") return state;
    const text = (Array.isArray(message?.content) ? message.content : []).filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("");
    if (!text.trim()) return state;
    const preview = clip(text, maxPreviewChars);
    return preview === open.preview ? state : { ...state, open: { ...open, preview } };
  }
  if (event.type === "turn/end") {
    const endedAt = timestamp(event.time);
    const elapsed = open.startedAt !== null && endedAt !== null ? endedAt - open.startedAt : null;
    return {
      open: null,
      last: {
        turn: data.turn,
        kind: typeof data.reason?.kind === "string" ? data.reason.kind : "",
        preview: open.preview.trim(),
        durationMs: elapsed !== null && elapsed >= 0 ? elapsed : null
      }
    };
  }
  return state;
}
function notificationProjection(maxPreviewChars = 400) {
  const viewSchema = z.object({
    turn: z.number().int().nonnegative(),
    kind: z.string(),
    preview: z.string().max(maxPreviewChars * 2),
    durationMs: z.number().nonnegative().nullable()
  }).strict();
  return {
    key: PROJECTION_KEY,
    stateVersion: 1,
    stateSchema: z.object({
      open: z.object({ turn: z.number().int().nonnegative(), startedAt: z.number().nonnegative().nullable(), preview: z.string().max(maxPreviewChars * 2) }).strict().nullable(),
      last: viewSchema.nullable()
    }).strict(),
    init: () => ({ open: null, last: null }),
    apply: (state, event) => applyNotificationEvent(state, event, maxPreviewChars),
    wire: { viewSchema, view: (state) => state.last ?? EMPTY }
  };
}

// src/index.js
var name = "dsh-macos-notifications";
var inject = ["sessionProjections"];
var Config = Schema.object({
  maxPreviewChars: Schema.natural().min(1).max(1e3).default(400).description("Maximum reply characters projected to the authenticated UI. Preview display is separately opt-in.")
});
function apply(ctx, config = {}) {
  const resolved = Config(config);
  ctx.sessionProjections.register(notificationProjection(resolved.maxPreviewChars));
}
export {
  Config,
  apply,
  inject,
  name
};
