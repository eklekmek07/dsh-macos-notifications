# DSH macOS Notifications

**Configurable notifications and a durable attention list inside DeepSeek Harness.**

[Türkçe](README.tr.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

> **AI / vibecode disclosure:** this plugin was built end-to-end with AI coding agents from a human's requirements (a fully “vibecoded” project). AI agents also wrote and reviewed its tests. This is experimental open-source software, **not an official DeepSeek product**, not independently security-audited, and not proof of reliable native delivery on every Mac. Review the code and limitations before installing.

## The problem

A generic “DeepSeek Harness finished” popup does not tell you which chat needs attention. Script-based notifiers can use a helper application's sender identity instead of DSH's. One global persistence switch also cannot express “leave normal completions alone, but keep questions and tool approvals on my radar.”

This plugin addresses those problems **without patching or re-signing the DSH application**. It sends Web Notifications from the actual macOS DSH Electron renderer and contributes an in-app settings page plus an attention list.

## What you can customize

Open **Settings → macOS Notifications**, or the plugin's configuration page under **Plugins**.

| Setting | Behavior |
| --- | --- |
| Title | Chat title, or generic event name |
| Duration | Show/hide elapsed turn time, when committed start/end timestamps exist |
| Preview | Optional bounded reply snippet; **off by default** |
| Simple mode | Generic notification only: no chat title, preview or duration |
| Out-of-view only | Suppress native popups for the currently visible chat; retain important in-app attention |
| Event switches | Completion, error, aborted, blocked, token limit, approval, question, plan review |
| Per-event delivery | OS default, keep in the DSH attention list, or timed removal |
| Permission and test | Explicit permission request and a test using **saved** preferences |

Default: completions/errors use system-controlled delivery; approvals/questions stay in the DSH attention list. Settings use explicit **Save**, with English/Turkish controls. Other completion kinds and plan-review alerts are initially off.

A completion can look like:

```text
My plugin project
Completed · 1m 5s
```

The macOS **application name/icon remains DeepSeek Harness**. It is a separate field from the configurable notification title.

## Important: “persistent” on macOS

**No plugin setting here guarantees a sticky native macOS banner.** Apple lets the user choose banners versus dismissal-required alerts per application in System Settings. Electron's `requireInteraction` is only a best-effort request; its macOS backend does not apply the timeout setting as a per-notification alert style.

The delivery choices intentionally mean different things:

- **OS-controlled:** no plugin close timer. macOS permissions, Focus and notification settings control presentation.
- **Keep in DSH attention list:** retain bounded metadata inside DSH until acknowledged, a known pending request resolves, or its observed session is removed. A best-effort interaction request is also sent to the OS. The **DSH list**, not the native banner, is the persistence mechanism.
- **Auto-remove after N seconds:** call `Notification.close()` after 1–3600 seconds while the renderer survives. **This also removes the entry from Notification Center; it is not just a banner-duration setting.** Sleep/background throttling can delay timers.

Acknowledging a record **never approves a tool, answers a question or accepts a plan**. Clicking a native notification focuses the application; it does not automatically select or control a chat.

On startup/reconnect, existing requests seed the attention list without replaying historical native popups. A first request in an already-running startup session may therefore appear only in the list until fresh activity is observed. Missing initial pending data does not erase saved attention. Still-pending requests can reappear after reconnect/reload even if previously acknowledged; this is an attention aid, not an authoritative workflow ledger.

## Install

Target: **macOS desktop DeepSeek Harness**, developed against installed **DSH 0.2.1-rc.3** contracts. Native delivery is deliberately disabled in ordinary browsers and non-macOS renderers. The settings/attention UI remains available there; cross-device synchronization is not provided.

### Local or reviewed source

```sh
git clone https://github.com/eklekmek07/dsh-macos-notifications.git
cd dsh-macos-notifications
# Check out the reviewed implementation commit/PR branch before installing.
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
dsh plugin --profile desktop add /absolute/path/to/dsh-macos-notifications
```

For a package-manager installation, use an archive or Git URL pinned to a **reviewed implementation commit**. The package includes built Host/Client modules; no install lifecycle script is required. During the initial PR, `main` may contain only the repository bootstrap until the feature PR is merged.

Disable/uninstall other notification plugins first to avoid duplicate popups. In particular, unrelated packages also use the name `dsh-notification`; this package is distinctly named **`dsh-macos-notifications`**. Back up your profile and preserve unrelated changes.

Then fully quit/reopen DSH, open its **own desktop window**, request notification permission and send a test from Settings. A localhost page in Chrome/Safari is **not** the DSH renderer. No service worker or closed-window/background-delivery guarantee is provided.

### Host configuration

The bundle mounts `macos-notifications`. The only Host bound is the authenticated UI projection budget:

```yaml
- id: macos-notifications
  name: dsh-macos-notifications
  config:
    maxPreviewChars: 400 # 1–1000; preview display is separately opt-in
```

All user-facing presentation and per-event policies live in the in-app panel. They are stored per renderer in localStorage, not written into model prompts or session logs.

## Privacy and security boundaries

- No webhooks, analytics, telemetry, remote push, shell commands or model-facing tools.
- No raw Electron/IPC access, signed-app modifications, permission bypasses or automatic tool approvals.
- The Host folds committed session events into the last turn's reason, elapsed duration and a bounded text preview. No tool arguments, environment variables, full logs or reasoning blocks are intentionally projected.
- Preview display is **opt-in**, but the bounded preview projection is still sent to the authenticated DSH UI. This is not an additional data-access boundary.
- Chat titles and previews can appear on the lock screen. Use **simple mode** and review macOS preview settings for sensitive work.
- Attention storage holds at most **50 metadata records** (chat title, session identity, event kind, time), never reply snippets or tool arguments. Metadata is not encrypted. Use a trusted profile.
- Native references are capped at 64; timers/listeners are cleaned on unload. Storage failure is surfaced in settings and may prevent persistence.

## Development and validation

Requires Node.js 22+ and pnpm. No sibling DSH checkout or absolute developer paths are required.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

Source is under `src/`; `pnpm build` produces the committed `lib/` artifacts using esbuild. React is supplied by DSH at runtime. The Host dependencies are pinned and included by the package manager.

Tests cover preference validation, preview privacy, duration folding, real rc3 `uiSession.sessionStatus` shapes, request keys, delayed hydration, reconnect/deduplication, per-event lifetimes, error/storage handling, bounded queues, both settings slots, and English/Turkish SSR accessibility/escaping.

**Validation limits:** automated native behavior uses mocks; the settings panel also has server-rendered tests. An isolated interactive browser was unavailable during initial development. Actual visual integration, macOS banner/icon delivery and multi-window behavior must be manually checked; passing tests do not prove them. Only one renderer/window is assumed; opening multiple DSH desktop windows can duplicate native requests.

Before release, check at least: chat-title/minimal modes; duration toggle; denied permission/Focus; completion vs approval/question; same-kind consecutive approvals; pending resolution; restart persistence; auto-removal's Notification Center effect; dark/light and narrow-window layout. The initial PR does not claim those manual checks have passed.

## Contributing

Bug reports and small, tested pull requests are welcome. Include DSH/macOS versions, the relevant saved setting and reproducible steps; redact chat content and credentials. Do not post profile dumps or session logs containing secrets.

For a private security report, use the maintainer's GitHub contact rather than posting exploitable details publicly. There is no security-response SLA or warranty.

## Origins and license

The projection/client-slot approach was informed by the MIT-licensed [omdsh-dev/dsh-notification](https://github.com/omdsh-dev/dsh-notification/tree/675aab9b43d5011738feb6185281596c0365ccba) and a local chat-title customization. This standalone package has its own name, preference model, controller, lifecycle manager, settings UI and tests. Original attribution is retained; it is not an upstream release or an official DeepSeek integration.

MIT; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Platform references

- [Electron: renderer notifications and macOS signing](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron Notification options and platform limits](https://www.electronjs.org/docs/latest/api/notification)
- [Electron 44.7.0 renderer timeout mapping](https://github.com/electron/electron/blob/v44.7.0/shell/browser/notifications/platform_notification_service.cc)
- [Electron 44.7.0 macOS notification backend](https://github.com/electron/electron/blob/v44.7.0/shell/browser/notifications/mac/cocoa_notification.mm)
- [Apple: user-controlled alert style](https://developer.apple.com/documentation/usernotifications/unnotificationsettings/alertstyle)
- [MDN: close removes the native entry](https://developer.mozilla.org/en-US/docs/Web/API/Notification/close)
