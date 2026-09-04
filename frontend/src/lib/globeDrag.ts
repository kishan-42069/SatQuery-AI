"use client";

import { useEffect } from "react";

/**
 * Drag-to-spin state, shared by everything that should turn with the
 * planet: the Earth itself, the orbit ring, the satellite, the scan patch
 * and the data trace. It lives at module scope rather than in React state
 * because it is written on every pointer move and read on every frame —
 * routing that through a store would re-render the whole scene 60x/sec.
 *
 * Only user drag lives here. The planet's own idle rotation stays local to
 * <Earth />, so when nobody is touching it the globe turns beneath a fixed
 * orbit (which is what orbits actually do) instead of dragging the whole
 * satellite system around with it.
 */
export type GlobeDragState = {
  dragging: boolean;
  lastX: number;
  lastY: number;
  /** Accumulated yaw, radians. */
  spin: number;
  /** Accumulated pitch, radians, clamped to MAX_TILT. */
  tilt: number;
  velSpin: number;
  velTilt: number;
};

export const MAX_TILT = 0.62;

export const globeDrag: GlobeDragState = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  spin: 0,
  tilt: 0,
  velSpin: 0,
  velTilt: 0,
};

const SENSITIVITY = 0.0052;

export function clampTilt(v: number) {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, v));
}

/**
 * Attaches pointer handlers once, at the scene root.
 *
 * Listeners sit on `window` and gate on the event target being the canvas
 * rather than being bound to the renderer's DOM node — same behaviour, but
 * nothing here mutates the react-three-fiber renderer object, which the
 * React compiler (correctly) rejects as post-render mutation. The
 * grab/grabbing cursor is plain CSS on the <Canvas>.
 */
export function useGlobeDragListeners() {
  useEffect(() => {
    const s = globeDrag;

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      s.dragging = true;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.velSpin = 0;
      s.velTilt = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!s.dragging) return;
      const dx = (e.clientX - s.lastX) * SENSITIVITY;
      const dy = (e.clientY - s.lastY) * SENSITIVITY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.spin += dx;
      // Clamped so the system can be tipped to show the poles but never
      // rolled fully over.
      s.tilt = clampTilt(s.tilt + dy);
      s.velSpin = dx;
      s.velTilt = dy;
    };

    const onUp = () => {
      s.dragging = false;
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);
}

/**
 * Advances momentum for one frame. Call this from exactly one place (the
 * group that owns the drag transform) so the decay isn't applied twice.
 */
export function stepGlobeDrag() {
  const s = globeDrag;
  if (s.dragging) return;
  s.spin += s.velSpin;
  s.tilt = clampTilt(s.tilt + s.velTilt);
  s.velSpin *= 0.93;
  s.velTilt *= 0.93;
}
