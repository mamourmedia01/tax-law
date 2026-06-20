# Fable+ — Expo Go shell

Navigate the **whole Fable+ platform from Expo Go** on your own phone. This is a tiny Expo
(React Native) app that loads the Fable+ web app in a native `WebView` — so there's no separate
React Native rewrite to maintain, and every feature you've built is available immediately.

## 1. Point it at a running Fable+ web app
The shell loads a URL. Pick one:

- **Easiest — a deployed URL:** deploy the stack (see `../DEPLOY.md`) and use e.g.
  `https://app.fableplus.co.uk`.
- **Local dev (no deploy):** run the API + web on your computer and expose the web over your
  network so your phone can reach it:
  ```bash
  # terminal 1 — API
  cd ../server && npm install && npm run dev          # http://localhost:8787
  # terminal 2 — web on your LAN (note the Network URL it prints)
  cd .. && npm run dev -- --host                      # e.g. http://192.168.1.20:5173
  ```
  Your phone must be on the same Wi-Fi. (Or use a tunnel: `npx localtunnel --port 5173`.)

## 2. Run the shell in Expo Go
```bash
cd expo-shell
npm install
EXPO_PUBLIC_APP_URL="http://192.168.1.20:5173" npx expo start   # use your URL from step 1
```
- Install **Expo Go** on your phone (App Store / Play Store).
- **Scan the QR** shown in the terminal with Expo Go (Android) or the Camera app (iOS).
- The Fable+ platform opens in a native app shell — sign in, book, browse, dashboard, everything.

## Notes
- `react-native-webview` is supported in Expo Go, so no custom dev client is needed.
- Android hardware-back navigates the in-app history; pull-to-refresh is wired.
- Session uses the same cookie/token flow as the web (`sharedCookiesEnabled`).
- For a true standalone store build later, use the Capacitor projects in `../android` / `../ios`
  (see `../MOBILE.md`) — the Expo shell is for fast on-device navigation via Expo Go.
