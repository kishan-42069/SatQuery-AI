/**
 * Earth's current idle spin angle (radians, accumulated), written every
 * frame by <Earth /> and read every frame by anything that needs to know
 * where the textured surface actually is right now.
 *
 * By design, idle auto-spin lives on the Earth MESH alone (see Earth.tsx),
 * not on <GlobeSystem>'s group — the orbit ring and satellite stay put
 * while the planet turns beneath them, like a real satellite pass. That
 * means a fixed world-space direction stops pointing at a fixed patch of
 * texture: the sphere's own local rotation.y keeps sweeping different
 * longitudes under it. The scan patch was computing its sample UV from
 * raw world-space direction, so it kept sampling the direction where the
 * satellite USED to be pointed rather than tracking the surface — sampled
 * imagery drifted out of sync with what's actually visible underneath
 * ("shows places which is not there"). Un-rotating by this angle before
 * computing UV fixes it.
 *
 * A plain mutable object rather than a store: this is read inside a
 * per-frame uniform assignment, not used for rendering/props, so it
 * doesn't need to trigger React re-renders — that would just be 60x/sec
 * of wasted work for a number nothing ever displays directly.
 */
export const earthRotation = { y: 0 };
