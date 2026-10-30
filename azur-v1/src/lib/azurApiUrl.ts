import { Capacitor } from '@capacitor/core';
/**
 * Resolves AZUR's Vercel API endpoints in a browser or a Capacitor WebView.
 * Production web uses same-origin paths; native uses a configured HTTPS origin.
 * Never place secrets in VITE_ environment variables.
 */
export function azurApiUrl(path: string, native: boolean = Capacitor.isNativePlatform()): string {
  if (!path.startsWith('/api/')) throw new Error('AZUR API paths must start with /api/');
  if (!native) return path;
  const origin = import.meta.env.VITE_AZUR_API_ORIGIN;
  if (!origin || !/^https:\/\/[^/]+\/?$/.test(origin)) {
    throw new Error('Native AZUR API origin is not configured.');
  }
  return origin.replace(/\/$/, '') + path;
}
