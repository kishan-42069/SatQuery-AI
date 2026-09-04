/**
 * SatQuery AI — shared visual language for the 3D hero.
 * Keep this the single source of truth for color/timing so every
 * scene component (and later screens) stay visually consistent.
 */

export const palette = {
  spaceBg: "#FBF7EE",
  oceanDeep: "#050f21",
  oceanShallow: "#0c2a47",
  landBase: "#2c5b4e",
  landHigh: "#5a8467",
  iceCap: "#b9d4dc",
  atmosphere: "#3ddbe0",
  cyan: "#3ddbe0",
  cyanSoft: "#7fe9ec",
  amber: "#f2a950",
  amberSoft: "#ffcf8a",
  panelBg: "rgba(6, 12, 22, 0.68)",
  panelBorder: "rgba(61, 219, 224, 0.35)",
  // Light-on-dark text — used INSIDE floating panels/chips that carry their
  // own dark glass background (Evidence, Agent trace, detection labels).
  textPrimary: "#eaf6f7",
  textMuted: "#a9bdca",

  // Dark-on-light text — used for anything sitting directly on the cream
  // page background (headline, nav, footer, capability chips' outer text).
  // Kept as separate tokens rather than reusing textPrimary/Muted so the
  // in-canvas dark chips (which need light text) never get swept up in a
  // "make it darker" pass aimed at the page chrome.
  inkPrimary: "#0c1c26",
  inkMuted: "#4c5c68",
  inkFaint: "#7d8b95",

  // Deep/saturated variants of the brand accents, for text and strokes
  // that must hold contrast directly against the light background instead
  // of glowing against dark space.
  cyanDeep: "#0a7c85",
  amberDeep: "#b8631a",

  // Globe colour grade. The raw Blue Marble day texture is a dark, fairly
  // desaturated navy at this exposure; these push the oceans to a vivid
  // marine blue and give the limb a bright sky-blue halo.
  // Water is graded across two tints rather than one flat blue: open ocean
  // sits near-navy and continental shelves come up turquoise, which is what
  // gives a globe its sense of depth instead of a painted blue ball.
  oceanTint: "#0b2f7d",
  oceanShallowTint: "#31b9de",
  atmosphereBlue: "#3d8bff",
} as const;

/**
 * Scene-side theme tokens. DOM chrome is themed with CSS variables in
 * globals.css (flipped by a data-theme attribute); these are the values
 * three.js needs as real JS numbers/colours, which CSS variables can't
 * provide inside a WebGL material.
 */
export const themes = {
  light: {
    /** Renderer clear colour. */
    background: "#FBF7EE",
    starColor: "#1a1a5c",
    starSize: 2.7,
    starOpacity: 0.95,
    /** Second, brighter star layer — barely used on cream. */
    starBrightColor: "#0f0f3d",
    starBrightSize: 3.5,
    starBrightOpacity: 0.55,
    nebula: false,
    atmosphere: "#3d8bff",
    atmosphereIntensity: 0.85,
    grid: "#0a7c85",
    vignette: 0.38,
    bloomThreshold: 0.97,
  },
  dark: {
    background: "#000000",
    starColor: "#cfe0ff",
    starSize: 2.4,
    starOpacity: 0.75,
    starBrightColor: "#ffffff",
    starBrightSize: 3.4,
    starBrightOpacity: 1,
    nebula: false,
    atmosphere: "#4f9dff",
    atmosphereIntensity: 1.35,
    grid: "#3ddbe0",
    vignette: 0.62,
    // Bloom threshold has to sit above the background luminance or the
    // backdrop itself blooms; deep space is dark, so it can drop far
    // enough to let stars and the limb actually glow.
    bloomThreshold: 0.42,
  },
} as const;

export type ThemeTokens = (typeof themes)["light"];

export const timing = {
  earthRotationSeconds: 90,
  cameraIdleDegPerSec: 1.4,
  parallaxMaxDeg: 6,
  queryActiveDurationMs: 6500,
  beamPulseSeconds: 2.4,
} as const;

export type SceneState = "idle" | "query-active" | "hover-satellite";
