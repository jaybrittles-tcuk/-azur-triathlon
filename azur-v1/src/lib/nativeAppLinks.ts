import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import { resolveAzurCompletionLink } from './nativeLinkRouting.mjs';

/** Native-only listener; browser routing remains untouched. */
export async function registerAzurAppLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await App.addListener('appUrlOpen', async ({url}) => {
    const path = resolveAzurCompletionLink(url);
    if (!path) return;
    await Browser.close().catch(() => undefined);
    window.location.assign(path);
  });
}
