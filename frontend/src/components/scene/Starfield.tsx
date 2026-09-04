"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

import { useAppearanceStore } from "@/hooks/useAppearanceStore";
import { themes } from "@/lib/theme";

/**
 * A deliberately non-uniform starfield: a few loose "clusters" plus a
 * sparse scatter, rather than an evenly-distributed procedural field —
 * closer to how a real long-exposure star photo reads.
 *
 * Two layers are drawn: a dense field of faint stars and a much sparser
 * set of bright ones. Within each layer every star also gets its OWN
 * size, brightness, colour temperature and twinkle phase. That per-star
 * variation is the thing that actually sells a starfield: a real sky has
 * a continuous magnitude distribution dominated by stars near the limit
 * of visibility, so drawing every star at one of two fixed sizes — which
 * is all THREE.PointsMaterial can do — reads as a scattering of
 * identical dots no matter how the sizes are tuned.
 */

/**
 * Soft round sprite. The falloff is deliberately tight: a real star is a
 * point source, so it should be a small bright core that drops off fast,
 * not an evenly-lit disc. The previous curve held near-full alpha out to
 * half the radius, which is what made the stars read as fat circles.
 */
function useDotSprite() {
  return useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.16, "rgba(255,255,255,0.92)");
      grad.addColorStop(0.34, "rgba(255,255,255,0.34)");
      grad.addColorStop(0.62, "rgba(255,255,255,0.07)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/**
 * Low-saturation stellar-class tints. Stars are near-white to the naked
 * eye; the colour is a hint, not a hue. Weighted toward white and warm
 * white because that's roughly how the visible sky is distributed.
 */
const STAR_TINTS: [number, number, number][] = [
  [0.78, 0.85, 1.0], // hot blue-white
  [0.88, 0.92, 1.0],
  [1.0, 1.0, 1.0], // white
  [1.0, 1.0, 1.0],
  [1.0, 0.97, 0.92], // warm white
  [1.0, 0.97, 0.92],
  [1.0, 0.93, 0.8], // yellow
  [1.0, 0.86, 0.7], // orange
];

interface StarBuffers {
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  phases: Float32Array;
  tints: Float32Array;
}

function useStarBuffers(
  clusterCount: number,
  perCluster: number,
  scatterCount: number,
  sizeRange: [number, number]
): StarBuffers {
  return useMemo(() => {
    const total = clusterCount * perCluster + scatterCount;
    const positions = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const alphas = new Float32Array(total);
    const phases = new Float32Array(total);
    const tints = new Float32Array(total * 3);
    const radius = 40;

    const [minSize, maxSize] = sizeRange;

    // Magnitude-like distribution: pow() with an exponent > 1 pushes the
    // bulk of the population toward the faint/small end and leaves only a
    // handful of genuinely bright stars, which is the real shape of the
    // sky. A flat random() would give a uniform spread of medium dots.
    const sampleMagnitude = () => Math.pow(Math.random(), 2.6);

    const writeStar = (idx: number, dir: THREE.Vector3, r: number) => {
      positions[idx * 3] = dir.x * r;
      positions[idx * 3 + 1] = dir.y * r;
      positions[idx * 3 + 2] = dir.z * r;

      const m = sampleMagnitude();
      sizes[idx] = minSize + (maxSize - minSize) * m;
      // Brightness tracks size, but not perfectly — a little independent
      // jitter keeps them from looking mechanically linked.
      alphas[idx] = 0.52 + 0.48 * m * (0.78 + Math.random() * 0.22);
      phases[idx] = Math.random();

      const tint = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0];
      tints[idx * 3] = tint[0];
      tints[idx * 3 + 1] = tint[1];
      tints[idx * 3 + 2] = tint[2];
    };

    let idx = 0;

    const clusterCenters = Array.from({ length: clusterCount }, () =>
      new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize()
    );

    for (const center of clusterCenters) {
      for (let i = 0; i < perCluster; i++) {
        const spread = 0.35 + Math.random() * 0.25;
        const dir = new THREE.Vector3(
          center.x + (Math.random() - 0.5) * spread,
          center.y + (Math.random() - 0.5) * spread,
          center.z + (Math.random() - 0.5) * spread
        ).normalize();
        writeStar(idx, dir, radius * (0.75 + Math.random() * 0.6));
        idx++;
      }
    }

    for (let i = 0; i < scatterCount; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      writeStar(idx, dir, radius * (0.6 + Math.random() * 0.8));
      idx++;
    }

    return { positions, sizes, alphas, phases, tints };
  }, [clusterCount, perCluster, scatterCount, sizeRange]);
}

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute vec3 aTint;

  uniform float uSize;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;

  varying float vAlpha;
  varying vec3 vTint;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Scintillation. Kept deliberately shallow — stars do twinkle, but
    // push the amplitude and the sky turns into fairy lights. Each star
    // gets its own phase and a slightly different rate so the field never
    // pulses in unison.
    float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.1 + aPhase * 1.6) + aPhase * 6.2831));

    // No distance attenuation on purpose: stars are effectively at
    // infinity, so their apparent size shouldn't change with the camera.
    gl_PointSize = uSize * aSize * uPixelRatio * (0.92 + 0.08 * tw);
    vAlpha = aAlpha * tw;
    vTint = aTint;
  }
