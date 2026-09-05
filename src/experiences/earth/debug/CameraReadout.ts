/**
 * Earth's camera readout — the `?debug=1` / F3 panel Murcia has always had.
 *
 * Earth had the opposite half of Murcia's problem. It has a runtime handle
 * (`window.__vertigoProto.getCamera()`, camera/debugCameraHook.ts) and no way to
 * SEE the pose; Murcia has an overlay and, until 2026-09-05, no way to replay
 * one. Reading Earth's meant opening DevTools and converting `theta`/`phi` out
 * of radians by hand, which is not a thing to ask of the person actually judging
 * the framing.
 *
 * WHAT IT IS FOR, and therefore what it shows: `radius` is the arrival framing.
 * `INTERACTION_CONFIG.camera.overviewRadius` is where the intro lands and where
 * the zoom band rests, and zooming moves the live radius through that band — so
 * a viewer can zoom until the globe looks right, read the radius off, and that
 * number is the one to bake. Theta and phi joined it on 2026-09-05: the orbit
 * resets on arrival to `INTERACTION_CONFIG.camera.overviewThetaDegrees` /
 * `overviewPhiDegrees` (it used to be theta 0 / phi PI/2, hardcoded), so a
 * viewer can drag until the globe looks right and paste all four numbers.
 *
 * DELIBERATELY NOT SHARED with murcia/debug/DebugOverlay.ts. The two would make
 * a plausible common component, and `checks/architecture.ts` forbids the import
 * that would let Earth reuse it directly — so sharing means promoting a shell
 * out of a working module for its second caller. The duplicated part is a div,
 * a keydown listener and an interval; the part that matters, what each world
 * considers a pose, is not shared in any version of this.
 *
 * Polls rather than riding the frame loop, at the same rate Murcia's overlay
 * rebuilds its text (`overlayUpdatesPerSecond: 4`). A diagnostic panel has no
 * business adding work to a render callback, and at 4 Hz the difference is not
 * visible.
 */
import type { FocusCameraRig } from '../camera/createFocusCameraRig'

/** Matches murcia's `overlayUpdatesPerSecond: 4`. */
const UPDATES_PER_SECOND = 4

const DEG = 180 / Math.PI

/**
 * Mounts the readout and returns its teardown.
 *
 * Callers pass `enabled` rather than having this read the build flag, for the
 * reason murcia/config/appConfig.ts documents: the decision belongs to the
 * shell, and a module that reads it directly cannot be bundled for Node.
 */
export function installCameraReadout(rig: FocusCameraRig, enabled: boolean): () => void {
  if (!enabled) return () => {}
  if (typeof document === 'undefined') return () => {}

  const params = new URLSearchParams(window.location.search)
  const raw = params.get('debug')
  if (raw !== '1' && raw !== 'true') return () => {}

  const el = document.createElement('div')
  el.id = 'earth-camera-readout'
  document.body.appendChild(el)

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'F3') return
    e.preventDefault()
    el.classList.toggle('hidden')
  }
  window.addEventListener('keydown', onKeyDown)

  const render = (): void => {
    const p = rig.getDebugPose()
    el.textContent =
      `Radius         ${p.radius.toFixed(2)}\n` +
      `FOV            ${p.fov.toFixed(1)}°\n` +
      `Theta          ${(p.theta * DEG).toFixed(1)}° (orbit, resets to config on arrival)\n` +
      `Phi            ${(p.phi * DEG).toFixed(1)}° (orbit, resets to config on arrival)\n` +
      `Mode           ${p.mode}${p.active ? '' : ' (rig idle)'}\n` +
      // The line to copy: all four have a home in the config now.
      `\nPOSE earth radius=${p.radius.toFixed(2)} fov=${p.fov.toFixed(1)} ` +
      `theta=${(p.theta * DEG).toFixed(1)} phi=${(p.phi * DEG).toFixed(1)}\n\n` +
      `[F3] toggle overlay`
  }

  render()
  const timer = window.setInterval(render, 1000 / UPDATES_PER_SECOND)

  return () => {
    window.clearInterval(timer)
    window.removeEventListener('keydown', onKeyDown)
    el.remove()
  }
}
