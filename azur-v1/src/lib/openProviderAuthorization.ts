import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** Opens only HTTPS provider consent pages outside the native WebView. */
export async function openProviderAuthorization(authorizationUrl: string): Promise<void> {
  const parsed = new URL(authorizationUrl);
  if (parsed.protocol !== 'https:' || !['connect.garmin.com','intervals.icu','www.intervals.icu'].includes(parsed.hostname)) {
    throw new Error('Unexpected authorisation destination.');
  }
  if (Capacitor.isNativePlatform()) {
    // Until universal links are configured, callback lands on AZUR website.
    await Browser.open({url:parsed.toString()});
  } else {
    window.location.assign(parsed.toString());
  }
}
