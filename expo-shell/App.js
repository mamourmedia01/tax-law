import { useRef, useState, useCallback, useEffect } from "react";
import { ActivityIndicator, BackHandler, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { StatusBar } from "expo-status-bar";

// The deployed (or tunnelled) Fable+ web app. Set EXPO_PUBLIC_APP_URL before `expo start`,
// e.g. EXPO_PUBLIC_APP_URL=https://app.fableplus.co.uk  (or your LAN/ngrok URL for local dev).
const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://app.fableplus.co.uk";

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Android hardware back → navigate the WebView history instead of closing the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        style={styles.web}
        originWhitelist={["*"]}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        sharedCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        // let tel:/mailto: and external links leave the WebView gracefully
        setSupportMultipleWindows={false}
      />
      {loading && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#3C6A75" />
        </View>
      )}
      {/* iOS pull-to-refresh fallback */}
      {Platform.OS === "ios" && (
        <ScrollView
          style={styles.hiddenScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F2F4F4" },
  web: { flex: 1, backgroundColor: "#F2F4F4" },
  loader: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  hiddenScroll: { position: "absolute", width: 0, height: 0 },
});
