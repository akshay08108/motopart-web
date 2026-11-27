"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { appendPostalDetails, type PostalOffice } from "@/lib/postal-address";

export function PincodeAutofill({ address, onApply }: { address: string; onApply: (address: string) => void }) {
  const [pin, setPin] = useState(() => address.match(/\b[1-9]\d{5}\b/)?.[0] ?? "");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; offices?: PostalOffice[]; error?: string }>();
  const [office, setOffice] = useState("");
  const suffix = useRef("");
  const key = `${pin}:${attempt}`;
  const current = result?.key === key ? result : undefined;
  const valid = /^[1-9]\d{5}$/.test(pin);
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pin)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(apiUrl(`/api/locations/pincode?pin=${pin}`), { signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
        .then((body) => { if (!controller.signal.aborted) setResult({ key, offices: body.offices }); })
        .catch((reason) => { if (!controller.signal.aborted) setResult({ key, error: reason.message || "PIN lookup failed. Enter your address manually." }); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [pin, key]);
  const selected = current?.offices?.find((item) => `${item.name}|${item.district}|${item.state}` === office);
  return <div className="px-postal-autofill">
    <label>Indian PIN code<input aria-label="Indian PIN code" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pin} placeholder="e.g. 505325" onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 6)); setOffice(""); }}/></label>
    {valid && !current && <small role="status">Finding postal details…</small>}
    {current?.error && <p role="status">{current.error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></p>}
    {current?.offices?.length === 0 && <p role="status">No postal details found. Check the PIN or enter your address manually.</p>}
    {Boolean(current?.offices?.length) && <><label>Area / post office<select value={office} onChange={(event) => setOffice(event.target.value)}><option value="">Choose your area</option>{current!.offices!.map((item) => <option key={`${item.name}:${item.district}`} value={`${item.name}|${item.district}|${item.state}`}>{item.name} · {item.district}</option>)}</select></label><small>{(selected ?? current!.offices![0]).district}, {(selected ?? current!.offices![0]).state}</small><button className="px-btn px-btn-outline" type="button" disabled={!selected} onClick={() => {
      if (!selected) return;
      const next = appendPostalDetails(address, pin, selected, suffix.current);
      suffix.current = next.suffix;
      onApply(next.address);
    }}>Use postal details</button></>}
    <small>Keep your building, street and landmark in the full address. A PIN code does not set your map pin. <a href="https://searchpincode.in" target="_blank" rel="noreferrer">PIN Code Data powered by SearchPincode.in</a></small>
  </div>;
}
