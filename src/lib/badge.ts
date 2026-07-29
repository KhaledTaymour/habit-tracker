/** App icon badge. Installed PWAs only: Android/desktop Chrome & Edge, iOS 16.4+.
 *  A no-op elsewhere — never throws, so callers don't need to guard. */
export async function setBadge(count: number): Promise<void> {
  try {
    if (count > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(count)
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
  } catch {
    // Permission or platform refusal. A missing badge is not worth an error path.
  }
}
