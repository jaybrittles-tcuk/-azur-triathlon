import type { CapacitorConfig } from '@capacitor/cli';

// Development identifier. Confirm ownership before App Store Connect registration.
const config: CapacitorConfig = {
  appId: 'com.azurtriathlon.training',
  appName: 'AZUR Training',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: { contentInset: 'automatic' }
};

export default config;
