"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { palette } from "@/lib/theme";
import { useSceneStore } from "@/hooks/useSceneStore";
import { satellitePositionAt } from "./Satellite";
import { ANSWER_ANCHOR } from "./EvidencePanels";

const SEGMENTS = 60;

/**
 * The arc that carries a finding off the surface into the answer panel —
 * visualising "evidence leaves the imagery and becomes a grounded result".
 */
export default function DataTrace() {
  const lineRef = useRef<THREE.Line>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const state = useSceneStore((s) => s.state);
  const { camera } = useThree();

  const scratch = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const curvePoints = useMemo(
    () => Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3()),
    []
  );

  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(palette.cyanDeep),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, [curvePoints]);

  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
      ),
    []
  );

  useFrame((clock, delta) => {
    const t = clock.clock.elapsedTime;

    // The answer panel is camera-anchored, so resolve its world position.
    target.set(...ANSWER_ANCHOR).applyMatrix4(camera.matrixWorld);

    // Origin follows the scanned surface point.
    satellitePositionAt(t, scratch);
    scratch.normalize().multiplyScalar(1.01);

    curve.v0.copy(scratch);
    curve.v2.copy(target);
    // Control point lifted outward for a clean arc.
    curve.v1.copy(scratch).multiplyScalar(1.9).lerp(target, 0.35);
    curve.v1.y += 0.5;

    for (let i = 0; i <= SEGMENTS; i++) {
      curve.getPoint(i / SEGMENTS, curvePoints[i]);
    }
    line.geometry.setFromPoints(curvePoints);
    line.geometry.attributes.position.needsUpdate = true;

    const active = state === "query-active";
    const mat = line.material as THREE.LineBasicMaterial;
    const targetOpacity = active ? 0.85 : 0.4;
    mat.opacity += (targetOpacity - mat.opacity) * Math.min(delta * 3, 1);

    // Travelling pulse along the arc.
    if (pulseRef.current) {
      const speed = active ? 0.55 : 0.22;
      const p = (t * speed) % 1;
      curve.getPoint(p, scratch);
      pulseRef.current.position.copy(scratch);
      const pm = pulseRef.current.material as THREE.MeshBasicMaterial;
      pm.opacity = (active ? 1 : 0.75) * (1 - Math.abs(p - 0.5) * 0.6);
      pulseRef.current.scale.setScalar(active ? 1.6 : 1.15);
    }
  });

  return (
    <>
      <primitive object={line} ref={lineRef} />
      {/* Normal blending so the pulse reads as a solid amber bead rather
          than adding light against the pale background. */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshBasicMaterial
          color={palette.amberDeep}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </>
  );
}
