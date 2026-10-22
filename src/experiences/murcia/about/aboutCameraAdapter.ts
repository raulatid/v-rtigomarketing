/**
 * The hand-over between the city's rig and Conócenos' own camera.
 *
 * `campus/campusCameraAdapter.ts` under another name, for its reasons: the
 * section flies the camera itself to poses the rig cannot express, so for the
 * whole visit the rig is claimed under `'about'` and its springs are not
 * stepped — `MurciaExperience.update`'s ladder has that rung — and the camera
 * is handed back with `adoptFromCamera` only when the way out has landed on
 * the pose the rig produced. It touches no other claim (trap: murcia-camara
 * #17).
 *
 * Kept apart from the campus's on purpose. If the two stay identical once the
 * section is done, joining them is a commit of its own.
 */

/** What the adapter needs of `CameraRig`, and nothing else. */
export interface AboutCameraRig {
  readonly isOwned: boolean;
  hasClaim(id: 'about'): boolean;
  claim(id: 'about'): void;
  release(id: 'about'): void;
  adoptFromCamera(): void;
}

/** The name this adapter owns the camera under. */
const CLAIM = 'about';

export interface AboutCameraAdapter {
  /** True from the first flight's start until the camera is handed back. */
  readonly holding: boolean;
  /** False while something else already flies the camera. */
  readonly canTake: boolean;
  /** The section camera's `onControl`. */
  onCameraControl(enabled: boolean): void;
}

export function createAboutCameraAdapter(
  rig: AboutCameraRig,
  hooks: {
    /** After the rig has adopted the camera and runs again. */
    onReturn?: () => void;
  } = {},
): AboutCameraAdapter {
  return {
    get holding() {
      return rig.hasClaim(CLAIM);
    },
    get canTake() {
      return rig.hasClaim(CLAIM) || !rig.isOwned;
    },
    onCameraControl(enabled) {
      if (!enabled) {
        rig.claim(CLAIM);
        return;
      }
      // Never hand back a claim this never took: the adopt and `onReturn` are
      // a hand-back, and firing them for a visit that never happened would
      // move a camera nobody moved.
      if (!rig.hasClaim(CLAIM)) return;
      rig.adoptFromCamera();
      rig.release(CLAIM);
      hooks.onReturn?.();
    },
  };
}
