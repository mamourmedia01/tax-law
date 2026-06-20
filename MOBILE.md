# Fable+ — Native apps (Capacitor)

The same React/Vite app, packaged as **native iOS and Android apps** via Capacitor. No UI
rewrite — the web build (`dist/`) is loaded in a native WebView, with native APIs (push, camera,
geolocation, share, secure storage) available through plugins.

## What's already set up (committed)
- `capacitor.config.ts` — app id `com.fableplus.app`, name **Fable+**, `webDir: dist`.
- `android/` — the ready-to-open Android Studio project (icons + splash generated from the logo).
- Native-aware API client: on native it calls an **absolute** API base (`VITE_API_URL`) with a
  **bearer token** kept in secure Preferences; on web it stays same-origin with the httpOnly cookie.
- `src/lib/nativeBootstrap.ts` — status bar, splash hide, and push-notification registration.
- Backend accepts `Authorization: Bearer <token>` and returns a token on verify; CORS allows the
  Capacitor origins (`capacitor://localhost`, `https://localhost`).
- Plugins installed: App, StatusBar, SplashScreen, Preferences, Share, Geolocation, Camera,
  PushNotifications.

## Prerequisites
- **Android:** [Android Studio](https://developer.android.com/studio) + JDK 17 (any OS, free).
- **iOS:** a **Mac** with **Xcode** + CocoaPods, and an Apple Developer account ($99/yr) to ship.

## Build & run — Android
```bash
npm install
# point the app at your API (a reachable host, not localhost, for a real device):
echo "VITE_API_URL=https://api.fableplus.app" >> .env   # or your LAN IP for testing
npm run cap:android        # builds web, syncs, opens Android Studio
# in Android Studio: pick a device/emulator and press Run.
```
APK/AAB: **Build ▸ Generate Signed Bundle / APK** in Android Studio.

## Add & run — iOS (on a Mac)
```bash
npx cap add ios            # scaffolds ios/ (runs pod install — needs CocoaPods)
npm run cap:ios            # builds web, syncs, opens Xcode
# in Xcode: set your signing team, pick a device, press Run.
```

## On-device live reload (fast dev loop)
```bash
# 1) run the API and the Vite dev server, both reachable on your LAN
#    (start the API on :8787, then: npm run dev -- --host)
# 2) point Capacitor at your machine and run on the device:
export CAP_SERVER_URL=http://<your-LAN-IP>:5173
npm run cap:livereload:android
```

## Regenerating icons / splash
Source art lives in `assets/` (generated from the Fable+ mark). After changing it:
```bash
npm run cap:assets         # regenerates all densities for android (and ios if present)
```

## Native capabilities wired (mapped to features)
| Plugin | Used for |
|---|---|
| Push Notifications (APNs/FCM) | FW33 device push (replaces the sandbox channel on device) |
| Camera | FW30 KYC document capture, before/after photos |
| Geolocation | "near you" search / map |
| Share | branded share cards |
| Preferences | the native session token |
| StatusBar / SplashScreen | native chrome + teal splash |

> The web PWA still works unchanged from the same codebase — Capacitor is additive.

## Notes for production
- Host the API on HTTPS and set `VITE_API_URL` to it at build time.
- Register an APNs key (iOS) / FCM project (Android) and store device tokens server-side to deliver
  the FW33 notifications natively.
- `android/` is committed (minus build artifacts); `ios/` is generated on a Mac via `cap add ios`.
