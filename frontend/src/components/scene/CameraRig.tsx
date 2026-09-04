"use client";

import { useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const BASE_DISTANCE = 5.45;
const BASE_HEIGHT = 0.8;

/**
 * The globe is user-controllable: drag to orbit it, scroll/pinch to zoom.
 * OrbitControls' own autoRotate drives the idle "revolving" motion and
 * yields to the user the moment they grab it, then resumes once they let
 * go — so it never fights a hand on the wheel.
 *
 * Positive-X target keeps the composition intact (globe left-of-centre,
 * headline column on the right) as the default framing to return to.
 */
export default function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    // Camera rotation is off on purpose: dragging spins the planet on its
    // own axis (see useGlobeDrag in Earth.tsx) rather than swinging the
    // camera around it, so the globe stays parked in its corner of the
    // layout instead of sliding across the headline. The look-at point sits
    // to the RIGHT of the globe, which is what pushes the globe itself to
    // the left of frame and leaves the right side clear for the copy.
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[1.45, -0.05, 0]}
      enablePan={false}
      enableRotate={false}
      enableZoom
      minDistance={3.4}
      maxDistance={8.5}
      zoomSpeed={0.7}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

/** Initial camera pose, applied once via <Canvas camera={...}> in HeroScene. */
export const INITIAL_CAMERA_POSITION: [number, number, number] = [
  0,
  BASE_HEIGHT,
  BASE_DISTANCE,
];
