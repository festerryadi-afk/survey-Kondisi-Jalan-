import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.go.mentawaikab.dpupr.surveijalan',
  appName: 'Survey Kondisi Jalan Kabupaten',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#020617',
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
