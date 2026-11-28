"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { accountPhotoFileTypes } from "@/lib/account-photos";
import { Icon } from "./icons";
import styles from "./photo-controls.module.css";

export function UploadedPhoto({ url, alt = "", fallback }: { url?: string; alt?: string; fallback: React.ReactNode }) {
  const [failedUrl, setFailedUrl] = useState("");
  return <>{url && url !== failedUrl
    ? <Image className={styles.photo} src={url} alt={alt} width={256} height={256} unoptimized onError={() => setFailedUrl(url)}/>
    : fallback}</>;
}

export function PhotoControls({ label, hasPhoto, disabled = false, save }: {
  label: string;
  hasPhoto: boolean;
  disabled?: boolean;
  save: (image: File | null) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = async (file: File | null) => {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await save(file);
      setMessage(file ? "Photo saved." : "Photo removed.");
    } catch (reason) {
      const detail = reason instanceof Error && !("code" in reason) ? reason.message : "Could not save the photo. Try again.";
      setError(detail);
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.controls}>
    <input ref={input} type="file" hidden accept={accountPhotoFileTypes} onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void update(file);
    }}/>
    <div className={styles.actions}>
      <button type="button" disabled={busy || disabled} onClick={() => input.current?.click()}>
        <Icon name="upload"/>{busy ? "Saving photo…" : `${hasPhoto ? "Change" : "Add"} ${label}`}
      </button>
      {hasPhoto && <button type="button" disabled={busy || disabled} onClick={() => void update(null)}>Remove {label}</button>}
    </div>
    {error && <small role="alert" className={styles.error}>{error}</small>}
    {message && <small role="status">{message}</small>}
  </div>;
}
