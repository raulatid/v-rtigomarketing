import * as THREE from 'three';
import type { BoundsRect, NavigationConfig } from '../config/environmentConfig';
import { computeGroundFootprint, computeEffectiveBounds } from './viewportFootprint';
import type { GroundFootprint } from './viewportFootprint';
import { expandRect } from './navigationBounds';

/**
 * The navigable area, and the four rectangles it is derived from.
 *
 * MurciaExperience held all six of these as fields — plate, configured, visual,
 * effective, footprint and an insets-disabled flag — plus the recompute and the
 * diagnostics, interleaved with asset loading, camera rigging, district wiring
 * and disposal. They are one responsibility with one invariant, and pulling
 * them out is what lets that invariant be stated in one place instead of
 * inferred from six assignment sites.
 *
 * Named for the thing it produces rather than for its inputs. `navigationBounds.ts`
 * next door is the rectangle ARITHMETIC — clamp, intersect, expand, collapse —
 * and stays a set of plain functions on purpose. This is the pipeline that uses
 * them, and it is stateful because the inputs arrive at different times.
 *
 * THE PIPELINE, outermost to innermost:
 *
 *   plate       the terrain mesh's own XZ extent, measured from the GLB.
 *   visual      plate + skirt. What the eye can see ground at.
 *   configured  where navigation is ALLOWED — plate inset, or hand-authored.
 *   footprint   how far the camera can currently see past its focus. Depends
 *               on aspect, distance and azimuth, so it changes on resize, on
 *               zoom and on yaw — which is why this recomputes on all three.
 *   effective   configured, pulled in wherever the footprint would otherwise
 *               show past `visual`. This is what the drag controller clamps to.
 *
 * The one asymmetry worth knowing: with no terrain transition there is no
 * skirt, so the hard plate edge is real. Applying footprint insets against the
 * raw content bounds then collapses the navigable area to a sliver, so the
 * insets are disabled and `effective` falls back to `configured` — an honest
 * usable area with a loud error, rather than a silently unusable one.
 */
export class NavigableArea {
  private plate: BoundsRect | null = null;
  private configured: BoundsRect | null = null;
  private visual: BoundsRect | null = null;
  private effective: BoundsRect | null = null;
  private footprint: GroundFootprint | null = null;
  private insetsDisabled = false;

  constructor(private readonly nav: NavigationConfig) {}

