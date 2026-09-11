import * as THREE from 'three';
import { CameraRig } from '../../src/experiences/murcia/camera/CameraRig';
import { createDefaultCameraTuning } from '../../src/experiences/murcia/camera/cameraTuning';
import { resolveCameraPose } from '../../src/experiences/murcia/config/environmentConfig';
import type { EnvironmentConfig } from '../../src/experiences/murcia/config/environmentConfig';

/**
 * A camera and rig at the shipped pose, the way the application builds them.
 *
 * Five lines, once written identically in `navigation-feel.ts` and the
 * district harness, and used now by `navigation-feel.ts` and
 * `campus-section.ts`. Shared for the same reason `stubDom.ts` is: both
 * harnesses drive the same controller, so a divergence here shows up as a
 * behavioural difference between two harnesses testing one subject — and the
 * order matters (`setAspect` before `setFocus`, both after construction), which
 * is exactly the kind of thing that gets remembered in one file and not the
 * other.
 *
 * Deliberately does NOT build the controller. The two harnesses want different
 * ones — different configs, different bounds callbacks, one of them the
 * campus's own camera as well — and that difference is the point of having two.
 */
export function makeRig(
  env: EnvironmentConfig,
  aspect: number,
  focus: { x: number; z: number },
): { camera: THREE.PerspectiveCamera; rig: CameraRig } {
  const pose = resolveCameraPose(env, aspect);
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, pose.far);
  // The SHIPPED tuning, not the measurement one: both pointer harnesses drive
  // real gestures through this rig, and a tuning with zero gains would let a
  // drag test pass by moving nothing at all.
  const rig = new CameraRig(
    camera,
    pose,
    createDefaultCameraTuning(env, pose.distance, pose.elevationDegrees, env.navigation.bounds),
  );
  rig.setAspect(aspect);
  rig.setFocus(focus.x, focus.z);
  return { camera, rig };
}
