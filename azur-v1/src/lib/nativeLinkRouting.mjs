/** Strict, secret-free OAuth completion link routing. No tokens or codes permitted. */
export function resolveAzurCompletionLink(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'azur-triathlon.vercel.app' ||
      url.port || url.username || url.password || url.hash) return null;
  if (url.pathname === '/onboarding' && !url.search) return '/onboarding';
  if (url.pathname !== '/') return null;
  if (!url.search) return '/';
  if (url.searchParams.size !== 1) return null;
  if (url.searchParams.get('garmin') === 'connected') return '/?garmin=connected';
  if (url.searchParams.get('intervals') === 'connected') return '/?intervals=connected';
  return null;
}
