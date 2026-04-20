import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.com.coastpulse.transithub",
  appName: "CoastPulse Transit Atlas",
  webDir: "mobile/www",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    iosScheme: "https"
  }
};

export default config;
