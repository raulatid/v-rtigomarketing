import * as THREE from 'three';

/**
 * The hand-over between the city's rig and the campus's own camera.
 *
 * The campus flies the camera itself (`section/campusCamera.ts`): its stops sit
 * on a ring round the lake, at an elevation and a look-at height the rig cannot
 * express. So for the whole of a visit the rig is claimed under `'campus'` and
 * its springs are not stepped — `MurciaExperience.update`'s owner switch
 * already has that rung — and the camera is handed back only when the exit
 * flight lands in the overview.
 *
 * It is the blog approach's hand-over (`MurciaExperience.setupBlogDisplay`),
 * for the blog approach's reason: the flight wrote `camera.position` and
 * `camera.quaternion` directly, so the rig has no idea where it is, and
 * `adoptFromCamera` solves the pose back out before the springs run again.
 * Because the campus's exit flies back to the pose captured on entering — a
 * pose the rig itself produced — that solve reproduces the rig's own state and
 * the first navigated frame does not move.
 *
 * ## `lookTarget` is ours, not the rig's focus
 *
 * The campus reads `lookTarget` as "what the camera is looking at now" when a
 * flight starts. The rig's `focus` sits on the ground (y = 0) while its camera
 * aims at the pose's `lookAtHeight` (`applyPoseToCamera`), so handing it the
 * focus would swing the view down on the first frame. `seed()` writes the
 * real aim point, and is called immediately before every entry.
 */

/** What the adapter needs of `CameraRig`, and nothing else. */
export interface CampusCameraRig {
  readonly focus: THREE.Vector3;
  getEffectivePose(): { readonly lookAtHeight: number };
  readonly isOwned: boolean;
  hasClaim(id: 'campus'): boolean;
  claim(id: 'campus'): void;
  release(id: 'campus'): void;
  adoptFromCamera(): void;
}

/** The name this adapter owns the camera under. It touches no other. */
const CLAIM = 'campus';

export interface CampusCameraAdapter {
  /** The campus's look target. Written by its flights; seeded here. */
  readonly lookTarget: THREE.Vector3;
  /** True from the first flight's start until the exit lands. */
  readonly holding: boolean;
  /** False while something else already flies the camera. */
  readonly canTake: boolean;
  /** Aims the next flight's start at where the rig is looking. */
  seed(): void;
  /** The campus's `onCameraControl`. */
  onCameraControl(enabled: boolean): void;
}

export function createCampusCameraAdapter(
  rig: CampusCameraRig,
  hooks: {
    /** After the rig has adopted the camera and runs again. */
    onReturn?: () => void;
  } = {},
): CampusCameraAdapter {
  const lookTarget = new THREE.Vector3();

  return {
    lookTarget,
    // Read off the rig rather than mirrored in a local flag. The mirror was a
    // second source of truth for one fact, and keeping it in step with the rig
    // was the adapter's job only because the rig could not answer "is this
    // claim mine?" — it can now.
    get holding() {
      return rig.hasClaim(CLAIM);
    },
    get canTake() {
      return rig.hasClaim(CLAIM) || !rig.isOwned;
    },
    seed() {
      lookTarget.set(rig.focus.x, rig.getEffectivePose().lookAtHeight, rig.focus.z);
    },
    onCameraControl(enabled) {
      if (!enabled) {
        // Every flight asks, and only the first of a visit takes. `claim` is
        // idempotent, so this is a statement of intent rather than a guard.
        rig.claim(CLAIM);
        return;
      }
      // The campus camera also reports `true` when it is disposed, whether or
      // not it ever flew. Releasing a rig it never took would hand the camera
      // back from under whoever does hold it — Earth, while the city is hidden.
      // The claim's own name is what makes that impossible now, but the guard
      // stays: `onReturn` and the adopt below are a hand-back, and firing them
      // for a visit that never happened would move a camera nobody moved.
      if (!rig.hasClaim(CLAIM)) return;
      rig.adoptFromCamera();
      rig.release(CLAIM);
      hooks.onReturn?.();
    },
  };
}
