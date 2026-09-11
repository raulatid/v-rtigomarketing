import * as THREE from 'three';
import { staged, type FacadeComposition } from './facadeComposition';
import fragmentShader from './shaders/facade.frag';
import vertexShader from './shaders/facade.vert';

/**
 * The media facade: content on one side, appearance on the other.
 *
 * ```
 *   FacadeComposition          (typography, numbers, charts — knows metres)
 *         ↓ draw(ctx, progress)
 *   offscreen 2D canvas  ×2    (one shown, one being prepared)
 *         ↓
 *   THREE.CanvasTexture  ×2
 *         ↓ uMapA / uMapB / uBlend
 *   facade ShaderMaterial      (emissive, LED field, wake, edges)
 *         ↓
 *   the authored UVs of the export's screen mesh
 * ```
 *
 * ## It owns no navigation and no clock
 *
 * `setComposition` and `setProgress` are the entire input surface. Which service
 * is active and how far its transition has run are decided by `carousel.ts`;
 * this consumes those two values and would not change
 * if they came from a scroll wheel, a route, or a test. `update(dt)` advances
 * only the crossfade and the shimmer — never progress.
 *
 * ## Two canvases, because a crossfade needs the outgoing frame to still exist
 *
 * A single canvas cannot show the old service while the new one is being drawn
 * into it. So there are two, blended by `uBlend`. The OUTGOING one is frozen at
 * its last frame while it fades — it is leaving, and repainting a composition
 * nobody will look at again for the duration of a fade doubles the most
 * expensive thing this module does.
 *
 * ## Redraw is gated
 *
 * A repaint is the cost centre: at 2048 the tower's canvas is 569×2048, over a
 * million pixels to draw and several MB to upload. So `needsUpdate` is set on exactly one path — `repaint()` —
 * and `update` calls it only when the frame would actually differ: progress
 * moved, the composition changed, or the composition declares intrinsic motion.
 * At rest the facade costs one draw call and nothing else.
 */

/**
 * The site's two faces, which siteHeader.css declares for every document
 * (`'Vertigo Display'` and `'Vertigo Text'`). A canvas does not make the browser
 * fetch a declared face the way a styled element does, so the facade asks for
 * both by name; `load` downloads whichever is not in yet.
 */
const FACADE_FACES = ['700 16px "Vertigo Display"', '500 16px "Vertigo Text"'] as const;

/**
 * One load per page, shared by every facade instance.
 *
 * A promise rather than a value so two facades built in the same frame await one
 * fetch, and module-level so switching experiments does not ask twice.
 */
let fontPromise: Promise<boolean> | null = null;

function loadFacadeFont(): Promise<boolean> {
  fontPromise ??= (async () => {
    try {
      const loaded = await Promise.all(FACADE_FACES.map((face) => document.fonts.load(face)));
      // `load` resolves with an empty list, rather than rejecting, when no
      // declaration matches — a stylesheet that did not arrive, or a renamed
      // family. That is a failure here, not a success with nothing to show.
      const missing = FACADE_FACES.filter((_, i) => loaded[i]!.length === 0);
      if (missing.length > 0) throw new Error(`no face declared for ${missing.join(', ')}`);
      return true;
    } catch (error) {
      console.warn(
        '[vertigo] the facade faces did not load; the facade will draw in the' +
          ' system stack and its metrics will not match the design',
        error,
      );
      // Not cleared: a font that failed once will fail the same way on every
      // repaint, and retrying per frame would be a request storm.
      return false;
    }
  })();
  return fontPromise;
}

/**
 * The facade's real size, read off the mesh rather than written down.
 *
 * Measured as METRES PER UV UNIT along each axis: for every triangle, the length
 * of ∂position/∂u and of ∂position/∂v, averaged by the triangle's UV area. That
 * is exactly what `pxPerMetre` needs — how far one unit of u travels ON THE
 * BUILDING — and it is the true arc length along a curved screen, not a
 * bounding-box width. It asks nothing of the screen's outline, which matters
 * here: `LED_Main` is not a rectangle in UV — its top edge covers only
 * u 0.13..0.86 and its bottom sweeps a curve.
 *
 * Measured on `LED_Main`: 42.80 m × 154.06 m, an aspect of 0.2778 — the
 * 1024 × 3686 of its UV artwork to four places, which is what physical-aspect
 * UVs promise. Doing it this way is what lets a re-export that rescales or
 * reshapes a screen work without a constant here being edited.
 */
