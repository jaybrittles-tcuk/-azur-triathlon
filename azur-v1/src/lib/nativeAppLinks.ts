import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const host = 'azur-triathlon.vercel.app';
/** Reject arbitrary schemes, hosts, OAuth codes and user-controlled navigation paths. */
export function resolveAzurAppLink(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) return null;
  // Never ingest auth code/token fragments from arbitrary external links.
  if (url.searchParams.has('code') || url.searchParams.has('access_token') ||
      url.searchParams.has('refresh_token') || url.hash) return null;
  if (url.pathname === '/onboarding' || url.pathname === '/') return url.pathname;
  return null;
}
/** Native-only listener; browser routing remains untouched. */
export async function registerAzurAppLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await App.addListener('appUrlOpen', async ({url}) => {
    const path = resolveAzurAppLink(url);
    if (!path) return;
    await Browser.close().catch(() => undefined);
    if (window.location.pathname !== path) window.location.assign(path);
  });
}
