import * as THREE from 'three';
import type { BoundsRect, NavigationConfig } from '../config/environmentConfig';
import {
  computeGroundFootprint,
  computeEffectiveBounds,
  computeStationLimitedBounds,
} from './viewportFootprint';
import type { GroundFootprint } from './viewportFootprint';
import {
  expandRect,
  intersectRect,
  unionRect,
  containsRect,
  collapseIfInverted,
} from './navigationBounds';

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
 *   station    where the focus may be for the CAMERA to stay inside
 *               `configured`. The eye sits at `focus + offset` and that offset
 *               depends only on yaw, pitch and distance, so this is `configured`
 *               shifted by −offset. DECISIONS §39: the camera never leaves the
 *               navigable area, and this term is the whole of the enforcement.
 *   effective   configured, pulled in wherever the footprint would otherwise
 *               show past `visual`, and again by `station`. This is where the
 *               drag pans at 1:1.
 *   extended    the same two terms a second time, against `nav.extendedBounds`
 *               instead of `configured`. The hard limit, and what the drag
 *               resists toward across the gap between the two (DECISIONS §40).
 *               Contains `effective` by construction.
 *
 * The one asymmetry worth knowing: with no terrain transition there is no
 * skirt, so the hard plate edge is real. Applying footprint insets against the
 * raw content bounds then collapses the navigable area to a sliver, so the
 * insets are disabled and the footprint term falls back to `configured` — an
 * honest usable area with a loud error, rather than a silently unusable one.
 *
 * The station term is NOT part of that fallback and never switches off. What
 * `disableFootprintInsets` turns off is a MEASUREMENT that has degenerated into
 * a `maxGroundDistance` clamp — insetting by a number nobody measured. The
 * station term is an exact position the camera is about to occupy, so there is
 * no pose at which it stops being true, and DECISIONS §39 names putting it
 * behind that flag as one of the ways the rule breaks.
 */
export class NavigableArea {
  private plate: BoundsRect | null = null;
  private configured: BoundsRect | null = null;
  private visual: BoundsRect | null = null;
  private station: BoundsRect | null = null;
  private effective: BoundsRect | null = null;
  private extended: BoundsRect | null = null;
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
   * Stop insetting the navigable area by the viewport footprint. ONE caller now:
   * there is no terrain transition, so the plate edge is the visual edge, and
   * applying the inset against raw content bounds collapses the area to a sliver.
   * An honest usable area with a loud error beats a silently unusable one.
   *
   * There was a second caller until 2026-09-08 — "the horizon is in frame, so the
   * footprint is a `maxGroundDistance` clamp rather than a measurement, and
   * insetting by it would pull the focus off the plate for a reach nobody
   * measured". That reason is still real; it is just a property of the POSE, so
   * `recompute` asks it of each pose's own rays rather than having it decided
   * once at load. See DECISIONS §39.
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

    // Union rather than `extendedBounds` alone. It is REQUIRED to contain
    // `bounds`, and a config that broke that would otherwise put the hard limit
    // inside the area the drag already pans to at full speed — the one shape
    // this pipeline must never produce.
    const allowedExtended = unionRect(this.configured, this.nav.extendedBounds);

    this.footprint = computeGroundFootprint(
      camera,
      focus,
      this.nav.groundPlaneHeight,
      this.nav.maxGroundDistance,
    );

    // The inset applies when the footprint is a MEASUREMENT and is dropped when
    // it has degenerated into the `maxGroundDistance` clamp — which is a per-pose
    // fact, asked of the rays that were just cast rather than guessed at load
    // time. Insetting by a clamp would drag the focus off the plate corners for a
    // reach nobody measured; not insetting by a real measurement lets the plate
    // edge into frame. Neither is a policy, so neither is a flag.
    const footprintLimited =
      this.insetsDisabled || this.footprint.clampedRays
        ? { ...this.configured }
        : computeEffectiveBounds(
            this.configured,
            this.visual,
            this.footprint,
            this.nav.edgeSafetyMargin,
          );

    // Read off the placed camera rather than recomputed from the pose angles.
    // `applyPoseToCamera` calls `updateMatrixWorld(true)`, so this is the pose
    // that was just written — and taking it from the camera is what lets
    // `checks/footprint.ts` drive this with a bare camera and no rig at all.
    this.station = computeStationLimitedBounds(
      this.configured,
      camera.position.x - focus.x,
      camera.position.z - focus.z,
      this.nav.edgeSafetyMargin,
    );

    this.effective = collapseIfInverted(intersectRect(footprintLimited, this.station));

