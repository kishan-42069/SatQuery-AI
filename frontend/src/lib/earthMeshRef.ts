import type * as THREE from "three";

/**
 * Holds the live Earth mesh so other components can read its true, current
 * `matrixWorld` — the actual composed transform (GlobeSystem's drag
 * rotation/tilt AND Earth's own independent idle spin, together) — rather
 * than re-deriving that composition by hand.
 *
 * An earlier version of the scan-patch alignment fix tried exactly that:
 * hand-inverting Earth's local Y-rotation from a plain angle. It only
 * accounted for Earth's own spin, not GlobeSystem's rotation on top of
 * it, so the sampled point drifted again as soon as the globe was
 * dragged. Going straight to the mesh's real matrixWorld sidesteps the
 * whole problem — it's already correct by construction, however many
 * transforms are stacked above it.
 */
export const earthMeshRef: { current: THREE.Mesh | null } = { current: null };
