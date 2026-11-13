import type { CapacitorConfig } from "@capacitor/cli";

const androidApps = {
  customer: { appId: "com.partx.app", appName: "PartX" },
  seller: { appId: "com.partx.seller", appName: "PartX Seller" },
  rider: { appId: "com.partx.rider", appName: "PartX Rider" },
};
const role = process.env.PARTX_ANDROID_APP ?? "customer";
if (role !== "customer" && role !== "seller" && role !== "rider") {
  throw new Error("PARTX_ANDROID_APP must be customer, seller, or rider.");
}

const config: CapacitorConfig = {
  ...androidApps[role],
  webDir: "out",
  backgroundColor: "#0b0d11",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#0b0d11",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#0b0d11",
    },
  },
};

export default config;
