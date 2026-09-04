import { noiseGLSL } from "./noise.glsl";

export const earthVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Textured (not procedural) Earth: real day/night/ocean-mask imagery
 * instead of noise-generated continents, so the globe reads as an actual
 * planet rather than a stylised abstraction of one.
 *
 * uVariant selects the treatment the team is choosing between:
 *   0 — Blue Marble : photoreal, graded for a vivid marine blue
 *   1 — Terrain     : bathymetry-forward, higher-contrast landmass
 *   2 — Analytic    : EO data surface, graticule + lit coastlines
 */
export const earthFragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uAtmosphere;
  uniform vec3 uOceanTint;
  uniform vec3 uOceanShallowTint;
  uniform vec3 uGridColor;
  uniform float uVariant;
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uSpecularMap;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  ${noiseGLSL}

  // Push colour away from grey without touching brightness.
  vec3 saturateColor(vec3 c, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(l), c, amount);
  }

  // Antialiased graticule: one line every 1/spacing of the UV range.
  //
  // widthPx is a width in SCREEN PIXELS, not in UV. The earlier version
  // took a fixed UV width, which meant the line covered a fixed slice of
  // the texture — so zooming in magnified the line along with everything
  // else and a crisp 1px graticule bloomed into a soft band several pixels
  // wide. Dividing by fwidth() converts the distance-to-line into pixel
  // units, which holds the drawn thickness constant however close the
  // camera gets.
  //
  // fwidth() is taken on the UNWRAPPED coordinate: fwidth(fract(x)) spikes
  // to ~1 at the wrap, which would paint a fat seam down the globe. It's
  // still clamped, because vUv.x itself wraps 1 -> 0 on the seam column.
  float gridLine(float coord, float spacing, float widthPx) {
    float c = coord * spacing;
    float f = fract(c);
    float d = min(f, 1.0 - f);
    float aa = clamp(fwidth(c), 1e-5, 0.5);
    return 1.0 - smoothstep(0.0, aa * widthPx, d);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(uLightDir);
    float NdotL = dot(n, lightDir);
    float dayMix = smoothstep(-0.12, 0.32, NdotL);

    // Textures already arrive colour-managed (three.js decodes sRGB at
    // sample time when texture.colorSpace is set) — decoding again here
    // double-applies gamma and crushes the image to a posterised
    // black/white mess, which is what was happening before this fix.
    vec3 dayTex = texture2D(uDayMap, vUv).rgb;
    vec3 nightTex = texture2D(uNightMap, vUv).rgb;
    float oceanMask = texture2D(uSpecularMap, vUv).r; // bright = open water

    // Bathymetry: in the Blue Marble plate, deep ocean is near-black and
    // continental shelves are noticeably lighter, so the plate's own
    // luminance is a usable depth proxy. Grading across two tints with it
    // gives shelves and trenches instead of one flat blue ball.
    float seaLum = dot(dayTex, vec3(0.2126, 0.7152, 0.0722));

    // --- variant selection -------------------------------------------------
    bool isTerrain = uVariant > 0.5 && uVariant < 1.5;
    bool isAnalytic = uVariant > 1.5;

    float shelfLo = isTerrain ? 0.010 : 0.015;
    float shelfHi = isTerrain ? 0.105 : 0.130;
    float shelf = smoothstep(shelfLo, shelfHi, seaLum);

    vec3 water = mix(uOceanTint, uOceanShallowTint, shelf);
    // Keep a little of the source plate so currents and sediment still read.
    water = mix(water, water * 0.6 + dayTex * 2.0, 0.22);

    // Land: lift and warm it so continents read green/tan rather than the
    // muddy olive the raw plate gives at this exposure. Terrain pushes it
    // further for a physical-relief-map look.
    // These gains were calibrated against the older, duller 2048 plate.
    // The 4096 Blue Marble is a brighter and considerably more saturated
    // source, and the old numbers pushed the deserts past the top of the
    // red and green channels — where a sunlit Sahara stops being sand and
    // clips into flat neon yellow. Dialled back to suit the new plate.
    float landGain = isTerrain ? 1.45 : 1.20;
    float landSat = isTerrain ? 1.30 : 1.14;
    vec3 land = saturateColor(dayTex * landGain, landSat);

    // Highlight rolloff, the way film behaves: the brighter a surface gets,
    // the more it rolls toward neutral instead of toward a saturated
    // primary. This is what keeps the bright desert belt reading as
    // sun-bleached ground while leaving vegetation and ocean fully
    // coloured — a flat saturation cut would have drained those too.
    float landLum = dot(land, vec3(0.2126, 0.7152, 0.0722));
    float hot = smoothstep(0.52, 1.0, landLum);
    land = mix(land, vec3(landLum), hot * 0.42);
    land /= (1.0 + hot * 0.30);

    vec3 albedo = mix(land, water, oceanMask);
    albedo = saturateColor(albedo, isTerrain ? 1.14 : 1.06);

    if (isAnalytic) {
      // Data surface: drop the imagery back to a dim substrate so the
      // overlaid geometry (graticule, coastlines) is what carries meaning.
      float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
      albedo = mix(vec3(lum), albedo, 0.35) * 0.42;
      albedo = mix(albedo, uOceanTint * 0.5, oceanMask * 0.65);
    }

    // --- day side ---
    vec3 dayColor = albedo * (0.66 + 0.86 * clamp(NdotL, 0.0, 1.0));

    // --- ocean sun glint ---
    // The sea is a ROUGH mirror, not a polished one: millions of wave
    // facets scatter the sun into a broad, streaky sheen that is strongest
    // where the view grazes the surface. A single tight pow() lobe with a
    // high multiplier instead produces one saturated white disc pasted on
    // the middle of the globe, which is what this replaces.
    vec3 halfDir = normalize(lightDir + viewDir);
    float specAngle = max(dot(n, halfDir), 0.0);

    // Schlick fresnel — reflectance is near zero looking straight down at
    // water and climbs steeply toward the limb. This alone removes the
    // head-on hotspot.
    float vDotN = max(dot(n, viewDir), 0.0);
    float fresnelWater = 0.30 + 0.70 * pow(1.0 - vDotN, 3.0);

    // Wave roughness: break the lobe up so it reads as scattered glitter
    // across a swell rather than a clean geometric circle.
    float waves = fbm3(vec3(vUv * vec2(190.0, 95.0), 0.0), 3);
    float roughness = 0.72 + 0.56 * waves;

    // Tight lobes, not a broad wash: the shine should be a defined,
    // glittering band on the water, so keep the falloff steep and let the
    // wave noise do the spreading instead of a wide low-exponent haze.
    float wide = pow(specAngle, 14.0 * roughness);
    float core = pow(specAngle, 70.0 * roughness);
    float glint = (wide * 0.32 + core * 0.95) * fresnelWater;
    glint *= oceanMask * smoothstep(0.0, 0.35, NdotL);
    if (isAnalytic) glint *= 0.25;

    // Very light ambient sheen so unlit stretches of ocean still read as
    // water rather than flat paint — deliberately faint, since the defined
    // glint above is what should carry the shine.
    float sheen = oceanMask * smoothstep(-0.05, 0.75, NdotL)
                * (0.55 + 0.45 * fresnelWater) * 0.06;

    // Slightly cool, sky-coloured — water reflects the sky, not the bulb.
    dayColor += vec3(0.72, 0.82, 0.92) * glint;
    dayColor += vec3(0.42, 0.60, 0.82) * sheen;

    // --- night side: faint texture visibility + city-light map ---
    vec3 nightAmbient = dayTex * 0.05 + uAtmosphere * 0.012;
    float nightSide = 1.0 - dayMix;
    vec3 nightColor = nightAmbient + nightTex * 1.7 * nightSide;

    vec3 color = mix(nightColor, dayColor, dayMix);

    if (isAnalytic) {
      // Graticule at 15° intervals: 24 meridians, 12 parallels across the
      // equirectangular UV range.
      // Widths below are in screen pixels — a 1px graticule stays a 1px
      // graticule at every zoom level.
      float grid = max(
        gridLine(vUv.x, 24.0, 1.0),
        gridLine(vUv.y, 12.0, 1.0)
      );
      // Equator and prime meridian read heavier, as on a real chart.
      float axes = max(
        gridLine(vUv.x, 2.0, 1.9),
        gridLine(vUv.y, 1.0, 1.9)
      );
      // Coastlines: the ocean mask flips hard at the shore, so its screen
      // -space derivative IS the coastline. Cheaper and sharper than
      // trying to trace edges from the colour plate.
      // Dividing out the UV footprint makes this zoom-invariant too:
      // fwidth(oceanMask) shrinks as the camera closes in (fewer texels
      // crossed per pixel), so the raw derivative alone made coastlines
      // fade out at exactly the zoom level you'd want them sharpest.
      float uvStep = max(max(fwidth(vUv.x), fwidth(vUv.y)), 1e-6);
      float coast = clamp(fwidth(oceanMask) / uvStep * 0.009, 0.0, 1.0);

      float lit = 0.30 + 0.70 * dayMix;
      color += uGridColor * grid * 0.16 * lit;
      color += uGridColor * axes * 0.34 * lit;
      color += uGridColor * coast * 0.75 * lit;
    }

    // thin fresnel rim, lit-side only
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.5);
    color += uAtmosphere * fresnel * 0.2 * smoothstep(-0.1, 0.5, NdotL);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const cloudsVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudsFragmentShader = /* glsl */ `
  uniform sampler2D uCloudMap;
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vNormal);
    float NdotL = dot(n, normalize(uLightDir));
    float lit = smoothstep(-0.25, 0.4, NdotL);
    // Cloud density lives in the alpha channel of this texture — its RGB
    // is flat white everywhere, which is what made the cloud layer render
    // as blocky uniform coverage instead of actual wisps.
    float cloud = texture2D(uCloudMap, vUv).a;
    vec3 color = vec3(1.0) * (0.35 + 0.65 * lit);
    gl_FragColor = vec4(color, cloud * (0.55 + 0.35 * lit));
  }
`;
