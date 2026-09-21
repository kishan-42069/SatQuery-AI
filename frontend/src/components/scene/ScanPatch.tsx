"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { palette } from "@/lib/theme";
import { useSceneStore } from "@/hooks/useSceneStore";
import { satellitePositionAt, SATELLITE_SPECS } from "./Satellite";
import { useEarthTextures } from "@/hooks/useEarthTextures";
import { earthMeshRef } from "@/lib/earthMeshRef";
import { noiseGLSL } from "@/lib/shaders/noise.glsl";

/** The patch plane's own outward axis, mapped onto the surface normal. */
const LOCAL_Z = new THREE.Vector3(0, 0, 1);

const PATCH_SIZE = 0.62;
const SURFACE_OFFSET = 1.004;

/**
 * The footprint is a plane bent onto the globe rather than laid flat
 * against it. A tangent plane only touches the sphere at its centre, so at
 * this size the corners lift off and the patch reads as a card angled over
 * the Earth instead of imagery lying on it.
 *
 * The group sits at SURFACE_OFFSET along the sub-satellite normal, turned
 * to face the centre, which puts Earth's centre at local (0, 0, -R). Each
 * vertex is re-projected onto the sphere of that radius about that point:
 * the centre vertex stays put and the edges drop into the curvature.
 * planeGeometry's UVs are untouched, so the shader's sampling and grid
 * maths are unaffected.
 */
const patchGeometry = (() => {
  const geo = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 24, 24);
  const pos = geo.attributes.position;
  const R = SURFACE_OFFSET;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const len = Math.sqrt(x * x + y * y + R * R);
    pos.setXYZ(i, (R * x) / len, (R * y) / len, (R * R) / len - R);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
})();

/**
 * Same projection for the overlays drawn on the patch. Without it they stay
 * on the old flat plane and float off the surface toward the edges — the
 * exact artefact the curved geometry removes. `lift` nudges lines outward
 * so they do not z-fight the patch they sit on.
 */
function onSurface(x: number, y: number, lift = 0): THREE.Vector3 {
  const R = SURFACE_OFFSET;
  const len = Math.sqrt(x * x + y * y + R * R);
  const r = R + lift;
  return new THREE.Vector3((r * x) / len, (r * y) / len, (r * R) / len - R);
}

/** Outward normal at a tangent-plane coordinate, in the group's local frame. */
function surfaceNormal(x: number, y: number): THREE.Vector3 {
  const R = SURFACE_OFFSET;
  return new THREE.Vector3(x, y, R).normalize();
}

/**
 * Detections shown on the scanned surface patch. The first two are always
 * visible (idle); the remaining ones snap in when a query runs — mirroring
 * the PRD's grounding workflow producing additional evidence regions.
 */
const DETECTIONS = [
  { id: "d1", x: -0.17, y: 0.11, w: 0.19, h: 0.13, label: "built-up", conf: 0.94 },
  { id: "d2", x: 0.13, y: -0.06, w: 0.15, h: 0.11, label: "water", conf: 0.87 },
  { id: "d3", x: -0.05, y: -0.19, w: 0.13, h: 0.09, label: "vegetation", conf: 0.79 },
  { id: "d4", x: 0.19, y: 0.18, w: 0.11, h: 0.1, label: "change", conf: 0.91 },
] as const;

const patchVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    // Same convention <Earth /> uses for its own day/night term, so the two
    // agree about which way the sun is.
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const patchFragment = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform vec3 uGridColor;
  uniform vec3 uTerrainLow;
  uniform vec3 uTerrainHigh;
  uniform sampler2D uDayMap;
  uniform float uHasRealMap;
  // Centre of the sample, in uDayMap's own UV space — computed on the CPU
  // side each frame from Earth's REAL current matrixWorld (see
  // earthMeshRef.ts), not re-derived by hand in the shader. An earlier
  // version hand-inverted just Earth's own spin angle here and drifted
  // out of alignment the moment the globe was also dragged (GlobeSystem's
  // rotation stacks on top of Earth's spin, and the shader had no way to
  // know about it). Reading the mesh's actual matrixWorld is correct
  // regardless of how many rotations are stacked above it.
  uniform vec2 uSampleCenter;
  uniform vec2 uFootprint;
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying vec3 vNormal;

  ${noiseGLSL}

  // Same grading move as <Earth />'s own shader: push colour away from
  // grey without touching brightness.
  vec3 saturateColor(vec3 c, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(l), c, amount);
  }

  void main() {
    // radial falloff so the patch blends into the globe instead of
    // sitting on it as a hard-edged decal
    vec2 centered = vUv - 0.5;
    float dist = length(centered);
    float falloff = 1.0 - smoothstep(0.30, 0.5, dist);
    if (falloff <= 0.001) discard;

    vec3 base;
    if (uHasRealMap > 0.5) {
      // Sample around the CPU-computed centre, offset by this fragment's
      // position within the patch — that's what gives the patch visible
      // internal variation (a coastline crossing it, cloud edges) instead
      // of a single flat colour, while staying centred on the true point.
      vec2 sampleUv = uSampleCenter + centered * uFootprint;
      vec3 real = texture2D(uDayMap, sampleUv).rgb;

      // <Earth />'s own shader doesn't just display uDayMap — it grades it
      // (lift + saturate) and multiplies by a day-lit factor before it
      // ever reaches the screen. Sampling the SAME raw texture here
      // without that pipeline is exactly why the patch read dull and dark
      // next to the vividly graded globe around it; matching the grading
      // is what makes the two actually look like the same imagery.
      vec3 graded = saturateColor(real * 1.55, 1.3);
      base = graded * 1.05;

      float dayMix = smoothstep(-0.12, 0.32, dot(normalize(vNormal), normalize(uLightDir)));
      base *= mix(0.10, 1.0, dayMix);
    } else {
      // Fallback for the brief window before Earth's textures resolve —
      // stylised, not meant to represent real geography.
      float terrain = fbm3(vec3(vUv * 9.0, 1.7), 4);
      base = mix(uTerrainLow, uTerrainHigh, smoothstep(0.35, 0.7, terrain));
    }

    // GIS tiling grid — two tiers, like a real sensor's pixel/tile
    // overlay: a fine cell grid plus a heavier tile boundary every 4 cells,
    // rather than one uniform lattice.
    // Both tiers are measured in SCREEN PIXELS via fwidth, not in UV: a
    // fixed UV width is magnified along with the patch as the camera zooms
    // in, which turned a crisp instrument lattice into soft fat bands.
    // Dividing the distance-to-line by the per-pixel UV step pins each
    // line to the same drawn thickness at any distance.
    vec2 fine = vUv * 12.0;
    vec2 fineAA = max(fwidth(fine), vec2(1e-5));
    vec2 fineD = abs(fract(fine) - 0.5) / fineAA;
    float gridLine = 1.0 - smoothstep(0.0, 0.9, min(fineD.x, fineD.y));
    base = mix(base, uGridColor, gridLine * (0.16 + 0.14 * uActive));

    vec2 tile = vUv * 3.0;
    vec2 tileAA = max(fwidth(tile), vec2(1e-5));
    vec2 tileD = abs(fract(tile) - 0.5) / tileAA;
    float tileLine = 1.0 - smoothstep(0.0, 1.5, min(tileD.x, tileD.y));
    base = mix(base, uGridColor, tileLine * (0.32 + 0.22 * uActive));

    // scan sweep travelling across the patch, with a soft trailing fade
    // behind the leading edge so it reads as a moving beam, not a bar
    float sweepPos = fract(uTime * 0.22);
    float sweepDist = vUv.y - sweepPos;
    float sweepFront = smoothstep(0.05, 0.0, abs(sweepDist));
    float sweepTrail = smoothstep(0.22, 0.0, sweepDist) * step(0.0, sweepDist);
    base += uGridColor * sweepFront * (0.35 + 0.55 * uActive);
    base += uGridColor * sweepTrail * 0.16 * (0.4 + uActive);

    // expanding radar-ping rings, looping outward from the patch centre —
    // the "revolving scan" read that sells the surface as actively probed
    float ring = fract(uTime * 0.5 - dist * 2.6);
    float ringLine = smoothstep(0.05, 0.0, abs(ring - 0.5)) * smoothstep(0.5, 0.0, dist);
    base += uGridColor * ringLine * (0.3 + 0.5 * uActive);

    float alpha = falloff * (0.86 + 0.14 * uActive);
    gl_FragColor = vec4(base, alpha);
  }
