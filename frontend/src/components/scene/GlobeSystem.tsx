"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
  globeDrag,
  stepGlobeDrag,
  useGlobeDragListeners,
} from "@/lib/globeDrag";

/**
 * Everything that belongs to the planet — the globe, its orbit ring, the
 * satellite, the scan patch and the data trace — rides inside this group,
 * so a drag turns the whole system as one rigid body instead of spinning
 * the Earth out from under a stationary orbit.
 */
export default function GlobeSystem({ children }: { children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useGlobeDragListeners();

  useFrame((_, delta) => {
    stepGlobeDrag();

    const g = groupRef.current;
    if (!g) return;

    g.rotation.y = globeDrag.spin;
    // Ease the tilt so a flick doesn't snap the axis over.
    g.rotation.x += (globeDrag.tilt - g.rotation.x) * Math.min(1, delta * 6);
  });

  return <group ref={groupRef}>{children}</group>;
}
