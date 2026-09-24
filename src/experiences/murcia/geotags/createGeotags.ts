import * as THREE from 'three';
import { GEOTAG, type GeotagConfig } from './geotagConfig';

/**
 * Map pins floating over places in the city, saying "this opens something"
 * from a distance.
 *
 * ## Kept apart on purpose
 *
 * Nothing in the city knows these exist. A site is described by two reads — a
 * point to stand over and the level of its highlight blink — and the only
 * wiring is in `MurciaExperience`. Removing the feature is removing this folder
 * and that wiring; the blog and the campus only expose `highlightPulse`, which
 * is a read of their existing highlight.
 *
 * ## What they are not
 *
 * Not interactive: a press goes to the building or the lake as before, and the
 * meshes refuse rays so no picker can ever land on one. Not a screen-space
 * marker: they are depth-tested, so a building in front hides them, and their
 * size is fixed in the world. Up close they are hidden instead of shrunk — the
 * one case a fixed size handles badly is a place the viewer has already
 * reached, where a pin has nothing left to say.
 *
 * ## When they show, and how they move
 *
 * Only while their site's highlight blinks: the pin fades in with the blink,
 * rises a little with it, floats, and fades out as the blink does — 2 s out of
 * every cycle (`BUILDING_BLINK`). The blink is READ, not re-timed, because each
 * highlight keeps its own clock and the campus's parks while the campus is
 * open, so a copy would drift.
 *
 * Under reduced motion the blink is off, and a pin that came and went would be
 * the same periodic motion the setting declines. So there the pins stay shown
 * and still: the one place they no longer follow the blink.
 */

export interface GeotagSite {
  readonly id: string;
  /** The point the pin stands over: x/z, and the top of what is under it as y. */
  base(out: THREE.Vector3): THREE.Vector3;
  /** The site's highlight blink right now, 0..1. The pin shows only while it is above 0. */
  pulse(): number;
}

export interface GeotagOptions {
  reducedMotion: boolean;
  config?: GeotagConfig;
}

export interface Geotags {
  readonly object3D: THREE.Object3D;
  /** Born transparent at zero, so the host's warm-up compiles them. */
  readonly precompileTargets: readonly THREE.Object3D[];
  /** Whether the viewer is navigating. The pins fade rather than cut. */
  setVisible(on: boolean): void;
  /** After the camera's pose for the frame is final. */
  update(deltaTime: number, camera: THREE.Camera): void;
  dispose(): void;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** 0 at or below `near`, 1 at or above `far`, smoothstepped between. */
export function distanceFade(distance: number, near: number, far: number): number {
  if (!Number.isFinite(distance)) return 0;
  if (!(far > near)) return distance >= far ? 1 : 0;
  const t = Math.min(1, Math.max(0, (distance - near) / (far - near)));
  return t * t * (3 - 2 * t);
}

/** Height above the pin's rest: the float at `seconds`, plus the hop at `pulse`. */
export function pinLift(seconds: number, pulse: number, config: GeotagConfig): number {
  const float =
    config.floatPeriod > 0
      ? config.floatAmplitude * Math.sin((2 * Math.PI * seconds) / config.floatPeriod)
      : 0;
  const hop = config.hopAmplitude * Math.min(1, Math.max(0, Number.isFinite(pulse) ? pulse : 0));
  return float + hop;
}

/**
 * A map pin, tip at the origin, crown `height` up, facing +Z: a teardrop with
 * a round hole, extruded thin. One material, no lights — the city has none,
 * and adding one recompiles every program (see `buildingHighlight.ts`).
 */
export function createPinGeometry(height: number): THREE.BufferGeometry {
  const radius = height * 0.36;
  const centre = height - radius;
  // The tip's tangents meet the head at `beta` either side of straight down.
  const beta = Math.acos(radius / centre);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, centre, radius, -Math.PI / 2 + beta, (3 * Math.PI) / 2 - beta, false);
  shape.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.absarc(0, centre, radius * 0.42, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const depth = height * 0.12;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: depth * 0.25,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export function createGeotags(sites: readonly GeotagSite[], options: GeotagOptions): Geotags {
  const config = options.config ?? GEOTAG;
  const group = new THREE.Group();
  group.name = 'geotags';

  const geometry = createPinGeometry(config.height);
  const pins = sites.map((site, index) => {
    // One material per pin, because each fades on its own distance. They share
    // one program, so a second material costs no compile.
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.color),
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `geotag:${site.id}`;
    // Not a target, for any ray: the building under it is.
    mesh.raycast = () => {};
    group.add(mesh);
    // Offset so two pins never bob in step.
    return { site, mesh, material, phase: index * 0.37 * config.floatPeriod };
  });

  const base = new THREE.Vector3();
  let clock = 0;
  let shown = 0;
  let showTarget = 0;

  return {
    object3D: group,
    precompileTargets: pins.map((pin) => pin.mesh),

    setVisible(on: boolean): void {
      showTarget = on ? 1 : 0;
    },

    update(deltaTime: number, camera: THREE.Camera): void {
      const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
      clock += dt;
      if (shown !== showTarget) {
        const step = config.fadeSeconds > 0 ? dt / config.fadeSeconds : 1;
        shown = showTarget > shown ? Math.min(showTarget, shown + step) : Math.max(showTarget, shown - step);
      }
      const navigating = shown * shown * (3 - 2 * shown);

      for (const pin of pins) {
        pin.site.base(base);
        const pulse = clamp01(pin.site.pulse());
        const lift = options.reducedMotion ? 0 : pinLift(clock + pin.phase, pulse, config);
        pin.mesh.position.set(base.x, base.y + config.clearance + lift, base.z);
        // Yaw only, so the pin stays upright and always shows its face.
        pin.mesh.rotation.set(
          0,
          Math.atan2(camera.position.x - base.x, camera.position.z - base.z),
          0,
        );

        const appearance = options.reducedMotion ? 1 : pulse;
        const opacity =
          appearance *
          navigating *
          distanceFade(camera.position.distanceTo(pin.mesh.position), config.nearDistance, config.farDistance);
        pin.material.opacity = opacity;
        // Skipped rather than drawn at zero: a hidden pin should cost nothing.
        pin.mesh.visible = opacity > 0;
      }
    },

    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      for (const pin of pins) pin.material.dispose();
    },
  };
}
