import * as THREE from 'three'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { CursorManager } from '../../../interaction/cursorManager'
import { closeUpScreenOffset } from './closeUpFraming'

// Camera rig for the interactive phase, ported from earth-connections
// (docs/extractions/003).
//
// ONE smoothing mechanism for everything: a target/current pair of
// { position, lookAt } moved by a frame-rate-independent exponential lerp.
// Every behaviour — drag orbit, satellite fly-in, return to overview — only ever
// writes the TARGET. Nothing moves the camera directly.
//
// This is also why there is no OrbitControls: a second camera owner would fight
// this one every frame. In our case the other owner is CameraController, which
// drives the whole intro — so this rig stays dormant until activate() is called
// at the resting phase, and seeds itself from wherever the camera actually is.

type Mode = 'overview' | 'focusing' | 'focused'

interface Options {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  cursor: CursorManager
  // The pose the intro rests at. The rig adopts it as its overview.
  overviewPose: [number, number, number]
  onEmptyClick: () => void
  // Takes viewport coordinates rather than reading a stored hover: a tap
  // produces no hover at all, so the answer has to be picked from the event.
  isOverSatellite: (clientX: number, clientY: number) => boolean
}

export function createFocusCameraRig({
  camera,
  domElement,
  cursor,
  overviewPose,
  onEmptyClick,
  isOverSatellite,
}: Options) {
  const cfg = INTERACTION_CONFIG.camera

  const overviewPosition = new THREE.Vector3()
  const overviewLookAt = new THREE.Vector3(0, 0, 0)

  const target = { position: new THREE.Vector3(), lookAt: new THREE.Vector3() }
  const current = { position: new THREE.Vector3(), lookAt: new THREE.Vector3() }

  let active = false
  let mode: Mode = 'overview'
  let focused = false // is a close-up target active (decides who owns the target)
  let orbitEnabled = true

  // ─── Manual spherical orbit (drag) ───
  //
  // `orbit` is where the drag has ASKED the camera to be; `eased` is where it
  // actually is. Both angles are unbounded, and that is load-bearing: the
  // difference between them is the true SIGNED travel still owed to the viewer.
  //
  // This used to be one pair of Cartesian vectors eased with
  // `current.position.lerp(target.position, alpha).setLength(r)`, and that is
  // structurally unable to represent more than half a turn. `target.position`
  // is rebuilt from spherical coordinates every frame, so it depends only on
  // `theta mod 2*PI`, and a straight line between two points on a sphere always
  // travels the MINOR arc. Once the ease lagged the drag by more than 180° —
  // which `lerpK: 3` reaches at around 1400 px/s, an ordinary brisk drag — the
  // interpolation pointed the other way and the camera rotated BACKWARD under
  // the viewer's hand. Exactly antipodal, it stopped dead: the chord ran through
  // the origin, so re-projecting put the camera back precisely where it was.
  //
  // Easing the angles instead removes the failure rather than bounding it.
  // `checks/earth-orbit.ts` holds the measurements.
  const orbit = {
    theta: 0,
    phi: Math.PI / 2,
    radius: 1,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  }
  /** Where the camera is, as angles. Unbounded, like `orbit`. */
  const eased = { theta: 0, phi: Math.PI / 2, radius: 1 }
  let dragDistance = 0

  function syncOrbitTo(position: THREE.Vector3) {
    const s = new THREE.Spherical().setFromVector3(position)
    orbit.theta = s.theta
    orbit.phi = THREE.MathUtils.clamp(s.phi, cfg.phiMin, cfg.phiMax)
    orbit.radius = s.radius
  }

  /**
   * `target` expressed as the value nearest `from`, rather than its principal
   * value.
   *
   * The DRAG must never use this — preserving winding is the whole point of it
   * being unbounded. The RETURN from a close-up must always use it, or a viewer
   * who wound the globe round one and a half turns would watch it unwind every
   * degree on the way back. Two opposite requirements, which is why the rig has
   * two paths; Murcia keeps the same split between `CameraRig.yawDegrees` and
   * `CameraFlight.shortestYawDelta`.
   */
  function nearestEquivalentAngle(from: number, target: number): number {
    const TAU = Math.PI * 2
    return from + ((((target - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI
  }

  // Takes over the camera from whatever was driving it.
  //
  // Seeds from the KNOWN overview pose, not the live camera. On the natural path
  // CameraController leaves the camera exactly there, so the handoff is
  // jump-free; on a skip it bails before ever moving the camera off the
  // starfield position, and seeding from live would strand the rig at z=200 with
  // the Earth a dot. A skip snaps everything else instantly too, so a snap here
  // is consistent.
  function activate() {
    if (active) return
    active = true
    overviewPosition.set(...overviewPose)
    current.position.copy(overviewPosition)
    target.position.copy(overviewPosition)
    current.lookAt.copy(overviewLookAt)
    target.lookAt.copy(overviewLookAt)
    // From the overview pose, NOT camera.position — the spherical radius is what
    // updateOrbitTarget rebuilds the target from every frame, so seeding it from
    // a stale camera would undo the whole point of the line above.
    syncOrbitTo(overviewPosition)
    // Asked and actual start out the same, so the handoff owes no travel.
    eased.theta = orbit.theta
    eased.phi = orbit.phi
    eased.radius = orbit.radius
    mode = 'overview'
    focused = false
    orbitEnabled = true
  }

  function deactivate() {
    active = false
    if (orbit.isDragging) endDrag()
  }

  function updateOrbitTarget() {
    target.position.setFromSphericalCoords(orbit.radius, orbit.phi, orbit.theta)
    target.lookAt.copy(overviewLookAt)
  }

  function endDrag() {
    orbit.isDragging = false
    try {
      domElement.releasePointerCapture?.(activePointerId)
    } catch {
      // Capture may already be gone; releasing twice is not an error worth surfacing.
    }
    cursor.request('drag', '')
  }

  let activePointerId = -1
  let dragPointerType = 'mouse'
  /** Where the current pointer sequence went down, for the drag threshold. */
  let pointerDownX = 0
  let pointerDownY = 0
  /** Whether this sequence has travelled far enough to turn the globe. */
  let exceededThreshold = false

  /**
   * Movement required before the orbit responds, for the pointer in hand.
   *
   * Zero for mouse and pen. They are precise, a press does not wander, and a
   * threshold there would only add latency to a control that has never needed
   * it — the same reason the click tolerance splits by pointer type.
   */
  function dragThreshold(pointerType: string) {
    return pointerType === 'touch' ? cfg.touchDragThresholdPx : 0
  }

  // How much accumulated travel still counts as a tap. A finger tap routinely
  // jitters 5–15px, so the mouse tolerance would reject most taps as drags;
  // mouse and pen are precise and keep the original, tighter number.
  function dragClickThreshold() {
    return dragPointerType === 'touch' ? cfg.touchDragClickThreshold : cfg.dragClickThreshold
  }

  function onPointerDown(e: PointerEvent) {
    if (!active || e.button !== 0) return
    // Recorded before the orbit gate below, so a tap that arrives while a
    // satellite is focused (no orbit, but still a click) is measured with the
    // right tolerance.
    dragPointerType = e.pointerType
    if (!orbitEnabled) return // no orbit while a satellite is focused
    // A second finger must not take the gesture over. `onPointerMove` reacted to
    // `orbit.isDragging` alone and this reseeded the anchor for any pointer, so
    // two contact points both fed the orbit and the globe jittered between them.
    if (orbit.isDragging) {
      // And it can never be a TAP either. `dragDistance` accumulates only the
      // active pointer's travel (onPointerMove drops every other pointer before
      // it counts), so a two-finger gesture whose anchor finger barely moves
      // would otherwise end under the tap tolerance — and a synthesised click
      // would read as a clean tap and select a satellite. Poisoned rather than
      // guarded by a flag, because the click path already asks exactly this
      // question and there is no second question to ask.
      dragDistance = Number.POSITIVE_INFINITY
      return
    }
    orbit.isDragging = true
    orbit.lastX = e.clientX
    orbit.lastY = e.clientY
    pointerDownX = e.clientX
    pointerDownY = e.clientY
    exceededThreshold = false
    dragDistance = 0
    activePointerId = e.pointerId
    try {
      domElement.setPointerCapture?.(e.pointerId)
    } catch {
      // The pointer can be gone by the time this handler runs — released between
      // the event being queued and the queue being drained, which a busy main
      // thread makes ordinary rather than exotic. Capture is an optimisation
      // here (it keeps moves coming once the finger leaves the canvas), not a
      // requirement, so failing to take it must not abandon the rest of the
      // gesture setup below. `releasePointerCapture` has been guarded for the
      // same reason since it was written; this is its missing other half.
    }
    cursor.request('drag', 'grabbing')
  }

  function onPointerMove(e: PointerEvent) {
    if (!orbit.isDragging) return
    // Only the pointer that started the gesture drives it. See onPointerDown.
    if (e.pointerId !== activePointerId) return

    const dx = e.clientX - orbit.lastX
    const dy = e.clientY - orbit.lastY
    orbit.lastX = e.clientX
    orbit.lastY = e.clientY
    // Accumulated BEFORE the threshold gate, deliberately. This is the
    // click-vs-drag measure, and a drag that ends over a satellite must not
    // select it — discounting the first 12px would make short drags read as
    // taps and hand the viewer a close-up they did not ask for.
    dragDistance += Math.abs(dx) + Math.abs(dy)

    if (!exceededThreshold) {
      const threshold = dragThreshold(e.pointerType)
      if (threshold > 0) {
        const travelled = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY)
        if (travelled < threshold) return
        // Re-anchor at the moment the drag actually begins, so the first frame
        // does not jump by the threshold distance. Same shape as Murcia's, and
        // it costs this one move — which is the price of the re-anchor.
        exceededThreshold = true
        return
      }
      // No threshold, so nothing to re-anchor FROM: falling through keeps a
      // mouse drag turning on its very first pixel, as it always has. Consuming
      // this move instead would silently discard the opening of every drag —
      // `check:earth` caught exactly that, because it drags in one large step.
      exceededThreshold = true
    }

    orbit.theta -= dx * cfg.orbitSensitivity
    orbit.phi = THREE.MathUtils.clamp(
      orbit.phi - dy * cfg.orbitSensitivity,
      cfg.phiMin,
      cfg.phiMax,
    )
  }

  function onPointerUp(e: PointerEvent) {
    if (!orbit.isDragging) return
    // Only the pointer that OWNS the gesture may end it. Without this a second
    // finger — which contributes nothing, having been rejected in onPointerDown
    // and dropped in onPointerMove — ended the first finger's drag on its way
    // up, and endDrag() then released capture for a pointer still on the glass.
    // Harmless while two fingers were an accident; every pinch is two fingers.
    if (e.pointerId !== activePointerId) return
    endDrag()
  }

  function onClick(e: MouseEvent) {
    if (!active) return
    // A drag that happens to end over a satellite must not select it.
    if (dragDistance > dragClickThreshold()) return
    if (!isOverSatellite(e.clientX, e.clientY)) onEmptyClick()
  }

  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('pointerup', onPointerUp)
  domElement.addEventListener('pointercancel', onPointerUp)
  domElement.addEventListener('click', onClick)

  // ─── Close-up framing ───
  const _forward = new THREE.Vector3()
  const _right = new THREE.Vector3()
  const _worldUp = new THREE.Vector3(0, 1, 0)

  function focusOn(satWorldPos: THREE.Vector3) {
    const cu = INTERACTION_CONFIG.closeUp

    // Earth is at the origin, so normalize(satPos) is the outward radial
    // direction. Backing off along it puts the camera outside the satellite
    // looking back toward the planet, keeping the Earth as the backdrop.
    const viewDir = satWorldPos.clone().normalize()
    const camPos = satWorldPos
      .clone()
      .add(viewDir.multiplyScalar(cu.distance))
      .add(new THREE.Vector3(0, cu.lift, 0))

    // Shift the LOOK-AT to the camera's right, not the camera itself: the
    // satellite lands left of centre, clearing the right side for the panel,
    // and it reads as a framing choice rather than a sideways dolly.
    //
    // The magnitude is solved per viewport rather than fixed. A constant world
    // offset is a constant ANGLE, and the frame's horizontal half-angle shrinks
    // with the aspect ratio — which put the subject outside the frustum
    // entirely on a phone in portrait. `closeUpFraming.ts` carries the numbers
    // and the arithmetic.
    //
    // `cu.distance` is the nominal subject distance: the true one also picks up
    // `cu.lift`, by an amount that varies with the satellite's latitude. The
    // shipped composition was judged against the nominal figure and the
    // difference is well inside what a framing fraction expresses, so this
    // deliberately does not re-derive it per satellite.
    _forward.subVectors(satWorldPos, camPos).normalize()
    _right.crossVectors(_forward, _worldUp).normalize()
    const offset = closeUpScreenOffset({
      subjectDistance: cu.distance,
      verticalFovDegrees: camera.fov,
      aspect: camera.aspect,
      viewportWidthPx: domElement.clientWidth,
      viewportHeightPx: domElement.clientHeight,
    })
    const lookAt = satWorldPos.clone().add(_right.clone().multiplyScalar(offset))

    target.position.copy(camPos)
    target.lookAt.copy(lookAt)
    focused = true
    mode = 'focusing'
  }

  function returnToOverview() {
    // Seed the angular position from where the camera ACTUALLY is, because the
    // close-up target is deliberately off the orbit sphere (it carries a lift
    // and a shifted look-at). This is the one place the two representations have
    // to be reconciled, and without it clearing `focused` below would teleport
    // the camera back onto the sphere on the very next frame.
    const here = new THREE.Spherical().setFromVector3(current.position)
    eased.theta = here.theta
    eased.phi = THREE.MathUtils.clamp(here.phi, cfg.phiMin, cfg.phiMax)
    eased.radius = here.radius

    // Resync the drag orbit so rotation resumes from the overview pose — but
    // expressed nearest to where we are, so the return takes the short way.
    const overview = new THREE.Spherical().setFromVector3(overviewPosition)
    orbit.theta = nearestEquivalentAngle(eased.theta, overview.theta)
    orbit.phi = THREE.MathUtils.clamp(overview.phi, cfg.phiMin, cfg.phiMax)
    orbit.radius = overview.radius

    target.position.copy(overviewPosition)
    target.lookAt.copy(overviewLookAt)
    focused = false
    mode = 'focusing'
  }

  function update(delta: number) {
    if (!active) return

    // The drag orbit owns the target only while no close-up is active.
    if (!focused) updateOrbitTarget()

    const alpha = 1 - Math.exp(-cfg.lerpK * delta)

    if (!focused) {
      // Ease the ANGLES, and the radius alongside them. Angle and radius stay
      // independent for the reason the previous implementation gave — a plain
      // Cartesian lerp between two points on the orbit sphere cuts through the
      // chord, so the camera sinks below the orbit radius and visibly zooms in
      // and out as you pan — but that is now a property of the representation
      // rather than something recovered by re-projecting afterwards.
      //
      // Which matters, because re-projection could only ever fix the radius. It
      // could not fix the DIRECTION, and the direction was the bug: the chord
      // always takes the minor arc, so a drag that outran the ease by more than
      // half a turn was quietly resolved the wrong way round. Interpolating an
      // unbounded angle has no such seam — 540° is simply further than 180°.
      eased.theta += (orbit.theta - eased.theta) * alpha
      eased.phi += (orbit.phi - eased.phi) * alpha
      eased.radius = THREE.MathUtils.lerp(eased.radius, orbit.radius, alpha)
      current.position.setFromSphericalCoords(eased.radius, eased.phi, eased.theta)
    } else {
      // The close-up deliberately does NOT re-project: here the radius change
      // is the point, and the target is not on the orbit sphere at all — so it
      // has no angles to ease and stays a Cartesian lerp.
      current.position.lerp(target.position, alpha)
    }

    current.lookAt.lerp(target.lookAt, alpha)
    camera.position.copy(current.position)
    camera.lookAt(current.lookAt)

    if (
      mode === 'focusing' &&
      current.position.distanceTo(target.position) < cfg.arrivalEpsilon
    ) {
      mode = focused ? 'focused' : 'overview'
    }
  }

  function setOrbitEnabled(enabled: boolean) {
    orbitEnabled = enabled
    if (!enabled && orbit.isDragging) endDrag()
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerup', onPointerUp)
    domElement.removeEventListener('pointercancel', onPointerUp)
    domElement.removeEventListener('click', onClick)
  }

  return {
    update,
    activate,
    deactivate,
    focusOn,
    returnToOverview,
    setOrbitEnabled,
    isActive: () => active,
    isDragging: () => orbit.isDragging,
    /**
     * The point the camera is currently aimed at. Live, not a copy.
     *
     * Published for the scrub modifier, which runs immediately after update()
     * and moves the camera along its own view axis — it has to re-aim at the
     * SAME point the rig just used, or the two disagree by a fraction of a
     * degree every frame and the globe drifts out of centre.
     */
    getLookAt: () => current.lookAt,
    getDragDistance: () => dragDistance,
    // Published so the satellite controller measures a tap the same way this
    // rig does, instead of hardcoding its own copy of the number.
    getDragClickThreshold: dragClickThreshold,
    dispose,
  }
}

export type FocusCameraRig = ReturnType<typeof createFocusCameraRig>
