import { isNative, loadToken } from "./native";

// Initialise native-only concerns once at startup. No-ops on the web.
export async function initNative(): Promise<void> {
  await loadToken(); // restore the saved session token before first render

  if (!isNative) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark }); // dark icons on our light canvas
  } catch {
    /* status bar unavailable */
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* no splash */
  }

  // Push notifications (FW33 on device). Registers and logs the token; the backend
  // would store it to deliver via APNs/FCM in place of the sandbox channel.
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
      PushNotifications.addListener("registration", (t) => console.log("[push] token", t.value));
    }
  } catch {
    /* push unavailable */
  }
}
