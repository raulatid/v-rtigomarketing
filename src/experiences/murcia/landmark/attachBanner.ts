import * as THREE from 'three';
import type { BuildingBanner } from '../../../content/types';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * The banner on the Vertigo tower's sign (plan 019 §2).
 *
 * Three steps, kept apart on purpose:
 *
 *   generated content  →  `resolveBannerSource`  →  `attachBanner`
 *   (site settings)       (which image, if any)     (a texture on the band)
 *
 * The content layer knows nothing about three.js and this module knows nothing
 * about Sanity: it is handed a URL that the content build has already mirrored
 * to this origin (`content/lib/mirror.ts`), or the city's own placeholder, and
 * both go through exactly the same loader and the same material. There is no
 * placeholder-specific rendering to remove later.
 *
 * ## The material
 *
 * The sign is sleeved in LEDs, so it reads as a lit screen: an UNLIT
 * `MeshBasicMaterial`, `toneMapped: false` so the picture is not graded by the
 * scene's ACES curve — the same pair `DistrictHighlight` uses for the ground
 * marker, and for the same reason. The image is read as sRGB colour with the
 * glTF flip the rest of the city's textures keep.
 *
 * ## The UVs
 *
 * The band's authored UVs are a top-down projection (each side face collapses
 * onto one edge of the UV square — `vertigoBuildingConfig.ts` records the
 * measurement), so `bannerFaceUvs` maps the four faces from the geometry
 * itself: 0..1 across each face as seen from outside, 0..1 down each face.
 * That is a contract on the band's SHAPE — an axis-aligned box in its local
 * frame, normals out — rather than on how the .blend unwraps it, and it is the
 * only geometry this module writes.
 *
 * ## Ownership
 *
 * The material hangs on a mesh under the city's root, so `disposeLoadedCity`
 * takes it and its texture down with everything else — nothing here keeps a
 * second reference to release. The one case that needs a hand is a texture
 * that lands AFTER the experience was disposed; `dispose()` marks that, and the
 * late texture is released on arrival instead of leaking on the GPU.
 *
 * ## Video, documented and NOT built
 *
 * `BannerSource.kind` is the seam. A future `'video'` variant must satisfy at
 * least: a mandatory static poster (the image path above, shown until the
 * first frame and as the whole answer on mobile and under reduced motion);
 * MP4/H.264, no audio track; under 1 MB with a hard limit of 1.5 MB; a
 * resolution no larger than the band needs (the faces are ~1.84:1 and 1024
 * wide is already plenty); no preload during boot — fetched and played only
 * while Murcia is the active experience, paused on leaving it and when the
 * page is hidden; an explicit lifecycle that disposes the `VideoTexture` and
 * releases the element; and the file mirrored to this origin at build time
 * like the image is. None of `VideoTexture`, `<video>`, autoplay handling or a
 * CSP change exists yet, and none should be added ahead of a consumer.
 */

export type BannerSource = { kind: 'image'; url: string };

export interface BannerAttachment {
  /** True once the image is on the band; false if there was nothing to do. */
  ready: Promise<boolean>;
  dispose(): void;
}

/**
 * Which image the band shows, if any.
 *
 * The switch decides whether there is a banner at all. The IMAGE decides only
 * whose it is: the client's mirrored upload, or the city's placeholder when
 * they have not uploaded one yet — through the same path, so the day the real
 * asset lands nothing about the rendering changes.
 */
export function resolveBannerSource(
  banner: BuildingBanner,
  placeholder: string,
): BannerSource | null {
  if (!banner.enabled) return null;
  return { kind: 'image', url: banner.image ?? placeholder };
}

/**
 * Maps the band's four side faces from its geometry: U 0..1 left-to-right as
 * seen from OUTSIDE each face, V 0..1 top-to-bottom (glTF's origin is the
 * top-left corner and the texture keeps the glTF flip, so V grows downward).
 *
 * A vertex whose normal is not a side (a top or bottom face, should an export
 * ever add one) keeps whatever UV it had rather than being guessed at.
 */
export function bannerFaceUvs(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const width = Math.max(box.max.x - box.min.x, Number.EPSILON);
  const depth = Math.max(box.max.z - box.min.z, Number.EPSILON);
  const height = Math.max(box.max.y - box.min.y, Number.EPSILON);

  const previous = geometry.getAttribute('uv');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    if (Math.abs(ny) >= 0.5) {
      if (previous) {
        uv[i * 2] = previous.getX(i);
        uv[i * 2 + 1] = previous.getY(i);
      }
      continue;
    }
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    let across: number;
    if (nz > 0.5) across = (x - box.min.x) / width;
    else if (nz < -0.5) across = (box.max.x - x) / width;
    else if (nx > 0.5) across = (box.max.z - z) / depth;
    else across = (z - box.min.z) / depth;
    uv[i * 2] = across;
    uv[i * 2 + 1] = (box.max.y - y) / height;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Anisotropic filtering, the same 4 the trim sheet gets (`loadCity.ts`,
 * `TRIM_ANISOTROPY`): the band is seen at a grazing angle from the resting
 * pose, and the number is restated rather than imported so this module stays
 * independent of the city loader.
 */
const BANNER_ANISOTROPY = 4;

/** Puts the image on the band. Synchronous, so a test can hold the mesh. */
export function applyBanner(mesh: THREE.Mesh, texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = BANNER_ANISOTROPY;
  texture.needsUpdate = true;

  bannerFaceUvs(mesh.geometry);

  // Replace, never mutate or dispose: the material the band arrives with is
  // the one `applyTrimSheet` handed to EVERY mesh in the city.
  mesh.material = new THREE.MeshBasicMaterial({
    name: 'MAT_VERTIGO_BANNER',
    map: texture,
    toneMapped: false,
  });
}

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true;

export function attachBanner(
  root: THREE.Object3D,
  config: VertigoBuildingConfig,
  source: BannerSource,
): BannerAttachment {
  const match = findByAnyNameSpelling(root, config.bannerNodeName, isMesh);
  if (!match) {
    console.warn(
      `[vertigo] no "${config.bannerNodeName}" mesh in the model; the sign shows no banner. ` +
        'checks/city-asset.ts asserts this contract — run `npm run check:asset:contract`.',
    );
    return { ready: Promise.resolve(false), dispose() {} };
  }
  const mesh = match.object as THREE.Mesh;

  let disposed = false;
  const ready = new THREE.TextureLoader().loadAsync(source.url).then(
    (texture) => {
      if (disposed) {
        texture.dispose();
        return false;
      }
      applyBanner(mesh, texture);
      return true;
    },
    (error: unknown) => {
      // A texture, not the model: the sign keeps the city's material and the
      // city stands. Same bargain the trim sheet strikes.
      console.warn(`[vertigo] banner failed to load from ${source.url}; the sign stays plain`, error);
      return false;
    },
  );

  return {
    ready,
    dispose() {
      disposed = true;
    },
  };
}
