import * as THREE from 'three'

// The backdrop star field's material. One draw call for the whole sky, where
// the shipped version needed three: `PointsMaterial` has no per-point size, so
// magnitude used to be faked with three `Points` objects at fixed sizes and
// opacities. A per-point `aSize` attribute removes the need for that entirely.
//
// Deliberately NOT additive, for the same reason the material it replaces was
// not: a backdrop blended additively hazes everything drawn after it, including
// the Earth's limb.

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uTwinkleAmount;
  uniform float uTwinkleSizeMin;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;

    // Twinkle modulates ALPHA, never gl_PointSize. Animating the size makes the
    // point snap across integer pixel boundaries, which reads as flicker rather
    // than as a star — and at 1px it is pure noise. Only the large stars
    // scintillate, which is also what the eye actually sees.
    float bright = smoothstep(uTwinkleSizeMin, uTwinkleSizeMin + 0.4, aSize);
    float t = uTime * (0.6 + aPhase * 1.4) + aPhase * 6.2831853;
    vTwinkle = 1.0 - uTwinkleAmount * bright * (0.5 + 0.5 * sin(t));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // Constant screen-space size, as this backdrop has always used: at 180
    // units an attenuated point collapses to sub-pixel and vanishes. These
    // values are pixels.
    gl_PointSize = aSize;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    // A soft radial falloff rather than the hard square a plain point sprite
    // gives. Squaring it tightens the core so bright stars gain a small glow
    // without the field turning into a haze.
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float falloff = 1.0 - smoothstep(0.0, 1.0, r);
    if (falloff <= 0.0) discard;

    gl_FragColor = vec4(vColor, falloff * falloff * vTwinkle * uOpacity);

    // Required: a raw ShaderMaterial gets no output colour conversion appended,
    // and the omission fails as "looks a bit dark" rather than as an error.
    #include <colorspace_fragment>
  }
`

export function createStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkleAmount: { value: 0 },
      uTwinkleSizeMin: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
}
