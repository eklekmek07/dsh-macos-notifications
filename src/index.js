import Schema from '@deepseek-ai/schemastery'
import { notificationProjection } from './projection.js'

export const name = 'dsh-macos-notifications'
export const inject = ['sessionProjections']
export const Config = Schema.object({
  maxPreviewChars: Schema.natural().min(1).max(1000).default(400)
    .description('Maximum reply characters projected to the authenticated UI. Preview display is separately opt-in.'),
})

export function apply(ctx, config = {}) {
  const resolved = Config(config)
  ctx.sessionProjections.register(notificationProjection(resolved.maxPreviewChars))
}
