"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

import Earth from "./Earth";
import Satellite from "./Satellite";
import ScanPatch from "./ScanPatch";
import EvidencePanels from "./EvidencePanels";
import DataTrace from "./DataTrace";
import Starfield from "./Starfield";
import Nebula from "./Nebula";
import CameraRig from "./CameraRig";
import GlobeSystem from "./GlobeSystem";
import { useAppearanceStore } from "@/hooks/useAppearanceStore";
import { themes } from "@/lib/theme";

/**
 * Keeps the renderer's clear colour and scene background in sync with the
 * theme store. `onCreated` only fires once, at first paint — setting the
 * clear colour there is why toggling light/dark updated every DOM element
 * (plain CSS variables, reactive) but left the canvas showing the old
 * background until a full reload re-ran `onCreated`. This runs on every
 * mode change instead.
 */
function SceneBackground({ color }: { color: THREE.Color }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    gl.setClearColor(color, 1);
    scene.background = color;
  }, [gl, scene, color]);

  return null;
}

export default function HeroScene() {
  const mode = useAppearanceStore((s) => s.mode);
  const t = themes[mode];
  const clearColor = useMemo(() => new THREE.Color(t.background), [t.background]);

  return (
    <Canvas
      className="cursor-grab active:cursor-grabbing"
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      camera={{ position: [0, 0.8, 5.45], fov: 42, near: 0.1, far: 200 }}
      onCreated={({ scene }) => {
        scene.fog = null;
      }}
    >
      <SceneBackground color={clearColor} />
      <CameraRig />

      {/* Distant sun key light — single hard source, as in orbit. */}
      <directionalLight position={[5, 2, 3]} intensity={2.4} color="#fff6e8" />
      {/* Faint fill so the night side isn't pure black. */}
      <ambientLight intensity={0.12} color={t.atmosphere} />

      {t.nebula && <Nebula />}
      <Starfield />

      {/*
        Everything that belongs to the planet rides inside GlobeSystem, so a
        drag turns the globe, its orbit ring, the satellite and the scan
        geometry together as one body.

        Only <Earth /> loads assets (four texture files via useLoader), so
        only it gets a Suspense boundary. With all six under one shared
        boundary React kept the ENTIRE subtree unmounted — stars, satellite,
        orbit and the floating panels, none of which await anything — until
        Earth's textures finished, blanking the scene on every load.
      */}
      <GlobeSystem>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        <ScanPatch />
        <Satellite />
        <DataTrace />
      </GlobeSystem>

      <EvidencePanels />

      {/*
        multisampling is not optional here. Once a post-processing composer
        is in the tree, the scene renders into the composer's own render
        target and the <Canvas gl={{ antialias: true }}> setting above no
        longer applies to it — so every edge (the globe's limb, the orbit
        dashes, the satellite's panels) was being drawn with no MSAA at
        all, which is why zooming in made things look rougher rather than
        clearer. This restores it on the pass that actually renders.
      */}
      <EffectComposer enableNormalPass={false} multisampling={4}>
        {/*
          The threshold has to sit above the background luminance or the
          backdrop blooms into a full-frame haze. On the cream page that
          means pushing it near 1.0; in deep space it can drop far enough
          to let stars and the atmospheric limb actually glow.
        */}
        <Bloom
          intensity={mode === "dark" ? 0.85 : 0.55}
          luminanceThreshold={t.bloomThreshold}
          luminanceSmoothing={0.12}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.28} darkness={t.vignette} />
      </EffectComposer>
    </Canvas>
  );
}
