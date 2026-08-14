import * as THREE from 'three'

import { POINT_SPRITE_FALLOFF } from './pointSprite'

// The warp tunnel's material. Replaces a `PointsMaterial`, which drew every
// star as a SQUARE — bare point sprites are square unless the fragment shader
// makes them round, and once bloom landed each square got a halo that made the
// boxes plain to see during the warp.
//
// Distinct from `starShader` in three ways, all of which are why this is a
// separate material rather than a flag on that one:
//
//   - SIZE ATTENUATION. These stars sit in a 300x300x500 box the camera flies
//     through, so they must grow as they approach; the backdrop's sit on a
//     radius-180 shell where an attenuated point would collapse to sub-pixel.
//   - ADDITIVE. This field exists to be smeared by the FOV surge and the
//     afterimage pass, and additive is what makes the streaks build. The
//     backdrop is deliberately NOT additive, because a backdrop blended
//     additively hazes everything drawn after it, including the Earth's limb.
//   - One uniform colour, no per-point magnitude, no twinkle. It is on screen
//     for 2.6 seconds at high speed; none of that would register.
//
// ── Reproducing three's attenuation exactly ──
// A raw `ShaderMaterial` does NOT receive the `size` and `scale` uniforms three
// feeds its built-in points shader, so the attenuation has to be rebuilt here
// or every star changes size. From `refreshUniformsPoints` and the points
// vertex shader in three 0.174:
//
//   size  = material.size * pixelRatio
//   scale = height * 0.5            // CSS height, not drawing-buffer height
//   gl_PointSize = size * scale / -mvPosition.z
//
// Both factors are folded into `uSizeScale` and pushed per frame, because
// pixel ratio and viewport height both change at runtime. Get the CSS/device
// height distinction wrong and the field is right on one display and wrong on
// every other.

const vertexShader = /* glsl */ `
  uniform float uSizeScale;
  uniform float uMaxSize;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // -mvPosition.z is the view-space distance; guarded because a point exactly
    // on the camera plane would otherwise produce an infinite gl_PointSize,
    // which some drivers turn into a full-screen quad rather than nothing.
    //
    // Then clamped, because the guard alone bounds the arithmetic and not the
    // result. The camera flies THROUGH this box, so -mvPosition.z genuinely
    // approaches zero: on a phone uSizeScale is ~760, which asks for a 760px
    // sprite at a view distance of 1 and ~760000 at the guard floor. Drivers
    // clamp that themselves — to ALIASED_POINT_SIZE_RANGE, which on iOS is far
    // below either figure — so the effect was already bounded, just bounded
    // differently on every device, and invisibly. Doing it here makes the warp
    // look the same everywhere and keeps a handful of near stars from each
    // rasterising an enormous additive quad during the heaviest frames in the
    // application. uMaxSize is seeded from the real driver limit; see
    // Starfield.tsx.
    gl_PointSize = min(uSizeScale / max(-mvPosition.z, 0.001), uMaxSize);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  ${POINT_SPRITE_FALLOFF}

  void main() {
    gl_FragColor = vec4(uColor, pointSpriteFalloff() * uOpacity);

    // Required: a raw ShaderMaterial gets no output colour conversion appended,
    // and the omission fails as "looks a bit dark" rather than as an error.
    #include <colorspace_fragment>
  }
`

export function createWarpStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: 0 },
      // Replaced with the driver's real ceiling as soon as there is a renderer
      // to ask. The default is a fallback, not a policy: it has to be large
      // enough that a device reporting a generous limit is not quietly capped
      // below what it can do, and every real limit is at least 64.
      uMaxSize: { value: 1024 },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.9 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/**
 * The combined `size * pixelRatio * height * 0.5` factor three would have
 * supplied. `cssHeight` is the viewport height in CSS pixels — R3F's
 * `state.size.height`, NOT `gl.domElement.height`, which is already multiplied
 * by the pixel ratio and would square it.
 */
export function warpStarSizeScale(
  worldSize: number,
  pixelRatio: number,
  cssHeight: number,
): number {
  return worldSize * pixelRatio * cssHeight * 0.5
}

/**
 * The largest point the GPU will actually rasterise, in device pixels.
 *
 * Asked rather than assumed, and asked once — this is a static driver limit, so
 * a per-frame `getParameter` would be a synchronous GL query in a hot path for
 * a value that cannot change. Capability detection, not device detection: the
 * limit varies by GPU, not by user agent.
 *
 * Returns null when the parameter is unavailable, which the caller reads as
 * "keep the fallback" rather than as "no limit".
 */
export function maxPointSize(gl: THREE.WebGLRenderer): number | null {
  // The enum is read off the live context rather than the global
  // `WebGLRenderingContext`, which does not exist when `checks/` bundles these
  // modules for Node.
  const ctx = gl.getContext()
  const range = ctx.getParameter(ctx.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
  const ceiling = range?.[1]
  return typeof ceiling === 'number' && ceiling > 0 ? ceiling : null
}
