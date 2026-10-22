import * as THREE from 'three';
import { clamp01, easeInOutCubic } from '../../../utils/easing';
import type { AboutPose } from './aboutPoses';

/**
 * Conócenos' camera: three stops in a row, and the way back.
 *
 * The campus's camera (`campus/section/campusCamera.ts`) is a ring around one
 * focus and cannot hold a list of poses, so this is its sibling rather than an
 * extension of it. It keeps its promises:
 *
 *   - it owns no controls: `onControl(false)` when a flight takes the camera,
 *     `onControl(true)` when the camera is back where it was taken from, and
 *     the host maps that to the rig's claim (`aboutCameraAdapter.ts`);
 *   - a flight carries the eye and a point of aim together, eased, so the
 *     tower stays in frame — a turn interpolated apart from the travel swings
 *     the view across the city (`towerFocus`, commit `8057303`);
 *   - the way back lands on EXACTLY the pose captured on entering, quaternion
 *     included, so the rig's `adoptFromCamera` reads the pose it produced and
 *     the first navigated frame does not move.
 *
 * ## Leaving for Earth from the sky
 *
 * «Ver sus casos» starts the warp from the third stop, without flying back
 * first: the camera is already looking up, which is where the warp goes. The
 * warp hands its amount down (`departure`), and the camera rises and tips up
 * toward the zenith from wherever it is held. Rising and looking up only
 * shrinks how much ground is in frame, which is the warp's own constraint
 * (`docs/decisiones/transicion/warp.md`). At the cut, when the city goes
 * inactive, `abandon` puts the camera back on the entry pose in one write and
 * hands it to the rig, so the next arrival starts from where the visitor was
 * standing before the visit.
 */

/** World units the camera rises by the warp's cut. */
const DEPARTURE_RISE = 160;
/** How far up the view tips by the cut, in degrees above the horizon. */
const DEPARTURE_PITCH_DEGREES = 80;

export interface AboutCameraOptions {
  camera: THREE.PerspectiveCamera;
  /** The stops for the viewport as it is now. Read at every flight and reframe. */
  poses: () => readonly AboutPose[];
  /** `false` when a flight takes the camera, `true` when it is handed back. */
  onControl: (enabled: boolean) => void;
}

export interface AboutCamera {
  readonly flying: boolean;
  /** At a stop, or flying to or between them; false in the overview and on the way out. */
  readonly inSection: boolean;
  /** The stop held or flown to. */
  readonly stop: number;
  /** From wherever the camera is to stop 0, capturing that pose as the way back. */
  enter(seconds: number): void;
  flyTo(stop: number, seconds: number): void;
  /** Back to the pose captured on entering; control returns when it lands. */
  exit(seconds: number): void;
  /** Back on the entry pose at once, control returned. Nothing outside a visit. */
  abandon(): void;
  /** Re-places a held camera for the current viewport. Nothing while flying. */
  reframe(): void;
  /**
   * The warp leaving from the held stop: 0 is the stop, 1 the pose at the cut.
   * Measured from the pose held when it started, so it can be called every frame.
   */
  departure(amount: number): void;
  update(dt: number): void;
  dispose(): void;
}

interface Placement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  look: THREE.Vector3;
}

const placement = (): Placement => ({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  look: new THREE.Vector3(),
});

/** The quaternion of an eye at `position` looking at `target`, upright. */
function lookRotation(position: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  // Eye first, target second: the camera convention (a camera looks down -Z).
  return out.setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, THREE.Object3D.DEFAULT_UP));
}