`;

const starFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTintAmount;

  varying float vAlpha;
  varying vec3 vTint;

  void main() {
    float mask = texture2D(uMap, gl_PointCoord).a;
    float alpha = mask * vAlpha * uOpacity;
    if (alpha < 0.004) discard;

    // On the cream page the "stars" are dark ink dots, so a warm stellar
    // tint would just muddy them — hold the tint back there.
    vec3 tint = mix(vec3(1.0), vTint, uTintAmount);
    gl_FragColor = vec4(uColor * tint, alpha);
  }
`;

function StarLayer({
  buffers,
  size,
  color,
  opacity,
  tintAmount,
  twinkle,
  blending,
}: {
  buffers: StarBuffers;
  size: number;
  color: string;
  opacity: number;
  tintAmount: number;
  twinkle: number;
  blending: THREE.Blending;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const dotSprite = useDotSprite();
  const gl = useThree((s) => s.gl);

  const uniforms = useMemo(
    () => ({
      uMap: { value: dotSprite },
      uSize: { value: size },
      uTime: { value: 0 },
      uPixelRatio: { value: gl.getPixelRatio() },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTintAmount: { value: tintAmount },
      uTwinkle: { value: twinkle },
    }),
    // Built once; every value below is pushed through the ref each frame
    // instead, so a theme switch doesn't rebuild the geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((state) => {
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uSize.value = size;
    mat.uniforms.uOpacity.value = opacity;
    mat.uniforms.uTintAmount.value = tintAmount;
    mat.uniforms.uTwinkle.value = twinkle;
    mat.uniforms.uPixelRatio.value = gl.getPixelRatio();
    (mat.uniforms.uColor.value as THREE.Color).set(color);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[buffers.positions, 3]}
        />
        <bufferAttribute attach="attributes-aSize" args={[buffers.sizes, 1]} />
        <bufferAttribute attach="attributes-aAlpha" args={[buffers.alphas, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[buffers.phases, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[buffers.tints, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={starVertex}
        fragmentShader={starFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={blending}
      />
    </points>
  );
}

const FIELD_SIZE_RANGE: [number, number] = [0.5, 1.25];
const BRIGHT_SIZE_RANGE: [number, number] = [0.7, 1.55];

export default function Starfield() {
  const groupRef = useRef<THREE.Group>(null);
  const mode = useAppearanceStore((s) => s.mode);
  const t = themes[mode];

  // More stars than before, each one smaller: a dense field of faint
  // pinpricks reads as sky, where fewer/larger dots read as confetti.
  const fieldBuffers = useStarBuffers(5, 300, 1900, FIELD_SIZE_RANGE);
  const brightBuffers = useStarBuffers(3, 26, 120, BRIGHT_SIZE_RANGE);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <group ref={groupRef}>
      <StarLayer
        buffers={fieldBuffers}
        size={t.starSize}
        color={t.starColor}
        opacity={t.starOpacity}
        tintAmount={mode === "dark" ? 1 : 0.15}
        twinkle={mode === "dark" ? 0.5 : 0.25}
        blending={THREE.NormalBlending}
      />

      <StarLayer
        buffers={brightBuffers}
        size={t.starBrightSize}
        color={t.starBrightColor}
        opacity={t.starBrightOpacity}
        tintAmount={mode === "dark" ? 1 : 0.15}
        twinkle={mode === "dark" ? 0.42 : 0.2}
        // Additive only in dark mode: on a light page it just adds white
        // and the stars vanish into the background.
        blending={mode === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </group>
  );
}