export function measureFacade(geometry: THREE.BufferGeometry): {
  metresWide: number;
  metresTall: number;
} {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const boxTall = box ? box.max.y - box.min.y : 1;

  if (!position || !uv) return { metresWide: boxTall, metresTall: boxTall };

  const count = index ? index.count : position.count;
  const vertex = (k: number): number => (index ? index.getX(k) : k);

  let perU = 0;
  let perV = 0;
  let area = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    const a = vertex(k);
    const b = vertex(k + 1);
    const c = vertex(k + 2);

    const du1 = uv.getX(b) - uv.getX(a);
    const dv1 = uv.getY(b) - uv.getY(a);
    const du2 = uv.getX(c) - uv.getX(a);
    const dv2 = uv.getY(c) - uv.getY(a);
    const det = du1 * dv2 - du2 * dv1;
    // A triangle with no area in UV says nothing about the mapping.
    if (Math.abs(det) < 1e-12) continue;

    const e1 = [
      position.getX(b) - position.getX(a),
      position.getY(b) - position.getY(a),
      position.getZ(b) - position.getZ(a),
    ];
    const e2 = [
      position.getX(c) - position.getX(a),
      position.getY(c) - position.getY(a),
      position.getZ(c) - position.getZ(a),
    ];
    let pu = 0;
    let pv = 0;
    for (let axis = 0; axis < 3; axis++) {
      pu += ((e1[axis]! * dv2 - e2[axis]! * dv1) / det) ** 2;
      pv += ((e2[axis]! * du1 - e1[axis]! * du2) / det) ** 2;
    }

    const weight = Math.abs(det) / 2;
    perU += Math.sqrt(pu) * weight;
    perV += Math.sqrt(pv) * weight;
    area += weight;
  }

  if (area <= 0) return { metresWide: boxTall, metresTall: boxTall };
  return { metresWide: perU / area, metresTall: perV / area };
}

/**
 * A measured size, scaled so its width is `designMetresWide`.
 *
 * Uniform, so the aspect — which is the mesh's own — survives. This is the
 * whole of the applied-scale fix: a screen exported at 0.307 of its modelled
 * size measures 0.307 of the metres, and comes out of here at the design width
 * it was laid out for. Omitted or non-positive, the measurement stands.
 */
export function toDesignMetres(
  measured: { metresWide: number; metresTall: number },
  designMetresWide?: number,
): { metresWide: number; metresTall: number } {
  if (!designMetresWide || designMetresWide <= 0 || measured.metresWide <= 0) return measured;
  const unit = designMetresWide / measured.metresWide;
  return { metresWide: designMetresWide, metresTall: measured.metresTall * unit };
}

/**
 * The soft top and bottom edge, in design METRES. Held as a fraction of v it
 * would scale with the surface, and on a 154 m screen a fraction tuned for a
 * short band is a 7 m fade.
 */
const EDGE_FALLOFF_METRES = 0.305;

export const FACADE_COLORS = {
  /** The wall's emissive cast. Neutral by default — the canvas carries the hue. */
  tint: 0xffffff,
} as const;

export interface MediaFacadeOptions {
  readonly mesh: THREE.Mesh;
  /** Long-axis texture size in pixels. */
  readonly resolution: number;
  readonly anisotropy: number;
  /**
   * The width, in metres, the compositions were DESIGNED for. The measured size
   * is scaled to it, so a screen exported smaller — the city's tower has its
   * scale applied at ~0.307 — shows the same layout, LED pitch and edge fade as
   * one at full size. Omitted, the measured metres are used as they are.
   */
  readonly designMetresWide?: number;
  /**
   * Whether the canvas is flipped on upload. Off for a screen whose v runs top
   * to bottom (the tower's); on for one whose v runs bottom to top (the
   * campus ring). Either way canvas (0,0) is the screen's top-left.
   */
  readonly flipY?: boolean;
}

