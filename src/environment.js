/** Native identity requires the actual macOS DSH top-level renderer, not localhost in Chrome. */
export function isMacDesktop({ location, navigator, desktop, topLevel = true } = {}) {
  try {
    return topLevel && location?.protocol === 'dsh-app:' && location?.hostname === 'app'
      && /Mac/i.test(navigator?.platform ?? navigator?.userAgent ?? '')
      && desktop?.protocolVersion === 1 && typeof desktop.deviceInfo === 'function'
  } catch { return false }
}
