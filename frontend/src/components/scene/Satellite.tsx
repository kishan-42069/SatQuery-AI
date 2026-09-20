"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { palette } from "@/lib/theme";
import { useSceneStore } from "@/hooks/useSceneStore";

/**
 * Modelled on Cartosat-3 — ISRO's flagship high-resolution imaging
 * satellite (launched 27 Nov 2019 on PSLV-C47): sun-synchronous polar
 * orbit at ~450 km, a 0.5 m aperture panchromatic camera resolving
 * 0.25 m/px, and reaction-wheel agility for fast off-nadir slewing. It's
 * the real ISRO satellite that actually matches "ask any question about
 * any satellite image" — not a generic comms-style dish satellite.
 */
export const SATELLITE_SPECS = {
  name: "CARTOSAT-3",
  orbit: "SSO · 450 KM",
  resolution: "PAN 0.25 M/PX",
};

export const ORBIT_RADIUS = 1.78;
export const ORBIT_TILT = THREE.MathUtils.degToRad(34);
export const ORBIT_PERIOD_SECONDS = 26;

/** Position on a properly inclined circular orbit at time t (seconds). */
export function satellitePositionAt(t: number, target = new THREE.Vector3()) {
  const angle = (t / ORBIT_PERIOD_SECONDS) * Math.PI * 2;
  const x = Math.cos(angle) * ORBIT_RADIUS;
  const z = Math.sin(angle) * ORBIT_RADIUS * Math.cos(ORBIT_TILT);
  const y = Math.sin(angle) * ORBIT_RADIUS * Math.sin(ORBIT_TILT);
  return target.set(x, y, z);
}

/**
 * Builds a small repeating dash pattern as a canvas alpha texture. Plain
 * WebGL lines are capped at ~1px regardless of `linewidth` in most
 * browsers, which is why the orbit ring read as "not visible" — a real
 * tube mesh has actual on-screen thickness, and this alpha map gives it
 * the dashed look back.
 */
function useDashTexture(dashCount: number) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width * 0.58, canvas.height);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(dashCount, 1);
    return texture;
  }, [dashCount]);
}

function OrbitPath() {
  const dashMap = useDashTexture(70);

  const tubeGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 260;
    for (let i = 0; i <= segments; i++) {
      points.push(
        satellitePositionAt(
          (i / segments) * ORBIT_PERIOD_SECONDS,
          new THREE.Vector3()
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0);
    return new THREE.TubeGeometry(curve, 320, 0.0095, 8, true);
  }, []);

  return (
    <mesh geometry={tubeGeometry}>
      <meshBasicMaterial
        color={palette.cyanDeep}
        map={dashMap}
        transparent
        opacity={0.78}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Solar-cell grid: a repeating rectangular lattice, like real array cells. */
function useSolarCellTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0d2a44";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(120,180,210,0.9)";
      ctx.lineWidth = 1;
      const cols = 8;
      const rows = 4;
      for (let i = 0; i <= cols; i++) {
        const x = (i / cols) * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        const y = (j / rows) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }, []);
}

