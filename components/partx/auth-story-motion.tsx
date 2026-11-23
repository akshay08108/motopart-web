"use client";

import { useState } from "react";
import styles from "./auth-story.module.css";

export function AuthStoryMotion() {
  const [paused, setPaused] = useState(false);

  return <div className={styles.motionWrap} data-paused={paused}>
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.grid}/>
      <div className={styles.orbit}/>
      <div className={styles.gear}/>
      <div className={styles.hub}><span>Part<b>X</b></span><small>MADE TO MOVE</small></div>
      <div className={`${styles.part} ${styles.brakes}`}>
        <svg viewBox="0 0 110 75" fill="none" focusable="false">
          <path d="M14 25Q55-3 96 25L90 49Q55 29 20 49Z" fill="#252a32" stroke="#818a98" strokeWidth="2"/>
          <path d="M21 27Q55 6 89 27L85 39Q55 25 25 39Z" fill="#59616d" stroke="#a9b0bc"/>
          <path d="M14 30 6 33l4 12 9-3m77-12 8 3-4 12-9-3M40 13l-3 20m33-20 3 20" stroke="#adb4c0" strokeWidth="2"/>
          <path d="M24 58Q55 42 86 58l-4 11q-27-12-54 0Z" fill="#323943" stroke="#b6bdc9" strokeWidth="2"/>
          <path d="M35 58q20-7 40 0" stroke="#ed101c" strokeWidth="3"/>
        </svg>
        <span>Brakes</span>
      </div>
      <div className={`${styles.part} ${styles.suspension}`}>
        <svg viewBox="0 0 65 110" fill="none" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <circle cx="32" cy="9" r="6" stroke="#c6ccd5" strokeWidth="3"/><circle cx="32" cy="101" r="6" stroke="#c6ccd5" strokeWidth="3"/>
          <path d="M32 15v13m0 56v11" stroke="#aeb6c2" strokeWidth="5"/>
          <path d="M25 28h14v56H25Z" fill="#343c47" stroke="#9aa5b5" strokeWidth="2"/>
          <path d="m19 29 27 10-27 10 27 10-27 10 27 10M18 25h29M18 84h29" stroke="#ee2635" strokeWidth="4"/>
        </svg>
        <span>Suspension</span>
      </div>
      <div className={`${styles.part} ${styles.filter}`}>
        <svg viewBox="0 0 80 90" fill="none" strokeLinejoin="round" focusable="false">
          <path d="M16 21q24-13 48 0v50q-24 16-48 0Z" fill="#323c48" stroke="#aeb8c6" strokeWidth="2"/>
          <ellipse cx="40" cy="21" rx="24" ry="9" fill="#596370" stroke="#cad0d8" strokeWidth="2"/>
          <ellipse cx="40" cy="21" rx="8" ry="3" fill="#15191f"/>
          <path d="M17 37q23 13 46 0v20q-23 14-46 0Z" fill="#d81424"/>
          <path d="M26 43q14 5 28 0M31 65v8m18-8v8" stroke="#e2e6ec" strokeWidth="2"/>
        </svg>
        <span>Filters</span>
      </div>
      <svg className={styles.route} viewBox="0 0 520 70" preserveAspectRatio="none" fill="none" focusable="false">
        <path d="M26 34h468" stroke="#48505b" strokeWidth="1" strokeDasharray="3 7"/>
        <path className={styles.routeFlow} d="M26 34h468" stroke="#f52937" strokeWidth="2" strokeDasharray="30 438"/>
        <circle cx="26" cy="34" r="5" fill="#ed101c"/><circle cx="260" cy="34" r="5" fill="#ed101c"/><circle cx="494" cy="34" r="5" fill="#ed101c"/>
      </svg>
      <div className={styles.routeLabels}><span>Your vehicle</span><span>Your store</span><span>Your door</span></div>
    </div>
    <button type="button" className={styles.motionControl} onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{paused ? "Play motion" : "Pause motion"}
    </button>
  </div>;
}
