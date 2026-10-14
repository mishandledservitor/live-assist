/** A Google Meet call URL (`/abc-defg-hij`); the Meet landing page is not a call (contracts/platform-adapter.md). */
export function isMeetCallUrl(url: URL | string): boolean {
  let u: URL;
  try {
    u = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname === 'meet.google.com' &&
    /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/.test(u.pathname)
  );
}
