import * as THREE from 'three';

/**
 * Where the camera goes in the section, and what the user may do with it.
 *
 * A hand-rolled eased flight of position and look-target, the overview pose
 * captured on entering so leaving undoes entering. It owns no controls:
 * it writes the host's `lookTarget` vector and reports through
 * `onControl` when the host should hand the camera over and take it back,
 * so a damping orbit and the flight never write the camera in the same
 * frame. The lab maps that to OrbitControls; the site maps it to its rig.
 *
 * The stops sit on a circle around the lake, the full turn divided evenly
 * by their number: stop 0 is the intro, and stop N is the intro again, one
 * lap on. Stops are not wrapped, so a visitor who keeps going forward keeps
 * going round. The circle's starting azimuth is whichever way the visitor
 * was looking when they clicked, so the fly-in never spins.
 *
 * Control is the overview's. Inside the section it stays handed over: a
 * horizontal drag is a swipe there, not a rotation.
 */

export interface CampusCameraTuning {
  /** From the focus point to the camera. */
  distance: number;
  /** Above the horizon, in degrees. */
  elevationDeg: number;
  /** Which way round the building the section walks. */
  direction: 1 | -1;
}

export interface CampusCameraOptions {
  camera: THREE.PerspectiveCamera;
  /** The vector the camera looks at. Written by every flight; the host owns it. */
  lookTarget: THREE.Vector3;
  /** `false` when a flight takes the camera, `true` when one lands in the overview. */
  onControl: (enabled: boolean) => void;
  /** What every stop looks at. */
  focus: THREE.Vector3;
  /** Stops per lap: the intro plus one per service. */
  stops: number;
  /** Held by reference: the panel edits it live. */
  tuning: CampusCameraTuning;
}

export interface CampusCamera {
  readonly flying: boolean;
  /** From the overview to stop 0, fixing the base azimuth from the current view. */
  enter(seconds: number): void;
  /** From one stop to another, along the arc. Lands at full distance. */
  flyTo(stop: number, seconds: number): void;
  /** Closer to or further from the focus at the current stop; 1 is the tuned distance. */
  dollyTo(scale: number, seconds: number): void;
  /** Back to the overview pose; control returns when it lands. */
  exit(seconds: number): void;
  /** The horizontal direction from focus to the camera at `stop`, for facing things at it. */
  azimuthOf(stop: number): number;
  update(dt: number): void;
  dispose(): void;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCampusCamera(options: CampusCameraOptions): CampusCamera {
  const { camera, lookTarget, onControl, focus, tuning } = options;
  const stepRad = (Math.PI * 2) / Math.max(1, options.stops);

  // Captured by `enter`, not here. On the site the camera is built long before
  // anyone enters — at load, during the Earth intro — and a pose taken then
  // would fly a visitor who had walked the city back to where it opened.
  const overviewTarget = new THREE.Vector3();
  const overviewOffset = new THREE.Vector3();

  const fromPosition = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toPosition = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  let baseAzimuth = 0;
  let elapsed = 0;
  let duration = 0;
  let flying = false;
  /** A flight between stops follows the arc; entering and leaving take the line. */
  let arc: { from: number; to: number; fromScale: number; toScale: number } | null = null;
  let currentStop = 0;
  let currentScale = 1;
  /** Whether control comes back when the current flight lands. */
  let landInOverview = false;

  const azimuthOf = (stop: number): number => baseAzimuth + stepRad * tuning.direction * stop;

  const poseAt = (stop: number, scale: number): THREE.Vector3 => {
    const a = azimuthOf(stop);
    const e = THREE.MathUtils.degToRad(tuning.elevationDeg);
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e))
      .multiplyScalar(tuning.distance * scale)
      .add(focus);
  };

  /** A flight along the circle: from the current stop and scale to new ones. */
  const walk = (stop: number, scale: number, seconds: number): void => {
    landInOverview = false;
    beginFlight(poseAt(stop, scale), focus, seconds);
    // Overrides the line: the camera stays on its circle round the lake
    // and walks the building rather than cutting through it.
    arc = { from: currentStop, to: stop, fromScale: currentScale, toScale: scale };
    currentStop = stop;
    currentScale = scale;
  };

  const beginFlight = (position: THREE.Vector3, target: THREE.Vector3, seconds: number): void => {
    arc = null;
    fromPosition.copy(camera.position);
    fromTarget.copy(lookTarget);
    toPosition.copy(position);
    toTarget.copy(target);
    duration = Math.max(0.01, seconds);
    elapsed = 0;
    flying = true;
    onControl(false);
  };

  return {
    get flying() {
      return flying;
    },

    enter(seconds) {
      // Where leaving comes back to: the pose at the click.
      overviewTarget.copy(lookTarget);
      overviewOffset.copy(camera.position).sub(lookTarget);
      // Take the azimuth the visitor is already looking from, so the fly-in
      // is a dolly and not a spin.
      const offset = camera.position.clone().sub(focus);
      baseAzimuth = Math.atan2(offset.x, offset.z);
      currentStop = 0;
      currentScale = 1;
      landInOverview = false;
      beginFlight(poseAt(0, 1), focus, seconds);
    },

    flyTo(stop, seconds) {
      walk(stop, 1, seconds);
    },

    dollyTo(scale, seconds) {
      walk(currentStop, scale, seconds);
    },

    exit(seconds) {
      landInOverview = true;
      beginFlight(overviewTarget.clone().add(overviewOffset), overviewTarget, seconds);
    },

    azimuthOf,

    update(dt) {
      if (!flying) return;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);
      if (arc) {
        camera.position.copy(
          poseAt(arc.from + (arc.to - arc.from) * eased, arc.fromScale + (arc.toScale - arc.fromScale) * eased),
        );
      }
      else camera.position.lerpVectors(fromPosition, toPosition, eased);
      lookTarget.lerpVectors(fromTarget, toTarget, eased);
      camera.lookAt(lookTarget);
      if (t >= 1) {
        flying = false;
        if (landInOverview) onControl(true);
      }
    },

    dispose() {
      onControl(true);
    },
  };
}
