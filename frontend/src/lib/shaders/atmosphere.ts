export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec3 uLightDir;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Two-part limb: a soft wide halo plus a brighter thin edge. A single
    // high-exponent term gives a hairline that reads as an outline rather
    // than the thick blue shell of air you see from orbit.
    float rim = 1.0 - max(dot(n, viewDir), 0.0);
    // Weighted toward the wide halo — a strong narrow term makes the limb
    // read as an inked outline around the disc rather than as air.
    float halo = pow(rim, 2.2) * 0.62;
    float edge = pow(rim, 5.0) * 0.30;

    // Scatter mostly where sunlight grazes the limb, but keep a floor so
    // the halo wraps the whole disc instead of vanishing on the dark side.
    float lit = 0.25 + 0.75 * smoothstep(-0.55, 0.4, dot(-n, normalize(uLightDir)));

    gl_FragColor = vec4(uColor, (halo + edge) * lit * uIntensity);
  }
`;
