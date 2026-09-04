"use client";

import { create } from "zustand";
import type * as THREE from "three";

/**
 * Publishes the real Earth day/ocean-mask textures once <Earth /> has
 * loaded them, so other scene components (the scan patch) can sample
 * actual geography instead of maintaining their own procedural stand-in.
 *
 * This is a store, not a plain module singleton, specifically so setting
 * it triggers a re-render: <ScanPatch /> renders before Earth's textures
 * resolve (that's the point of the Suspense split — it isn't blocked
 * waiting on them), so it needs to be notified when the real imagery
 * becomes available rather than reading it once at mount.
 */
interface EarthTextureStore {
  dayMap: THREE.Texture | null;
  specularMap: THREE.Texture | null;
  setEarthTextures: (dayMap: THREE.Texture, specularMap: THREE.Texture) => void;
}

export const useEarthTextures = create<EarthTextureStore>((set) => ({
  dayMap: null,
  specularMap: null,
  setEarthTextures: (dayMap, specularMap) => set({ dayMap, specularMap }),
}));
