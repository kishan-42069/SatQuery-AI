"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { noiseGLSL } from "@/lib/shaders/noise.glsl";

/**
 * Dark-mode only. A galactic band and faint dust painted on the inside of
 * a large sphere, so deep space isn't a flat black rectangle — real sky is
 * structured: a bright ridge through the middle, dust lanes cutting across
 * it, and colour that shifts from cool to warm along its length.
 *
 * Rendered BackSide with depthWrite off at the far end of the depth range,
 * so it sits behind everything without ever occluding the scene.
 */
const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  uniform float uIntensity;

  varying vec3 vDir;

  ${noiseGLSL}

  void main() {
    vec3 d = normalize(vDir);

    // The galactic plane: a band tilted off the scene's horizontal, densest
    // at its spine and falling away smoothly to either side.
    float band = dot(d, normalize(vec3(0.32, 0.86, -0.38)));
    float spine = 1.0 - smoothstep(0.0, 0.62, abs(band));

    // Two octaves at different scales: large clouds plus finer dust.
    float clouds = fbm3(d * 2.6 + vec3(uTime * 0.006), 4);
    float dust = fbm3(d * 7.5 - vec3(uTime * 0.011), 3);

    // Dust lanes are dark rifts THROUGH the band, not glow on top of it —
    // subtracting them is what stops the band reading as an airbrushed
    // smear.
    float density = spine * (0.35 + 0.85 * clouds);
    density *= 1.0 - 0.55 * smoothstep(0.35, 0.75, dust);
    density = max(density, 0.0);

    // Colour drifts along the band so it isn't one flat hue.
    float mixAmount = smoothstep(-0.7, 0.7, dot(d, vec3(1.0, 0.15, 0.2)));
    vec3 color = mix(uCoolColor, uWarmColor, mixAmount);

    // A faint all-sky wash so the corners aren't pure black either.
    float ambient = 0.045 * (0.4 + 0.6 * fbm3(d * 1.3, 2));

    gl_FragColor = vec4(color * (density * uIntensity + ambient), 1.0);
  }
`;

export default function Nebula() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCoolColor: { value: new THREE.Color("#2b4c8f") },
      uWarmColor: { value: new THREE.Color("#7a4a86") },
      uIntensity: { value: 0.55 },
    }),
    []
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh scale={90} renderOrder={-1}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
