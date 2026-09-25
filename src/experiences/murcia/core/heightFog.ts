import * as THREE from 'three';

/**
 * Ground fog for the city's outskirts: thick at street level, thinning with
 * height, and absent over the authored plate.
 *
 * three's `Fog` is a function of distance from the camera, which fogs the
 * plate as much as the periphery once the camera pulls back and changes with
 * every zoom and flight. This is a function of world position instead: how far
 * a point lies outside the plate rectangle (`fogNear` to `fogFar`, the two
 * uniforms `THREE.Fog` already uploads live) and how high above the ground it
 * is. The layer thickens with distance, so the far rings melt into the
 * horizon rather than keeping crisp roofs above a flat band.
 *
 * It replaces three's fog chunks, which are global, so it reaches every
 * material that compiles with `USE_FOG` — in this application only the Murcia
 * scene sets fog. The plate rectangle and the layer height are compiled in as
 * constants: `warm()` compiles every program once, so they are fixed at the
 * first install, and a later install with other values is refused rather than
 * leaving already-compiled programs silently out of step.
 *
 * The vertex stage rebuilds the world position from `mvPosition`, which every
 * shader that includes `<fog_vertex>` has, including the river's: the view
 * matrix is a rigid transform, so world = viewRotationᵀ · mv + cameraPosition.
 */
export interface HeightFogShape {
  /** The rectangle the fog stays off, in world XZ. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** World Y of the ground. */
  groundY: number;
  /** Thickness of the layer at `fogNear`; it grows to three times this by `fogFar`. */
  height: number;
}

let installed: string | null = null;

const glslFloat = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error(`[heightFog] not a finite number: ${value}`);
  return value.toFixed(3);
};

export function installHeightFog(shape: HeightFogShape): void {
  const { bounds, groundY, height } = shape;
  if (!(height > 0)) throw new Error(`[heightFog] height must be positive: ${height}`);
  const cx = glslFloat((bounds.minX + bounds.maxX) / 2);
  const cz = glslFloat((bounds.minZ + bounds.maxZ) / 2);
  const hx = glslFloat((bounds.maxX - bounds.minX) / 2);
  const hz = glslFloat((bounds.maxZ - bounds.minZ) / 2);

  const key = [cx, cz, hx, hz, glslFloat(groundY), glslFloat(height)].join();
  if (installed === key) return;
  if (installed !== null) throw new Error('[heightFog] already installed with a different shape');
  installed = key;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPosition;
#endif
`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPosition = transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition;
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vFogWorldPosition;
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec2 fogOutside = max( abs( vFogWorldPosition.xz - vec2( ${cx}, ${cz} ) ) - vec2( ${hx}, ${hz} ), 0.0 );
  float fogRadial = smoothstep( fogNear, fogFar, length( fogOutside ) );
  float fogTop = ${glslFloat(height)} * ( 1.0 + 2.0 * fogRadial );
  float fogLow = 1.0 - smoothstep( 0.0, fogTop, vFogWorldPosition.y - ${glslFloat(groundY)} );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogRadial * fogLow );
#endif
`;
}
