# Run Fable+ on your phone

Both options below need the app at a public URL first. The fastest is the free
one‑click deploy (Step 1). Then pick **A** (no app store — recommended) or **B**
(Expo Go).

---

## Step 1 — Get a public URL (free, ~3 min)

1. Make sure this repo is on GitHub (your branch already is).
2. Go to **https://render.com** → sign up (free) → **New ▸ Blueprint**.
3. Connect this repository and pick the branch. Render reads `render.yaml`.
4. Click **Apply**. After it builds you'll get a URL like
   **`https://fableplus.onrender.com`**.

That single service runs the API *and* serves the app. It auto‑seeds 6 demo
providers, and sign‑in codes are shown on screen (sandbox mode) so you can log in
on the phone with no email/SMS.

> Free Render services sleep when idle, so the first open after a while takes ~30s
> to wake. That's normal for the free tier.

---

## Option A — Install as an app (no app store needed) ✅ recommended

The app is a **PWA**, so your phone can install it straight from the browser:

- **iPhone (Safari):** open your Render URL → tap **Share** → **Add to Home Screen**.
- **Android (Chrome):** open your Render URL → menu **⋮** → **Install app** /
  **Add to Home screen**.

You'll get a Fable+ icon that launches full‑screen, just like a native app.

---

## Option B — Open it in Expo Go (paste‑and‑run)

1. Install **Expo Go** from the App Store / Google Play.
2. On a computer, go to **https://snack.expo.dev**.
3. Replace the contents of `App.js` with the code below, and set `APP_URL` to your
   Render URL from Step 1.
4. In Snack, open the **Add dependency** box and add **`react-native-webview`**.
5. On the right, choose **My Device**, then scan the QR code with **Expo Go**.

```jsx
import { useRef, useState } from 'react';
import { SafeAreaView, ActivityIndicator, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

// 👇 paste your Render URL here
const APP_URL = 'https://YOUR-APP.onrender.com';

export default function App() {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={ref}
        source={{ uri: APP_URL }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        originWhitelist={['*']}
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        style={styles.web}
      />
      {loading && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#3C6A75" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F4F4' },
  web: { flex: 1, backgroundColor: '#F2F4F4' },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
```

(The repo's `expo-shell/` folder is the same shell as a full Expo project if you'd
rather run it from a computer with `npx expo start`.)

---

## Signing in on the phone
Tap **Profile**, enter any email or mobile, tap **Send code** — the 6‑digit code is
shown on screen (sandbox mode). Enter it to sign in, then browse, book, manage your
garage, etc. To sign in as a demo provider use `jamies-mobile-valet@provider.fableplus`.