    // §40. The same two terms again against a wider allowed rectangle, which is
    // the whole of what "the camera may be pushed into the A2 ring" means. Both
    // are RE-DERIVED rather than `effective` being grown by the ring margins:
    // the station shift is a function of the rectangle it shifts, so expanding
    // the result would be a different rectangle, and a wrong one.
    const extendedFootprint =
      this.insetsDisabled || this.footprint.clampedRays
        ? { ...allowedExtended }
        : computeEffectiveBounds(
            allowedExtended,
            this.visual,
            this.footprint,
            this.nav.edgeSafetyMargin,
          );

    const extendedStation = computeStationLimitedBounds(
      allowedExtended,
      camera.position.x - focus.x,
      camera.position.z - focus.z,
      this.nav.edgeSafetyMargin,
    );

    const extended = collapseIfInverted(intersectRect(extendedFootprint, extendedStation));

    // The ramp requires the limit to contain the firm area, and there is one pose
    // where the arithmetic above does not deliver it: when the eye offset outruns
    // the rectangle, BOTH terms collapse to their midpoint, and the two midpoints
    // differ by the ring margins. Neither point is reachable — at such a pose no
    // focus satisfies the rule at all — so the honest answer is that there is no
    // band to give, rather than a limit invented between two pinned points.
    // `checks/footprint.ts` §5 sweeps the reachable band and never sees this.
    this.extended = containsRect(extended, this.effective) ? extended : this.effective;

    return this.effective;
  }

  /** What the drag controller clamps to. Null until the first recompute. */
  get effectiveBounds(): BoundsRect | null {
    return this.effective;
  }

  /**
   * The hard limit the drag resists toward (DECISIONS §40). Always contains
   * `effectiveBounds`, and equals it when `extendedBounds` is `bounds` — which
   * is how `?band=0` restores §39's wall exactly. Null until the first
   * recompute.
   */
  get extendedNavigableBounds(): BoundsRect | null {
    return this.extended;
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
   * Where the focus may be for the camera to stay inside the navigable area
   * (DECISIONS §39). Null until the first recompute. Diagnostics only — the
   * clamp reads `effectiveBounds`, which already has this intersected in.
   */
  get stationBounds(): BoundsRect | null {
    return this.station;
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

  /** The same, for the limit the drag resists toward (§40). */
  initialExtendedBounds(fallback: BoundsRect): BoundsRect {
    return this.extended ?? unionRect(this.configured ?? fallback, this.nav.extendedBounds);
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
    if (this.station) console.info(`station (§39)    ${fmt(this.station)}`);
    console.info(`effective        ${fmt(eff)}`);
    if (this.extended) console.info(`extended (§40)   ${fmt(this.extended)}`);
    if (this.station) {
      // Measured against what navigation was CONFIGURED to cover, not against
      // the terrain mesh. Those were the same rectangle until the 2026-09-06
      // export merged the authored plate into the outer ground: the mesh became
      // six times the authored city, and this line started reporting a correct
      // navigable area as "3% of the plate" on every load. What it is actually
      // watching for is the footprint inset eating the area — which is a
      // relationship between effective and configured, and never involved the
      // mesh.
      //
      // Measured against STATION rather than configured since 2026-09-08, and
      // for exactly the same reason the reference moved the first time. §39 gives
      // up area deliberately and permanently — 44% of the configured rectangle at
      // the resting pose — so against `configured` this warned on every single
      // load about a cost that is documented, gated and intended. That is how a
      // warning stops being read. Against `station` it goes back to watching the
      // one thing it was ever for: the footprint inset eating what §39 left.
      const stationCost = this.plateCoverage(this.station, this.configured) * 100;
      console.info(`station cost     ${stationCost.toFixed(0)}% of the configured area remains (§39)`);
      const coverage = this.plateCoverage(eff, this.station) * 100;
      const line = `navigable        ${coverage.toFixed(0)}% of the station area`;
      if (coverage < MIN_EXPECTED_PLATE_COVERAGE * 100) console.warn(line + ' — smaller than expected');
      else console.info(line);
    }
    console.groupEnd();
  }

  private plateCoverage(effective: BoundsRect, reference: BoundsRect): number {
    const plateArea = (reference.maxX - reference.minX) * (reference.maxZ - reference.minZ);
    if (plateArea <= 0) return 0;
    const navArea = (effective.maxX - effective.minX) * (effective.maxZ - effective.minZ);
    return navArea / plateArea;
  }
}

/**
 * Below this share of the configured area, the navigable area is a warning
 * rather than as information. Not a hard limit — a legitimately small area is
 * possible — but at this point the likeliest cause is a config/asset mismatch
 * rather than a deliberate choice.
 */
const MIN_EXPECTED_PLATE_COVERAGE = 0.5;
