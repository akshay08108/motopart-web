"use client";

import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { availableAndroidUpdate } from "@/lib/android-updates";
import { apiUrl } from "@/lib/api-url";
import { appRole } from "@/lib/app-role";

const checkIntervalMs = 60_000;

export function AndroidUpdateBanner() {
  const [update, setUpdate] = useState<ReturnType<typeof availableAndroidUpdate>>(null);
  const [dismissedBuild, setDismissedBuild] = useState<number>();
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android" || !appRole) return;
    const role = appRole;
    let disposed = false;
    let activeRequest: AbortController | undefined;
    let lastCheck: number | undefined;

    const check = async () => {
      if (disposed || activeRequest || (lastCheck !== undefined && Date.now() - lastCheck < checkIntervalMs)) return;
      lastCheck = Date.now();
      const request = new AbortController();
      activeRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 6_000);
      try {
        const { build } = await CapacitorApp.getInfo();
        if (request.signal.aborted) return;
        const response = await fetch(apiUrl("/android-releases.json"), {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const next = availableAndroidUpdate(await response.json(), role, build);
        if (!request.signal.aborted) setUpdate(next);
      } catch {
        // Offline devices can check again when the app returns to the foreground.
      } finally {
        window.clearTimeout(timeout);
        activeRequest = undefined;
      }
    };

    void check();
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void check();
    });
    void listener.catch(() => undefined);

    return () => {
      disposed = true;
      activeRequest?.abort();
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, []);

  if (!update || dismissedBuild === update.versionCode) return null;
  return <aside className="px-android-update" aria-label="App update">
    <p role="status"><strong>Update available</strong> · {update.versionName}</p>
    <div>
      <button className="px-btn px-btn-outline" type="button" onClick={() => {
        setDownloadError(false);
        setDismissedBuild(update.versionCode);
      }}>Later</button>
      <button className="px-btn px-btn-red" type="button" onClick={() => {
        setDownloadError(false);
        void Browser.open({ url: update.downloadUrl }).catch(() => setDownloadError(true));
      }}>Download update</button>
    </div>
    {downloadError && <p role="alert">Couldn’t open the download. Try again.</p>}
  </aside>;
}
