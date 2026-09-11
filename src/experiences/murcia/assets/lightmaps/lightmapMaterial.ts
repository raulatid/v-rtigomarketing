import * as THREE from 'three';

/**
 * What every lightmapped surface of the city has in common.
 *
 * ## Unlit, on purpose
 *
 * The bake is diffuse direct + indirect light without albedo, so the texel IS
 * the light. `MeshBasicMaterial` takes it as its only illumination
 * (`meshbasic.glsl.js:88-92`: `indirectDiffuse += lightMapTexel * intensity /
 * PI`) and ignores the scene's hemisphere and directional lights entirely —
 * which is the point: a lit material would add the rig's 2.7 of irradiance on
 * top of light that is already in the texture.
 *
 * ## No trim texture
 *
 * The export embeds a neutral white trim so Blender could bake against the
 * same material graph the site renders. White multiplied in is no change, so
 * none of these materials sample it: base colour is vertex colour alone.
 *
 * ## The footprint clamp
 *
 * The atlases pack many UV islands with narrow gutters. Left to its own mip
 * selection, a distant sample would average a coarse level in which one
 * building's light has bled into its neighbour's. So the lookup is replaced
 * with `textureGrad` whose derivatives are scaled down whenever the screen-space
 * footprint exceeds the widest mip the gutters were sized for. Every mip is
 * still in the file; only how far a sample may reach is capped.
 */

export interface LightmapMaterialOptions {
  lightMap: THREE.Texture;
  lightMapIntensity: number;
  /** The atlas width in texels, for the footprint arithmetic. */
  atlasSize: number;
  /** Mip levels above the base a sample may reach (see `maxMipLevel`). */
  maxMip: number;
  /** Set for instanced receivers: the per-instance atlas rectangle. */
  instanced: boolean;
  /** Distinguishes programs whose GLSL differs. */
  programKey: string;
}

/** The per-instance rectangle in the atlas: `uv * xy + zw`. */
export const LIGHTMAP_ST_ATTRIBUTE = '_LIGHTMAP_ST';

const LOOKUP = 'texture2D( lightMap, vLightMapUv )';

/**
 * Builds the unlit lightmapped material for one receiver, carrying over from
 * the authored material only what changes how a surface is drawn.
 */
export function createLightmapMaterial(
  source: THREE.Material,
  options: LightmapMaterialOptions,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: source.side,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    depthWrite: source.depthWrite,
    toneMapped: source.toneMapped,
    lightMap: options.lightMap,
    lightMapIntensity: options.lightMapIntensity,
  });

  material.onBeforeCompile = (shader) => {
    if (options.instanced) {
      if (!shader.vertexShader.includes('#include <uv_vertex>')) {
        throw new Error('[lightmaps] three moved <uv_vertex>');
      }
      shader.vertexShader =
        `attribute vec4 ${LIGHTMAP_ST_ATTRIBUTE};\n` +
        shader.vertexShader.replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_LIGHTMAP\n' +
            `vLightMapUv = vLightMapUv * ${LIGHTMAP_ST_ATTRIBUTE}.xy + ${LIGHTMAP_ST_ATTRIBUTE}.zw;\n` +
            '#endif',
        );
    }
    if (!shader.fragmentShader.includes(LOOKUP)) {
      throw new Error('[lightmaps] three changed the lightmap lookup');
    }
    shader.uniforms.lightmapAtlasSize = { value: options.atlasSize };
    shader.uniforms.lightmapMaxFootprint = { value: 2 ** options.maxMip };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float lightmapAtlasSize;
uniform float lightmapMaxFootprint;
vec4 sampleCityLightmap( sampler2D atlas, vec2 uv ) {
  vec2 dx = dFdx( uv ), dy = dFdy( uv );
  float footprint = max( length( dx ), length( dy ) ) * lightmapAtlasSize;
  float scale = min( 1.0, lightmapMaxFootprint / max( footprint, 0.00001 ) );
  return textureGrad( atlas, uv, dx * scale, dy * scale );
}
`,
      )
      .replace(LOOKUP, 'sampleCityLightmap( lightMap, vLightMapUv )');
  };
  // The uniform VALUES differ per material and live on the material; only the
  // GLSL is shared, and it differs by whether the ST patch is in.
  material.customProgramCacheKey = () => options.programKey;
  return material;
}

/**
 * The sampler state every atlas needs, set once per texture.
 *
 * `channel = 1` reads TEXCOORD_1, the lightmap UV. Mipmaps are already in the
 * KTX2 and must not be regenerated (a compressed texture cannot be, and asking
 * warns). Clamped, because an atlas has nothing meaningful past its edge, and
 * `flipY = false` for the same reason the trim sheet sets it: glTF's UV origin
 * is the top left. Anisotropy stays at 1 — the footprint clamp above is doing
 * the filtering job, and anisotropic taps would reach across gutters.
 */
export function prepareLightmapTexture(texture: THREE.Texture, uvChannel: number): void {
  texture.channel = uvChannel;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

/**
 * An unlit twin of the authored material for surfaces that are NOT baked but
 * sit beside baked ones — the outer ground. Lit, a flat plate under the rig
 * reads at 2.7 of irradiance and blows out next to the baked streets; unlit it
 * is simply its vertex colour, which is what the bake preview showed the
 * artist.
 */
export function createUnlitVertexColourMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: source.side,
    toneMapped: source.toneMapped,
  });
}
