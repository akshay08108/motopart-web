"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { appRole } from "@/lib/app-role";
import styles from "./opening-animation.module.css";

export function OpeningAnimation({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeTimer = window.setTimeout(() => setClosing(true), reducedMotion ? 0 : 1100);
    const finishTimer = window.setTimeout(() => setVisible(false), reducedMotion ? 0 : 1400);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  return <>
    <div inert={visible} aria-hidden={visible ? true : undefined}>{children}</div>
    {visible && <div className={`${styles.splash} ${closing ? styles.closing : ""}`}>
      <div className={styles.scene} role="status" aria-label="Opening PartX">
        <div className={styles.gear} aria-hidden="true"/>
        <div className={styles.signature} aria-hidden="true">
          <div className={styles.brand}>
            <Image src="/brand/partx-dark.png" alt="" width={76} height={76} priority className={styles.mark}/>
            <span className={styles.wordmark}>Part<b>X</b></span>
          </div>
          {(appRole === "seller" || appRole === "rider") && <small className={styles.role}>{appRole}</small>}
          <p className={styles.tagline}>The right part. The first time.</p>
          <div className={styles.accent}/>
        </div>
      </div>
      <button type="button" className={styles.skip} onClick={() => setVisible(false)}>Skip intro <span aria-hidden="true">↗</span></button>
    </div>}
  </>;
}