  /** The terrain plate's XZ extent, measured from the loaded mesh. */
  setPlateFromObject(terrain: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(terrain);
    this.plate = {
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
  }

  /** Plate plus skirt, from the terrain transition. */
  setVisualBounds(rect: BoundsRect): void {
    this.visual = { ...rect };
  }

  /**
   * Stop insetting the navigable area by the viewport footprint. Two callers,
   * for opposite reasons — see the asymmetry note above.
   *
   *   no skirt        the plate edge is the visual edge and applying the inset
   *                   against raw content bounds collapses the area to a
   *                   sliver. An honest usable area with a loud error beats a
   *                   silently unusable one.
   *   horizon in frame the footprint is a `maxGroundDistance` clamp rather than
   *                   a measurement, so insetting by it would pull the focus
   *                   off the plate for a reach that was never measured.
   *
   * A visual rect already supplied by a skirt is kept: it is still what the
   * debug wireframe draws, and it is still true. Only its use as an inset stops.
   */
  disableFootprintInsets(fallback: BoundsRect): void {
    this.visual = this.visual ?? this.plate ?? { ...fallback };
    this.insetsDisabled = true;
  }

  /**
   * Where navigation is allowed, before the footprint has its say. Derived from
   * the plate when the config asks for it AND a plate was actually found —
   * otherwise the hand-authored rectangle, which is the honest fallback when
   * the asset did not carry what the config assumed.
   */
  deriveConfigured(fallback: BoundsRect): void {
    this.configured =
      this.nav.deriveBoundsFromTerrain && this.plate
        ? expandRect(this.plate, -this.nav.boundsInset)
        : { ...fallback };
  }

  /**
   * Recompute the footprint and the effective area for the camera's current
   * pose. Returns the new effective bounds, or null if the inputs are not all
   * present yet — which is the same guard the caller used to repeat.
   */
  recompute(camera: THREE.PerspectiveCamera, focus: THREE.Vector3): BoundsRect | null {
    if (!this.visual || !this.configured) return null;

    this.footprint = computeGroundFootprint(
      camera,
      focus,
      this.nav.groundPlaneHeight,
      this.nav.maxGroundDistance,
    );

    this.effective = this.insetsDisabled
      ? { ...this.configured }
      : computeEffectiveBounds(
          this.configured,
          this.visual,
          this.footprint,
          this.nav.edgeSafetyMargin,
        );

    return this.effective;
  }

  /** What the drag controller clamps to. Null until the first recompute. */
  get effectiveBounds(): BoundsRect | null {
    return this.effective;
  }

  /** Plate plus skirt. Used by the debug wireframe. */
  get visualBounds(): BoundsRect | null {
    return this.visual;
  }

  /** The terrain plate itself. Debug wireframe only. */
  get plateBounds(): BoundsRect | null {
    return this.plate;
  }

  /** The allowed area before the footprint's say. Debug wireframe only. */
  get configuredBounds(): BoundsRect | null {
    return this.configured;
  }

  /**
   * Whether the last footprint measurement hit `maxGroundDistance` on any ray —
   * i.e. the camera is looking far enough past the horizon that the reach is a
   * clamp rather than a real intersection. Surfaced to the debug overlay
   * because it changes how the effective bounds should be read.
   */
  get footprintClamped(): boolean {
    return this.footprint?.clampedRays ?? false;
  }

  /**
   * The starting area, for the drag controller's construction — before any
   * recompute has run, `configured` is the best available answer.
   */
  initialBounds(fallback: BoundsRect): BoundsRect {
    return this.effective ?? this.configured ?? fallback;
  }

  /**
   * One-shot report of every rectangle that feeds the navigable area, so a
   * mismatch between config and asset is visible instead of silently shrinking
   * navigation.
   *
   * Kept here rather than in the debug module because the thing it explains is
   * this pipeline: the six numbers are only meaningful in the order they are
   * derived, and that order is this file.
   */
  logDiagnostics(terrainSource: string): void {
    if (!this.effective || !this.configured || !this.visual) return;
    const eff = this.effective;

    const fmt = (r: BoundsRect): string =>
      `X [${r.minX.toFixed(0)}, ${r.maxX.toFixed(0)}]  Z [${r.minZ.toFixed(0)}, ${r.maxZ.toFixed(0)}]  (${(r.maxX - r.minX).toFixed(0)} x ${(r.maxZ - r.minZ).toFixed(0)})`;

    console.groupCollapsed('[navigation] bounds');
    console.info(`terrain source   ${terrainSource}`);
    console.info(`plate            ${this.plate ? fmt(this.plate) : 'NOT FOUND'}`);
    console.info(`configured       ${fmt(this.configured)}`);
    console.info(`visual (+skirt)  ${fmt(this.visual)}`);
    if (this.footprint) {
      const f = this.footprint;
      console.info(
        `footprint reach  -X ${f.reachNegX.toFixed(0)}  +X ${f.reachPosX.toFixed(0)}  -Z ${f.reachNegZ.toFixed(0)}  +Z ${f.reachPosZ.toFixed(0)}  clampedRays=${f.clampedRays}`,
      );
    }
    console.info(`effective        ${fmt(eff)}`);
    if (this.plate) {
      const coverage = this.plateCoverage(eff, this.plate) * 100;
      const line = `navigable        ${coverage.toFixed(0)}% of the plate`;
      if (coverage < MIN_EXPECTED_PLATE_COVERAGE * 100) console.warn(line + ' — smaller than expected');
      else console.info(line);
    }
    console.groupEnd();
  }

  private plateCoverage(effective: BoundsRect, plate: BoundsRect): number {
    const plateArea = (plate.maxX - plate.minX) * (plate.maxZ - plate.minZ);
    if (plateArea <= 0) return 0;
    const navArea = (effective.maxX - effective.minX) * (effective.maxZ - effective.minZ);
    return navArea / plateArea;
  }
}

/**
 * Below this share of the plate, the navigable area is reported as a warning
 * rather than as information. Not a hard limit — a legitimately small area is
 * possible — but at this point the likeliest cause is a config/asset mismatch
 * rather than a deliberate choice.
 */
const MIN_EXPECTED_PLATE_COVERAGE = 0.5;
