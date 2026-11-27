"use client";
import { useEffect, useState } from "react";
import { deliveryCall } from "./rider";
import type { RoadRoute } from "./road-routing";

export function useRoadRoute(uid: string | undefined, input: Record<string, unknown> | null) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([uid, input, retry]);
  const [result, setResult] = useState<{ key: string; route?: RoadRoute; error?: string }>();
  const serialized = input ? JSON.stringify(input) : "";
  useEffect(() => {
    if (!uid || !serialized) return;
    let active = true;
    void deliveryCall<RoadRoute>("quotePartXRoute", JSON.parse(serialized))
      .then((route) => { if (active) setResult({ key, route }); })
      .catch((reason) => { if (active) setResult({ key, error: reason instanceof Error ? reason.message : "Road routing is unavailable." }); });
    return () => { active = false; };
  }, [uid, serialized, key]);
  const current = result?.key === key ? result : undefined;
  return { route: current?.route, error: current?.error, loading: Boolean(uid && input && !current), retry: () => setRetry((value) => value + 1) };
}