`;

function DetectionBox({
  det,
  visible,
}: {
  det: (typeof DETECTIONS)[number];
  visible: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef(0);

  const outline = useMemo(() => {
    const { w, h } = det;
    const pts = [
      new THREE.Vector3(-w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0),
      new THREE.Vector3(-w / 2, h / 2, 0),
      new THREE.Vector3(-w / 2, -h / 2, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(det.conf > 0.9 ? palette.amber : palette.cyan),
      transparent: true,
      opacity: 0.95,
    });
    return new THREE.Line(geo, mat);
  }, [det]);

  useFrame((_, delta) => {
    const target = visible ? 1 : 0;
    scaleRef.current += (target - scaleRef.current) * Math.min(delta * 6, 1);
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.setScalar(0.85 + s * 0.15);
      groupRef.current.visible = s > 0.02;
      const mat = outline.material as THREE.LineBasicMaterial;
      mat.opacity = s * 0.95;
    }
  });

  // Sit the box on the curved surface and tilt it to the local normal, so
  // it lies on the imagery rather than hovering above it off-centre.
  const { pos, quat } = useMemo(() => {
    const p = onSurface(det.x, det.y, 0.002);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      surfaceNormal(det.x, det.y),
    );
    return { pos: p, quat: q };
  }, [det]);

  return (
    <group ref={groupRef} position={pos} quaternion={quat}>
      <primitive object={outline} />
      <Html
        position={[det.w / 2 + 0.012, det.h / 2, 0]}
        center={false}
        distanceFactor={1.15}
        style={{ pointerEvents: "none" }}
        zIndexRange={[4, 1]}
      >
        <div
          className="whitespace-nowrap font-mono text-[9px] tracking-wide"
          style={{
            color: det.conf > 0.9 ? palette.amberSoft : palette.cyanSoft,
            opacity: visible ? 1 : 0,
            transition: "opacity 300ms ease",
            textShadow: "0 0 6px rgba(0,0,0,0.9)",
          }}
        >
          {det.label} {det.conf.toFixed(2)}
        </div>
      </Html>
    </group>
  );
}

/**
 * Four L-shaped corner brackets, like a camera/targeting reticle, framing
 * the scan patch — the "instrument is actively locked on" read that a
 * plain square patch doesn't give.
 */
function ReticleCorners() {
  const half = PATCH_SIZE / 2.15;
  const arm = PATCH_SIZE * 0.16;

  const corners = useMemo(
    () =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const,
    []
  );

  const lines = useMemo(
    () =>
      corners.map(([sx, sy]) => {
        const x = sx * half;
        const y = sy * half;
        const pts = [
          onSurface(x, y - sy * arm, 0.003),
          onSurface(x, y, 0.003),
          onSurface(x - sx * arm, y, 0.003),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(palette.cyan),
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        });
        return new THREE.Line(geo, mat);
      }),
    [corners, half, arm]
  );

  return (
    <>
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </>
  );
}

export default function ScanPatch() {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const activeBoxCount = useSceneStore((s) => s.activeBoxCount);
  const state = useSceneStore((s) => s.state);
  const dayMap = useEarthTextures((s) => s.dayMap);

  const scratch = useMemo(() => new THREE.Vector3(), []);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const worldDir = useMemo(() => new THREE.Vector3(), []);
  const localDir = useMemo(() => new THREE.Vector3(), []);
  const outward = useMemo(() => new THREE.Vector3(), []);
  const invMatrix = useMemo(() => new THREE.Matrix4(), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActive: { value: 0 },
      uGridColor: { value: new THREE.Color(palette.cyan) },
      uTerrainLow: { value: new THREE.Color("#3d4436") },
      uTerrainHigh: { value: new THREE.Color("#8d8560") },
      uDayMap: { value: null as THREE.Texture | null },
      uHasRealMap: { value: 0 },
      uSampleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      // A small window of the equirectangular map around that centre —
      // this is what gives the patch visible internal detail (a coastline,
      // cloud edges) rather than reading as one flat sampled colour.
      uFootprint: { value: new THREE.Vector2(0.022, 0.022) },
      // Matches <Earth />'s own uLightDir so both agree on the terminator.
      uLightDir: { value: new THREE.Vector3(1, 0.4, 0.6).normalize() },
    }),
    []
  );

  // Swap in the real texture the moment it's available — before that,
  // the shader's fallback branch keeps rendering the stylised pattern
  // instead of sampling a null texture.
  //
  // This mutates matRef.current.uniforms directly rather than the plain
  // `uniforms` object above: react-three-fiber only copies that object's
  // initial values into the material's actual uniforms once, at attach
  // time (its reference never changes again, so applyProps never re-runs
  // for it) — mutating the standalone object afterwards silently stopped
  // reaching the GPU-bound uniforms the shader actually reads, which is
  // why the patch kept rendering the procedural fallback (uHasRealMap
  // stuck at 0) even once the real texture had genuinely finished
  // loading. Writing through the ref hits the real, live uniforms.
  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uDayMap.value = dayMap;
    mat.uniforms.uHasRealMap.value = dayMap ? 1 : 0;
  }, [dayMap]);

  useFrame((clock, delta) => {
    const t = clock.clock.elapsedTime;

    // Keep the patch pinned beneath the satellite, lying flat on the surface.
    satellitePositionAt(t, scratch);
    scratch.normalize().multiplyScalar(SURFACE_OFFSET);
    if (groupRef.current) {
      groupRef.current.position.copy(scratch);

      // Orient in the PARENT's frame, not via lookAt.
      //
      // Object3D.lookAt(0, 0, 0) aims at the WORLD origin, but the patch's
      // position above is set in GlobeSystem's local frame, where the origin
      // IS the planet's centre. Those two only coincide while the globe sits
      // at the world origin — and GlobeSystem moves it constantly
      // (shell.position.y as the hero rises, g.position during travel and
      // fly-to-place). With an offset live, the patch aimed at a point that
      // was not the centre and tilted off tangent, in the worst case
      // standing perpendicular to the ground like a fin.
      //
      // The outward radial direction in this frame is just the normalised
      // local position, so build the rotation from it directly: local +Z
      // maps onto the outward normal, which puts the plane tangent to the
      // surface no matter where the globe has been moved to.
      outward.copy(scratch).normalize();
      groupRef.current.quaternion.setFromUnitVectors(LOCAL_Z, outward);

      // Where the patch actually sits, in world space, right now —
      // updateWorldMatrix forces this and its ancestors (GlobeSystem's
      // drag rotation included) current for this frame rather than
      // reading last frame's stale transform.
      groupRef.current.updateWorldMatrix(true, false);
      groupRef.current.getWorldPosition(worldPos);
      worldDir.copy(worldPos).normalize();

      const earthMesh = earthMeshRef.current;
      if (earthMesh && matRef.current) {
        // Fold that world direction into Earth's OWN local space — its
        // matrixWorld already composes every rotation stacked above it
        // (GlobeSystem's drag/tilt, Earth's independent idle spin), so
        // this is correct regardless of how the globe has been turned.
        earthMesh.updateWorldMatrix(true, false);
        invMatrix.copy(earthMesh.matrixWorld).invert();
        localDir.copy(worldDir).transformDirection(invMatrix).normalize();

        // Same phi/theta -> UV convention THREE.SphereGeometry uses for its
        // own default UVs (verified against its actual source: u = phi /
        // phiLength with phiStart 0, so phi is wrapped into [0, 2π) — NOT
        // offset by 0.5. That extra +0.5 was the real, standing bug behind
        // every earlier "wrong geography" report: it sampled the point
        // exactly 180° of longitude away, so this was consistently showing
        // whatever sits on the ANTIPODE of the true sub-satellite point.
        const theta = Math.acos(THREE.MathUtils.clamp(localDir.y, -1, 1));
        const phi = Math.atan2(localDir.z, -localDir.x);
        let u = phi / (2 * Math.PI);
        if (u < 0) u += 1;
        const v = 1 - theta / Math.PI;
        // Mutate through the material's own live uniforms (matRef), not
        // the standalone `uniforms` object — see the dayMap effect above
        // for why the latter silently stops reaching the GPU-bound values
        // after the initial attach.
        (matRef.current.uniforms.uSampleCenter.value as THREE.Vector2).set(
          u,
          v
        );
      }
    }

    if (matRef.current) {
      matRef.current.uniforms.uTime.value = t;
      const target = state === "query-active" ? 1 : 0;
      const current = matRef.current.uniforms.uActive.value as number;
      matRef.current.uniforms.uActive.value =
        current + (target - current) * Math.min(delta * 4, 1);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={patchGeometry}>
        <shaderMaterial
          ref={matRef}
          vertexShader={patchVertex}
          fragmentShader={patchFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      <ReticleCorners />
      {DETECTIONS.map((det, i) => (
        <DetectionBox key={det.id} det={det} visible={i < activeBoxCount} />
      ))}

      {/* Real sensor readout — Cartosat-3's actual orbit and resolution,
          not placeholder numbers, so the "instrument" reads as grounded. */}
      <Html
        position={onSurface(-PATCH_SIZE / 2.15, PATCH_SIZE / 2.15 + 0.05, 0.01)}
        center={false}
        distanceFactor={1.15}
        zIndexRange={[3, 1]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="whitespace-nowrap font-mono text-[8px] tracking-wide"
          style={{ color: palette.cyanSoft, textShadow: "0 0 6px rgba(0,0,0,0.9)" }}
        >
          {SATELLITE_SPECS.name} · {SATELLITE_SPECS.resolution} · {SATELLITE_SPECS.orbit}
        </div>
      </Html>
    </group>
  );
}
