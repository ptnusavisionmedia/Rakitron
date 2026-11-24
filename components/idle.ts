"use client";

import { useCallback } from "react";
import { useThree } from "@react-three/fiber";

// Adegan dirender sesuai kebutuhan (frameloop="demand"). Animasi hiasan yang tak pernah berhenti
// (cincin, panah, denyut) memakai satu jam bersama dengan batas 20 fps, dan berhenti total ketika
// adegan tidak terlihat. Gerakan yang dipicu anak (geser sendi, seret, animasi pasang) tetap penuh 60 fps.
const IDLE_INTERVAL = 1000 / 20;
let idleOnly = false;
let idleFrames = 0;

/**
 * Peta bayangan mahal (menggandakan draw call). Frame yang hanya diminta animasi hiasan
 * memperbarui bayangan setiap 6 frame; frame karena gerakan nyata selalu memperbaruinya.
 */
export function shadowsNeedUpdate() {
  const idle = idleOnly;
  idleOnly = false;
  if (!idle || performance.now() < motionUntil) return true;
  return ++idleFrames % 6 === 0;
}

let motionUntil = 0;
/** Panggil dari animasi nyata (komponen meluncur, jari bergerak, status berubah) agar bayangan ikut bergerak. */
export function noteMotion() { motionUntil = performance.now() + 120; }
let lastIdle = 0;
let visible = true;
let reduced: boolean | null = null;

let wake: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function setSceneVisible(value: boolean) {
  visible = value;
  if (value) wake?.(); // lanjutkan animasi hiasan setelah adegan terlihat lagi
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  if (reduced === null) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced = query.matches;
    query.addEventListener("change", event => { reduced = event.matches; });
  }
  return reduced;
}

/** Meminta frame berikutnya untuk animasi hiasan, paling sering 20 kali per detik. */
export function useIdleInvalidate() {
  const invalidate = useThree(state => state.invalidate);
  return useCallback(() => {
    wake = invalidate;
    if (!visible) return;
    const wait = IDLE_INTERVAL - (performance.now() - lastIdle);
    if (wait > 0) {
      // Panggilan terlalu cepat: jadwalkan satu frame di sisa waktu agar rantai animasi tidak putus.
      timer ??= setTimeout(() => { timer = null; lastIdle = performance.now(); if (visible) { idleOnly = true; invalidate(); } }, wait);
      return;
    }
    lastIdle = performance.now();
    idleOnly = true;
    invalidate();
  }, [invalidate]);
}
