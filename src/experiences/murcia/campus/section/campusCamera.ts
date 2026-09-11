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
  /**
   * How the host wants the subject framed. Omitted, the focus is centred at
   * the tuned distance — the lab. Read at every pose, so a viewport that
   * crosses the host's breakpoint is framed for the layout it is now in.
   */
  framing?: () => CampusFraming;
}

/**
 * Where the focus sits in the frame, and how far back the camera stands.
 *
 * The camera pans rather than turning: camera and target move together, so
 * the tuned view angle is unchanged and only the subject moves.
 */
export interface CampusFraming {
  /** Across the frame, a signed fraction of the half-width: positive is right of centre. */
  x: number;
  /** Up the frame, a signed fraction of the half-height: positive is above centre. */
  y: number;
  /** Multiplies the tuned distance. 1 is the tuned one. */
  distanceScale: number;
}

const CENTRED: CampusFraming = { x: 0, y: 0, distanceScale: 1 };

export interface CampusCamera {
  readonly flying: boolean;
  /** From the overview to stop 0, fixing the base azimuth from the current view. */
  enter(seconds: number): void;
  /** From one stop to another, along the arc. Lands at full distance. */
  flyTo(stop: number, seconds: number): void;
  /** Back to the overview pose; control returns when it lands. */
  exit(seconds: number): void;
  /** The horizontal direction from focus to the camera at `stop`, for facing things at it. */
  azimuthOf(stop: number): number;
  /** Re-places a landed camera for the current viewport. Nothing while flying or in the overview. */
  reframe(): void;
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

  /** Whether the camera is at, or flying to, a stop rather than the overview. */
  let inSection = false;

  const azimuthOf = (stop: number): number => baseAzimuth + stepRad * tuning.direction * stop;

  const framingNow = (): CampusFraming => options.framing?.() ?? CENTRED;

  /**
   * The pan at `stop`: against the camera's right and up, so the focus lands
   * `framing.x` across and `framing.y` up the frame.
   */
  const panAt = (stop: number, framing: CampusFraming): THREE.Vector3 => {
    if (framing.x === 0 && framing.y === 0) return new THREE.Vector3();
    const a = azimuthOf(stop);
    const e = THREE.MathUtils.degToRad(tuning.elevationDeg);
    const halfHeight =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * tuning.distance * framing.distanceScale;
    // (cos a, 0, -sin a) is the camera's right at this azimuth, as `facing`
    // uses; its up is right × forward, tilted back by the elevation.
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const up = new THREE.Vector3(-Math.sin(a) * Math.sin(e), Math.cos(e), -Math.cos(a) * Math.sin(e));
    return right
      .multiplyScalar(-halfHeight * camera.aspect * framing.x)
      .addScaledVector(up, -halfHeight * framing.y);
  };

  const targetAt = (stop: number): THREE.Vector3 => panAt(stop, framingNow()).add(focus);

  const poseAt = (stop: number, scale: number): THREE.Vector3 => {
    const framing = framingNow();
    const a = azimuthOf(stop);
    const e = THREE.MathUtils.degToRad(tuning.elevationDeg);
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e))
      .multiplyScalar(tuning.distance * framing.distanceScale * scale)
      .add(panAt(stop, framing))
      .add(focus);
  };

  /** A flight along the circle: from the current stop and scale to new ones. */
  const walk = (stop: number, scale: number, seconds: number): void => {
    landInOverview = false;
    inSection = true;
    beginFlight(poseAt(stop, scale), targetAt(stop), seconds);
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
      inSection = true;
      beginFlight(poseAt(0, 1), targetAt(0), seconds);
    },

    flyTo(stop, seconds) {
      walk(stop, 1, seconds);
    },

    exit(seconds) {
      landInOverview = true;
      inSection = false;
      beginFlight(overviewTarget.clone().add(overviewOffset), overviewTarget, seconds);
    },

    azimuthOf,

    reframe() {
      if (flying || !inSection) return;
      camera.position.copy(poseAt(currentStop, currentScale));
      lookTarget.copy(targetAt(currentStop));
      camera.lookAt(lookTarget);
    },

    update(dt) {
      if (!flying) return;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);
      if (arc) {
        const stop = arc.from + (arc.to - arc.from) * eased;
        camera.position.copy(poseAt(stop, arc.fromScale + (arc.toScale - arc.fromScale) * eased));
        // The pan turns with the camera, so the target walks its own arc
        // rather than cutting the chord between two stops.
        lookTarget.copy(targetAt(stop));
      } else {
        camera.position.lerpVectors(fromPosition, toPosition, eased);
        lookTarget.lerpVectors(fromTarget, toTarget, eased);
      }
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