export interface MediaFacade {
  readonly material: THREE.ShaderMaterial;
  readonly metresWide: number;
  readonly metresTall: number;
  /** Crossfades to `composition`. A repeat of the current one is ignored. */
  setComposition(composition: FacadeComposition | null): void;
  /** The 0..1 transition clock. Repainting is deferred to the next `update`. */
  setProgress(progress: number): void;
  setResolution(longAxis: number): void;
  setBrightness(value: number): void;
  setLed(strength: number, pitchMetres: number): void;
  setIdleGlow(value: number): void;
  setShimmer(value: number): void;
  /** Slides the picture along u at `turnsPerSecond` of the strip; 0 holds it. */
  setScroll(turnsPerSecond: number): void;
  /** Multiplies every composition's own dust strength. 0 switches the field off. */
  setDust(scale: number): void;
  setFadeSeconds(value: number): void;
  update(dt: number): void;
  dispose(): void;
}

interface Slot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  composition: FacadeComposition | null;
  /** The progress this slot was last painted at; NaN means never. */
  drawnAt: number;
}

export function createMediaFacade(options: MediaFacadeOptions): MediaFacade {
  // Everything below — pixels per metre, the LED pitch, the edge fade, dust —
  // works in these DESIGN metres, which is what makes an applied export scale
  // invisible. The aspect is the mesh's own either way.
  const { metresWide, metresTall } = toDesignMetres(
    measureFacade(options.mesh.geometry),
    options.designMetresWide,
  );
  const aspect = metresWide / metresTall;

  let resolution = Math.max(256, Math.round(options.resolution));
  let disposed = false;
  let elapsed = 0;
  /** Turns of the strip per second the picture slides by. */
  let scrollSpeed = 0;
  let progress = 0;
  let fadeSeconds = 0.6;
  /**
   * Which asset load is still wanted.
   *
   * Bumped per `setComposition`, so a service switched away from mid-download
   * cannot mark a slot stale that now belongs to a different composition. The
   * same idiom the experiment uses for model loads.
   */
  let assetToken = 0;
  /** A global multiplier over every composition's own dust strength, for the panel. */
  let dustScale = 1;

  /**
   * A texture is bound to the canvas SIZE it was created at, so this exists to
   * be called again after a resize.
   *
   * Three allocates GPU storage for a canvas texture once and thereafter uploads
   * into it. Resizing the canvas underneath a live texture does not reallocate
   * that storage, and the next upload copies at the old dimensions:
   *
   *   GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset overflows texture
   *   dimensions.
   *
   * The failure is worse than a crash, because there is not one — the draw call
   * is dropped and the previously uploaded image stays on screen, so a facade
   * switched to 4096 goes on showing its 2048 texture and looks like it worked.
   * `setResolution` therefore replaces the texture rather than reusing it.
   */
  const makeTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvas);
    // MEASURED, NOT ASSUMED: `LED_Main`'s v runs top-to-bottom (v=0 at the top
    // of its artwork), so the default `flipY` renders every composition rotated
    // 180°. With it
    // off, canvas (0,0) is the facade's top-left and 2D coordinates map straight
    // through — which is why no composition needs a transform.
    texture.flipY = options.flipY ?? false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = options.anisotropy;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // The screen is one curved quad strip, seen at grazing angles from across
    // the city, where mipmapped minification is what keeps it from shimmering.
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  };

  /**
   * `resolution` is the LONG axis, whichever that is. Taken as the width, a
   * portrait screen would make 2048 mean 2048 × 7373.
   */
  const sizeCanvas = (canvas: HTMLCanvasElement): void => {
    canvas.width = aspect >= 1 ? resolution : Math.max(1, Math.round(resolution * aspect));
    canvas.height = aspect >= 1 ? Math.max(1, Math.round(resolution / aspect)) : resolution;
  };

  const makeSlot = (): Slot => {
    const canvas = document.createElement('canvas');
    sizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[vertigo] no 2D context for the media facade');
    return { canvas, ctx, texture: makeTexture(canvas), composition: null, drawnAt: Number.NaN };
  };

  const slots: [Slot, Slot] = [makeSlot(), makeSlot()];
  /** Which slot is fully shown once no fade is running. */
  let activeSlot: 0 | 1 = 0;
  let fadeTarget: 0 | 1 = 0;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    uniforms: {
      uMapA: { value: slots[0].texture },
      uMapB: { value: slots[1].texture },
      uBlend: { value: 0 },
      uProgress: { value: 0 },
      uWakeEnd: { value: 0.28 },
      uBrightness: { value: 1.35 },
      uTint: { value: new THREE.Color().setHex(FACADE_COLORS.tint, THREE.SRGBColorSpace) },
      uLedPitch: { value: 0.09 },
      uLedStrength: { value: 0.34 },
      uIdleGlow: { value: 0.012 },
      uShimmer: { value: 0.35 },
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uMetres: { value: new THREE.Vector2(metresWide, metresTall) },
      uEdgeFalloff: { value: EDGE_FALLOFF_METRES / metresTall },
      uDustRectA: { value: new THREE.Vector4(0, 0, 0, 0) },
      uDustRectB: { value: new THREE.Vector4(0, 0, 0, 0) },
      uDustStrengthA: { value: 0 },
      uDustStrengthB: { value: 0 },
      uDustDensity: { value: 7 },
      uDustSpeed: { value: 1 },
    },
  });

  options.mesh.material = material;

  /**
   * Pushes one slot's dust rect and strength to the material.
   *
   * The rect converts from METRES to UV here because this is the only place that
   * knows how many metres the screen is — a spec declares physical sizes and never
   * texture coordinates.
   *
   * `at` is the progress the slot is being drawn at, which is NOT always the
   * live one: the outgoing slot of a crossfade is frozen at its last painted
   * frame, and its dust has to stay staged where its picture is rather than
   * following a clock that now belongs to the incoming composition.
   */
  const applyDust = (slot: Slot, index: 0 | 1, at: number): void => {
    const rectUniform = material.uniforms[index === 0 ? 'uDustRectA' : 'uDustRectB']!;
    const strengthKey = index === 0 ? 'uDustStrengthA' : 'uDustStrengthB';
    const dust = slot.composition?.dust;

    if (!dust) {
      material.uniforms[strengthKey]!.value = 0;
      return;
    }

    const [x, y, w, h] = dust.rect;
    // Metres from the top-left, like every block; a flipped upload puts the
    // canvas top at v = 1, so the rectangle is mirrored to match.
    const top = options.flipY ? 1 - (y + h) / metresTall : y / metresTall;
    (rectUniform.value as THREE.Vector4).set(x / metresWide, top, w / metresWide, h / metresTall);
    const arrived = staged(at, dust.stage[0], dust.stage[1]);
    material.uniforms[strengthKey]!.value = arrived * dust.strength * dustScale;
    material.uniforms['uDustDensity']!.value = dust.density;
    material.uniforms['uDustSpeed']!.value = dust.speed;
  };

  /** The single place a canvas is painted and a texture invalidated. */
  const repaint = (slot: Slot): void => {
    if (!slot.composition) {
      slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
      slot.texture.needsUpdate = true;
      slot.drawnAt = progress;
      return;
    }
    slot.composition.draw({
      ctx: slot.ctx,
      width: slot.canvas.width,
      height: slot.canvas.height,
      pxPerMetre: slot.canvas.width / metresWide,
      metresWide,
      metresTall,
      progress,
    });
    slot.texture.needsUpdate = true;
    slot.drawnAt = progress;
  };

  // Drawn once at construction so the facade is never a blank frame, then again
  // when the real face arrives — canvas 2D silently substitutes the fallback
  // stack and its metrics are not the design's.
  void loadFacadeFont().then((ok) => {
    if (disposed || !ok) return;
    // Invalidating both slots is enough: `update` repaints the shown one on the
    // next frame, and an idle slot is repainted when it next becomes incoming.
    for (const slot of slots) slot.drawnAt = Number.NaN;
  });

  return {
    material,
    metresWide,
    metresTall,

    setComposition(composition) {
      const active = slots[activeSlot];
      // Early-out guard, per the house rule: a repeat must not restart a fade.
      if (active.composition?.id === composition?.id && fadeTarget === activeSlot) return;

      const incoming: 0 | 1 = activeSlot === 0 ? 1 : 0;
      slots[incoming].composition = composition;
      slots[incoming].drawnAt = Number.NaN;
      // Painted NOW, without waiting for assets. A composition draws a complete
      // frame without its images, so the fade starts on this frame rather than
      // whenever the network gets round to it.
      repaint(slots[incoming]);
      fadeTarget = incoming;

      const token = ++assetToken;
      void composition?.load?.().then(() => {
        // Superseded, or the facade was disposed while this was in flight.
        if (disposed || token !== assetToken) return;
        // Stale rather than repainted directly: `update` owns repainting, so the
        // arriving image costs at most one paint on the next frame.
        slots[incoming].drawnAt = Number.NaN;
      });
    },

    setProgress(next) {
      // Deferred, not immediate: several callers in one frame must not each buy
      // a repaint. `update` collapses them into at most one.
      progress = Math.min(1, Math.max(0, next));
      material.uniforms['uProgress']!.value = progress;
    },

    setResolution(longAxis) {
      const next = Math.max(256, Math.round(longAxis));
      if (next === resolution) return;
      resolution = next;
      slots.forEach((slot, index) => {
        sizeCanvas(slot.canvas);

        // A NEW texture, not the old one flagged dirty — see `makeTexture`.
        // Reusing it uploads into storage sized for the previous resolution and
        // silently keeps showing the stale image.
        slot.texture.dispose();
        slot.texture = makeTexture(slot.canvas);
        material.uniforms[index === 0 ? 'uMapA' : 'uMapB']!.value = slot.texture;

        // Resizing a canvas resets its context state and clears it, so whatever
        // was drawn is gone and the slot must be repainted, not just flagged.
        slot.drawnAt = Number.NaN;
        repaint(slot);
      });
    },

    setBrightness(value) {
      material.uniforms['uBrightness']!.value = value;
    },
    setLed(strength, pitchMetres) {
      material.uniforms['uLedStrength']!.value = strength;
      material.uniforms['uLedPitch']!.value = Math.max(0.005, pitchMetres);
    },
    setIdleGlow(value) {
      material.uniforms['uIdleGlow']!.value = value;
    },
    setScroll(turnsPerSecond) {
      scrollSpeed = turnsPerSecond;
    },
    setShimmer(value) {
      material.uniforms['uShimmer']!.value = value;
    },
    setDust(scale) {
      // Applied on the next frame by `applyDust`, which owns both strengths.
      dustScale = Math.max(0, scale);
    },
    setFadeSeconds(value) {
      fadeSeconds = Math.max(0.01, value);
    },

    update(dt) {
      elapsed += dt;
      material.uniforms['uTime']!.value = elapsed;
      if (scrollSpeed !== 0) {
        const scroll = material.uniforms['uScroll']!;
        scroll.value = ((scroll.value as number) + dt * scrollSpeed) % 1;
      }

      // The crossfade. `uBlend` is always the mix from slot 0 to slot 1, so the
      // target is simply which slot should end up showing.
      const blendUniform = material.uniforms['uBlend']!;
      const target = fadeTarget;
      const current = blendUniform.value as number;
      if (current !== target) {
        const step = dt / fadeSeconds;
        const next =
          target > current ? Math.min(target, current + step) : Math.max(target, current - step);
        blendUniform.value = next;
        if (next === target) {
          activeSlot = target;
          // The slot that just left the screen holds a composition nobody is
          // looking at. Dropping it means the next fade repaints from scratch,
          // which is correct: it would have to anyway, at a new progress.
          const idle = slots[target === 0 ? 1 : 0];
          idle.composition = null;
          idle.drawnAt = Number.NaN;
        }
      }

      // Dust every frame, for both slots — it is the one thing on this surface
      // that moves without progress moving, which is precisely why it lives in
      // the material and costs no repaint. The outgoing slot is staged at the
      // frame it was frozen on.
      const idle: 0 | 1 = fadeTarget === 0 ? 1 : 0;
      applyDust(slots[fadeTarget], fadeTarget, progress);
      applyDust(slots[idle], idle, slots[idle].drawnAt);

      // THE REDRAW GATE. Only the incoming/active slot is ever repainted; the
      // outgoing one is deliberately frozen for the length of the fade.
      const shown = slots[fadeTarget];
      if (!shown.composition) return;
      const stale = !Number.isFinite(shown.drawnAt) || shown.drawnAt !== progress;
      if (stale || shown.composition.isAnimating(progress)) repaint(shown);
    },

    dispose() {
      disposed = true;
      // Canvas textures are NOT released by `material.dispose()`.
      for (const slot of slots) {
        slot.texture.dispose();
        slot.composition = null;
        // Zero the backing store: a 4096-pixel canvas is ~9 MB that would
        // otherwise sit until the element is collected.
        slot.canvas.width = 1;
        slot.canvas.height = 1;
      }
      material.dispose();
      // The material stays attached to the mesh, so the experiment's own
      // `disposeObject3DResources` may reach it again. Three's dispose only
      // dispatches an event, so a second visit is harmless.
    },
  };
}
