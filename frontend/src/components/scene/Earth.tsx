"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  extend,
  useFrame,
  useLoader,
  useThree,
  type ThreeElement,
} from "@react-three/fiber";
import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import {
  earthVertexShader,
  earthFragmentShader,
  cloudsVertexShader,
  cloudsFragmentShader,
} from "@/lib/shaders/earth";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "@/lib/shaders/atmosphere";
import { GLOBE_STYLES, useAppearanceStore } from "@/hooks/useAppearanceStore";
import { useEarthTextures } from "@/hooks/useEarthTextures";
import { earthMeshRef } from "@/lib/earthMeshRef";
import { palette, themes, timing } from "@/lib/theme";

const EarthMaterial = shaderMaterial(
  {
    uLightDir: new THREE.Vector3(1, 0.4, 0.6),
    uAtmosphere: new THREE.Color(palette.atmosphereBlue),
    uOceanTint: new THREE.Color(palette.oceanTint),
    uOceanShallowTint: new THREE.Color(palette.oceanShallowTint),
    uGridColor: new THREE.Color(palette.cyan),
    uVariant: 0,
    uDayMap: null as THREE.Texture | null,
    uNightMap: null as THREE.Texture | null,
    uSpecularMap: null as THREE.Texture | null,
  },
  earthVertexShader,
  earthFragmentShader
);

const CloudsMaterial = shaderMaterial(
  {
    uLightDir: new THREE.Vector3(1, 0.4, 0.6),
    uCloudMap: null as THREE.Texture | null,
  },
  cloudsVertexShader,
  cloudsFragmentShader
);

const AtmosphereMaterial = shaderMaterial(
  {
    uColor: new THREE.Color(palette.atmosphereBlue),
    uIntensity: 0.85,
    uLightDir: new THREE.Vector3(1, 0.4, 0.6).normalize(),
  },
  atmosphereVertexShader,
  atmosphereFragmentShader
);

extend({ EarthMaterial, CloudsMaterial, AtmosphereMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    earthMaterial: ThreeElement<typeof EarthMaterial>;
    cloudsMaterial: ThreeElement<typeof CloudsMaterial>;
    atmosphereMaterial: ThreeElement<typeof AtmosphereMaterial>;
  }
}

const TEXTURE_URLS: string[] = [
  "/textures/earth/earth_day.jpg",
  "/textures/earth/earth_lights.png",
  "/textures/earth/earth_specular.jpg",
  "/textures/earth/earth_clouds.png",
];

export default function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<InstanceType<typeof EarthMaterial>>(null);

  const mode = useAppearanceStore((s) => s.mode);
  const globeStyle = useAppearanceStore((s) => s.globeStyle);
  const t = themes[mode];

  const variant = useMemo(
    () => GLOBE_STYLES.find((s) => s.id === globeStyle)?.variant ?? 0,
    [globeStyle]
  );

  // Clouds belong to the photoreal treatment only — the other two are
  // deliberately cloud-free so the surface data stays readable.
  const showClouds = globeStyle === "blue-marble";

  const rotationSpeed = useMemo(
    () => (Math.PI * 2) / timing.earthRotationSeconds,
    []
  );

  // Real NASA Blue Marble-derived imagery (the same assets three.js's own
  // official examples ship) rather than procedural noise, so the globe
  // reads as an actual planet instead of a stylised abstraction of one.
  // TEXTURE_URLS is a stable module-level reference (not a fresh array
  // literal per render) — useLoader suspends per call, and a new array
  // identity each render would re-trigger Suspense on every re-render.
  const [dayMap, nightMap, specularMap, cloudMap] = useLoader(
    THREE.TextureLoader,
    TEXTURE_URLS
  );

  // Anisotropic filtering is what keeps the surface sharp when the camera
  // zooms in: almost every texel on a sphere is viewed at a glancing angle,
  // and that's exactly the case plain mipmapping over-blurs. A hardcoded 4
  // left most of the GPU's capability (typically 16) unused, so detail
  // smeared as soon as you scrolled in. Ask the renderer for its maximum
  // instead of guessing a number.
  const gl = useThree((s) => s.gl);
  useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    [dayMap, nightMap, specularMap, cloudMap].forEach((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
    });
  }, [dayMap, nightMap, specularMap, cloudMap, gl]);

  // Publish the real day/ocean-mask textures once loaded, so the scan
  // patch can sample actual geography under the satellite instead of
  // improvising procedural terrain unrelated to what's really there.
  const setEarthTextures = useEarthTextures((s) => s.setEarthTextures);
  useEffect(() => {
    setEarthTextures(dayMap, specularMap);
  }, [dayMap, specularMap, setEarthTextures]);

  // Publish the actual mesh (not just its rotation angle) so the scan
  // patch can read its real matrixWorld — see earthMeshRef.ts for why.
  useEffect(() => {
    earthMeshRef.current = earthRef.current;
    return () => {
      earthMeshRef.current = null;
    };
  }, []);

  // Only the planet's own idle rotation lives here. User drag is applied by
  // <GlobeSystem>, one level up, so the orbit ring and satellite turn with
  // the planet instead of the globe spinning out from under them.
  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += rotationSpeed * delta;
    }
    if (cloudsRef.current) {
      // Clouds drift slightly faster than the surface for cheap parallax.
      cloudsRef.current.rotation.y += rotationSpeed * delta * 1.35;
    }
  });

  return (
    <group>
      <mesh ref={earthRef}>
        {/* 160 segments, not 96: at the zoomed-in end of the camera range
            the silhouette and terminator on a 96-segment sphere read as
            visibly faceted rather than curved. */}
        <sphereGeometry args={[1, 160, 160]} />
        <earthMaterial
          ref={materialRef}
          uDayMap={dayMap}
          uNightMap={nightMap}
          uSpecularMap={specularMap}
          uVariant={variant}
          uAtmosphere={new THREE.Color(t.atmosphere)}
          uGridColor={new THREE.Color(t.grid)}
        />
      </mesh>

      {showClouds && (
        <mesh ref={cloudsRef} scale={1.006}>
          {/* 160 segments, not 96: at the zoomed-in end of the camera range
            the silhouette and terminator on a 96-segment sphere read as
            visibly faceted rather than curved. */}
        <sphereGeometry args={[1, 160, 160]} />
          <cloudsMaterial
            uCloudMap={cloudMap}
            transparent
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      <mesh scale={1.022}>
        <sphereGeometry args={[1, 64, 64]} />
        {/*
          Normal blending on light backgrounds, additive in dark mode:
          additive glow reads as a soft atmospheric limb against space, but
          against the cream page it just adds white and hazes over.
        */}
        <atmosphereMaterial
          uColor={new THREE.Color(t.atmosphere)}
          uIntensity={t.atmosphereIntensity}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={
            mode === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending
          }
        />
      </mesh>
    </group>
  );
}
