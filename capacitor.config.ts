import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fableplus.app",
  appName: "Fable+",
  webDir: "dist",
  backgroundColor: "#F2F4F4",
  // For on-device LIVE RELOAD against the dev server, set CAP_SERVER_URL to your
  // machine's LAN URL (e.g. http://192.168.1.20:5173) and rebuild. Leave unset for
  // a packaged build that loads the bundled dist/.
  server: process.env.CAP_SERVER_URL
    ? { url: process.env.CAP_SERVER_URL, cleartext: true }
    : { androidScheme: "https" },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#3C6A75",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