export function createAboutCamera(options: AboutCameraOptions): AboutCamera {
  const { camera, onControl } = options;

  const origin = placement();
  const from = placement();
  const to = placement();
  /** What the camera is aiming at now: written by every flight. */
  const look = new THREE.Vector3();
  /** The held pose a departure is measured from; null until one starts. */
  let departingFrom: { position: THREE.Vector3; yaw: number; pitch: number } | null = null;

  let elapsed = 0;
  let duration = 0;
  let flying = false;
  let inSection = false;
  let landInOrigin = false;
  let stop = 0;
  let taken = false;

  const take = (): void => {
    if (taken) return;
    taken = true;
    onControl(false);
  };

  const handBack = (): void => {
    if (!taken) return;
    taken = false;
    onControl(true);
  };

  const place = (at: Placement): void => {
    camera.position.copy(at.position);
    camera.quaternion.copy(at.quaternion);
    camera.updateMatrixWorld();
    look.copy(at.look);
  };

  const stopPlacement = (index: number, out: Placement): Placement => {
    const pose = options.poses()[index];
    if (!pose) return out;
    out.position.copy(pose.position);
    out.look.copy(pose.target);
    lookRotation(pose.position, pose.target, out.quaternion);
    return out;
  };

  const beginFlight = (seconds: number): void => {
    from.position.copy(camera.position);
    from.quaternion.copy(camera.quaternion);
    from.look.copy(look);
    elapsed = 0;
    duration = Math.max(0.01, seconds);
    flying = true;
    departingFrom = null;
    take();
  };

  return {
    get flying() {
      return flying;
    },
    get inSection() {
      return inSection;
    },
    get stop() {
      return stop;
    },

    enter(seconds) {
      // Where leaving comes back to: the pose at the click, and a point of aim
      // straight ahead of it, as far out as the first stop's subject, so the
      // flight's first frame turns nothing.
      origin.position.copy(camera.position);
      origin.quaternion.copy(camera.quaternion);
      const first = options.poses()[0];
      const reach = first ? camera.position.distanceTo(first.target) : 100;
      origin.look.copy(camera.getWorldDirection(new THREE.Vector3())).multiplyScalar(reach).add(camera.position);
      look.copy(origin.look);
      stop = 0;
      inSection = true;
      landInOrigin = false;
      beginFlight(seconds);
      stopPlacement(0, to);
    },

    flyTo(next, seconds) {
      if (!inSection) return;
      stop = next;
      landInOrigin = false;
      beginFlight(seconds);
      stopPlacement(next, to);
    },

    exit(seconds) {
      if (!inSection) return;
      inSection = false;
      landInOrigin = true;
      beginFlight(seconds);
      to.position.copy(origin.position);
      to.quaternion.copy(origin.quaternion);
      to.look.copy(origin.look);
    },

    abandon() {
      if (!taken) return;
      flying = false;
      inSection = false;
      departingFrom = null;
      place(origin);
      handBack();
    },

    reframe() {
      if (flying || !inSection || departingFrom) return;
      place(stopPlacement(stop, to));
    },

    departure(amount) {
      if (!taken) return;
      if (!departingFrom) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        departingFrom = { position: camera.position.clone(), yaw: euler.y, pitch: euler.x };
        flying = false;
      }
      const a = clamp01(amount);
      const target = THREE.MathUtils.degToRad(DEPARTURE_PITCH_DEGREES);
      const pitch = THREE.MathUtils.lerp(departingFrom.pitch, Math.max(target, departingFrom.pitch), a);
      camera.position.copy(departingFrom.position);
      camera.position.y += DEPARTURE_RISE * a;
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, departingFrom.yaw, 0, 'YXZ'));
      camera.updateMatrixWorld();
    },

    update(dt) {
      if (!flying) return;
      elapsed += dt;
      const t = clamp01(elapsed / duration);
      const eased = easeInOutCubic(t);
      camera.position.lerpVectors(from.position, to.position, eased);
      look.lerpVectors(from.look, to.look, eased);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      if (t < 1) return;
      // Landed exactly, so an adopt reads the pose it was promised.
      flying = false;
      place(to);
      if (landInOrigin) handBack();
    },

    dispose() {
      // A visit under way hands the camera back, as the campus's does.
      if (taken) place(origin);
      handBack();
    },
  };
}