function SatelliteBody() {
  const hovered = useSceneStore((s) => s.satelliteHovered);
  const setHovered = useSceneStore((s) => s.setSatelliteHovered);
  const cellMap = useSolarCellTexture();

  // Gold MLI (multi-layer insulation) foil is the real, recognisable
  // finish on ISRO's EO bus faces — a plain grey/silver box read as a
  // generic toy satellite rather than anything specific.
  const busColor = hovered ? palette.cyanSoft : "#caa24a";

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      {/* invisible larger hit area so hovering is forgiving */}
      <mesh visible={false}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* main bus — crinkled gold-foil MLI blanket look */}
      <mesh castShadow>
        <boxGeometry args={[0.075, 0.055, 0.055]} />
        <meshStandardMaterial
          color={busColor}
          metalness={0.55}
          roughness={0.6}
          emissive={new THREE.Color(palette.cyan)}
          emissiveIntensity={hovered ? 0.5 : 0.1}
        />
      </mesh>

      {/* star sensor + comm antenna cluster, top face */}
      <mesh position={[0.014, 0.032, 0.01]}>
        <cylinderGeometry args={[0.006, 0.006, 0.014, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[-0.016, 0.03, -0.012]}>
        <sphereGeometry args={[0.007, 8, 8]} />
        <meshStandardMaterial
          color="#e8eef2"
          metalness={0.2}
          roughness={0.35}
          emissive={new THREE.Color(palette.cyan)}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* solar panels — segmented cell grid, not a flat colour slab */}
      {[-1, 1].map((dir) => (
        <mesh key={dir} position={[dir * 0.105, 0, 0]}>
          <boxGeometry args={[0.13, 0.006, 0.06]} />
          <meshStandardMaterial
            map={cellMap}
            metalness={0.35}
            roughness={0.45}
            emissive={new THREE.Color(palette.cyan)}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}

      {/*
        Cartosat-3's actual payload is a large panchromatic telescope, not
        a communications dish — a dark cylindrical aperture behind a wider
        sunshade baffle reads as an imaging instrument instead.
      */}
      <mesh position={[0, -0.038, 0]}>
        <cylinderGeometry args={[0.024, 0.03, 0.026, 16, 1, true]} />
        <meshStandardMaterial
          color="#c9d3da"
          metalness={0.5}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, -0.053, 0]}>
        <cylinderGeometry args={[0.016, 0.02, 0.018, 16, 1, true]} />
        <meshStandardMaterial color="#050608" metalness={0.1} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.062, 0]}>
        <circleGeometry args={[0.016, 16]} />
        <meshStandardMaterial color="#0a0e14" metalness={0.2} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Rectangular scan frustum drawn explicitly between the satellite and its
 * sub-satellite surface point, so the direction can't be got wrong by an
 * off-by-90° local rotation. Wide end sits on the surface.
 */
const UP = new THREE.Vector3(0, 1, 0);

function ScanBeam() {
  const state = useSceneStore((s) => s.state);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  const satPos = useMemo(() => new THREE.Vector3(), []);
  const surfacePos = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  const geometry = useMemo(() => {
    // Wide end at +Y (surface), narrow end at -Y (sensor).
    const geo = new THREE.CylinderGeometry(0.22, 0.015, 1, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    return geo;
  }, []);

  const edgeGeometry = useMemo(
    () => new THREE.EdgesGeometry(geometry, 1),
    [geometry]
  );

  useFrame((clock) => {
    const t = clock.clock.elapsedTime;

    satellitePositionAt(t, satPos);
    surfacePos.copy(satPos).normalize().multiplyScalar(1.0);

    dir.copy(surfacePos).sub(satPos);
    const len = dir.length();
    dir.normalize();

    if (groupRef.current) {
      mid.copy(satPos).addScaledVector(dir, len / 2);
      groupRef.current.position.copy(mid);
      quat.setFromUnitVectors(UP, dir);
      groupRef.current.quaternion.copy(quat);
      groupRef.current.scale.set(1, len, 1);
    }

    const active = state === "query-active";
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (active ? 0.34 : 0.16) + pulse * (active ? 0.12 : 0.05);
    }
    if (edgesRef.current) {
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = (active ? 0.95 : 0.62) + pulse * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/*
        Normal blending, not additive: additive light-adds against the pale
        page background instead of reading as a cyan beam, which is what
        washed the whole scan cone out to near-white.
      */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial
          color={palette.cyanDeep}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.NormalBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments ref={edgesRef} geometry={edgeGeometry}>
        <lineBasicMaterial
          color={palette.cyanDeep}
          transparent
          opacity={0.62}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

export default function Satellite() {
  const groupRef = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((clock) => {
    if (!groupRef.current) return;
    const t = clock.clock.elapsedTime;
    satellitePositionAt(t, scratch);
    groupRef.current.position.copy(scratch);
    // Object3D.lookAt points local +Z at the target, so -90° about X maps
    // the beam's local -Y onto +Z — i.e. straight down at Earth's centre.
    groupRef.current.lookAt(0, 0, 0);
    groupRef.current.rotateX(-Math.PI / 2);
  });

  return (
    <>
      <OrbitPath />
      <ScanBeam />
      <group ref={groupRef}>
        <SatelliteBody />
        <Html
          position={[0, 0.05, 0]}
          center
          distanceFactor={1.35}
          zIndexRange={[3, 1]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="whitespace-nowrap font-mono text-[8px] tracking-wide"
            style={{
              color: palette.cyanSoft,
              textShadow: "0 0 6px rgba(0,0,0,0.9)",
            }}
          >
            {SATELLITE_SPECS.name}
          </div>
        </Html>
      </group>
    </>
  );
}
