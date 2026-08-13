import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { latLngToVector3 } from './geoUtils'
import { GEO_MARKERS, ORBIT_CONFIG } from './orbitConfig'
import type { CursorManager } from '../interaction/cursorManager'
import { clientToNdc } from '../interaction/screenSpace'

// City markers pinned to the rotating Earth. The returned group MUST be
// parented under whatever spins the Earth's surface, or the markers will slide
// off the geography they label.
//
// Handles limb fade (a marker on the far side must not show through the globe),
// raycast hover, and CSS2D tag visibility.

interface Options {
  camera: THREE.Camera
  domElement: HTMLElement
  /**
   * Fired when a `destination` marker is clicked. `case` markers never fire —
   * they are labels, not affordances.
   *
   * The id is passed rather than anything experience-shaped, so this module
   * stays ignorant of what a destination actually leads to.
   */
  onSelect?: (id: string) => void
  /**
   * Earth's cursor arbiter, resolved at call time rather than captured: it is
   * created by InteractionLayer, which may mount after this does. Nothing is
   * lost while it is null — the markers are disabled until the intro lands, so
   * there is no hover to report before then.
   *
   * Going through it rather than writing `domElement.style.cursor` is what
   * makes the hover survive the custom cursor's `cursor: none`.
   */
  getCursor: () => CursorManager | null
}

interface Marker {
  data: (typeof GEO_MARKERS)[number]
  dot: THREE.Mesh
  dotMaterial: THREE.MeshBasicMaterial
  hit: THREE.Mesh
  element: HTMLDivElement
  hoverEnabled: boolean
  hovered: boolean
  currentScale: number
  isDestination: boolean
  /** Rest scale before hover and pulse are applied. */
  baseScale: number
}

// A drag that happens to end over a marker must not navigate. Measured in
// pixels from pointerdown, and kept local rather than asking the camera rig —
// this module needs no knowledge of who else is handling the gesture.
//
// Two numbers because a finger is not a mouse: a tap wanders 5–15px between
// contact and release, so the mouse slop rejected nearly every tap and made the
// Murcia marker — the only door into that experience — unreachable on touch.
const CLICK_SLOP_PX = 5
const TOUCH_CLICK_SLOP_PX = 12

export function createGeoMarkers({ camera, domElement, onSelect, getCursor }: Options) {
  const cfg = ORBIT_CONFIG.markers
  const group = new THREE.Group()

  const dotGeometry = new THREE.SphereGeometry(cfg.markerSize, 16, 16)
  // Larger invisible sphere so the tiny dots are comfortable to hover.
  const hitGeometry = new THREE.SphereGeometry(cfg.hitSize, 8, 8)
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  // Last pointermove position, in viewport coordinates. Only meaningful once
  // `pointerActive` is set — hover is a mouse affordance, and a touch device
  // never produces one.
  let lastMoveX = 0
  let lastMoveY = 0
  let pointerActive = false
  let cursorHover = false

  const markers: Marker[] = GEO_MARKERS.map((data) => {
    const position = latLngToVector3(data.lat, data.lng, cfg.radius)
    const isDestination = data.kind === 'destination'

    const dotMaterial = new THREE.MeshBasicMaterial({
      color: isDestination ? cfg.destinationColor : cfg.markerColor,
      transparent: true,
      opacity: cfg.markerOpacity,
      depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeometry, dotMaterial)
    dot.position.copy(position)

    const hit = new THREE.Mesh(hitGeometry, hitMaterial)
    hit.position.copy(position)

    const element = document.createElement('div')
    element.className = isDestination ? 'geo-tag geo-tag--destination' : 'geo-tag'
    const title = document.createElement('div')
    title.className = 'geo-tag__title'
    title.textContent = data.title
    const text = document.createElement('div')
    text.className = 'geo-tag__text'
    text.textContent = data.text
    element.append(title, text)

    const tag = new CSS2DObject(element)
    tag.position
      .copy(position)
      .add(position.clone().normalize().multiplyScalar(cfg.tagOffset))

    group.add(dot)
    group.add(hit)
    group.add(tag)

    const baseScale = isDestination ? cfg.destinationScale : 1
    dot.scale.setScalar(baseScale)

    const marker: Marker = {
      data,
      dot,
      dotMaterial,
      hit,
      element,
      hoverEnabled: true,
      hovered: false,
      currentScale: baseScale,
      isDestination,
      baseScale,
    }
    hit.userData.marker = marker
    return marker
  })

  const hitMeshes = markers.map((m) => m.hit)
  let hoveredMarker: Marker | null = null

  /**
   * The marker under a viewport point, or null. No side effects.
   *
   * Coordinate-driven because a TAP fires pointerdown → pointerup → click with
   * no pointermove in between: on touch the hover raycast in update() never
   * runs, so `hoveredMarker` stayed null and this marker could not be
   * activated at all. Mirrors DistrictInteraction.pickAt.
   */
  function pickMarkerAt(clientX: number, clientY: number): Marker | null {
    clientToNdc(domElement.getBoundingClientRect(), clientX, clientY, ndc)

    raycaster.setFromCamera(ndc, camera)
    for (const intersection of raycaster.intersectObjects(hitMeshes, false)) {
      const marker = intersection.object.userData.marker as Marker
      // Same limb test the hover path applies: a marker on the far side of the
      // globe is drawn through it and must not be pickable.
      if (marker.hoverEnabled) return marker
    }
    return null
  }

  function onPointerMove(event: PointerEvent) {
    lastMoveX = event.clientX
    lastMoveY = event.clientY
    pointerActive = true
  }
  window.addEventListener('pointermove', onPointerMove)

  // Click-to-navigate. Tracked from pointerdown so a drag across the globe that
  // happens to release over the marker does not travel.
  let downX = 0
  let downY = 0
  let downValid = false
  let downPointerType = 'mouse'

  function onPointerDown(event: PointerEvent) {
    downValid = event.button === 0
    downX = event.clientX
    downY = event.clientY
    downPointerType = event.pointerType
  }

  function onPointerUp(event: PointerEvent) {
    if (!downValid) return
    downValid = false
    if (!enabled || !onSelect) return

    const slop = downPointerType === 'touch' ? TOUCH_CLICK_SLOP_PX : CLICK_SLOP_PX
    if (Math.abs(event.clientX - downX) > slop) return
    if (Math.abs(event.clientY - downY) > slop) return

    // Picked from the release coordinates, not from `hoveredMarker` — the
    // coordinates were already in hand here and the stored hover is null on
    // every touch device.
    const marker = pickMarkerAt(event.clientX, event.clientY)
    if (marker && marker.isDestination) {
      onSelect(marker.data.id)
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointerup', onPointerUp)

  const tmpWorldPos = new THREE.Vector3()
  const cameraDir = new THREE.Vector3()
  let enabled = false

  // The destination tag is permanently visible where hover is unsupported (see
  // the (hover: none) block in styles.css), so it has to be activatable too —
  // a label reading "Explorar la ciudad →" that swallows taps is a worse
  // affordance than no label. On pointer devices the tag keeps
  // pointer-events: none, so this listener can never fire there and the dot
  // remains the only target, exactly as before.
  //
  // Guarded on the same two conditions the raycast path applies, because CSS
  // visibility and scene state are updated a frame apart: a tap landing on a
  // tag whose marker just rotated past the limb must not navigate.
  const tagListeners = markers
    .filter((marker) => marker.isDestination)
    .map((marker) => {
      const handler = () => {
        if (!enabled || !onSelect) return
        if (!marker.hoverEnabled) return
        onSelect(marker.data.id)
      }
      marker.element.addEventListener('click', handler)
      return { element: marker.element, handler }
    })

  function setEnabled(next: boolean) {
    if (enabled === next) return
    enabled = next
    group.visible = next
    if (!next) {
      // Cleared so a click arriving after the markers are disabled cannot act
      // on a marker that is no longer on screen.
      hoveredMarker = null
      downValid = false
      for (const marker of markers) {
        marker.hovered = false
        marker.element.classList.remove('is-visible')
        // `is-near` too: on touch it is what keeps the destination tag on
        // screen, and update() stops running once disabled, so leaving it set
        // would strand a permanent label over a hidden marker.
        marker.element.classList.remove('is-near')
      }
      if (cursorHover) {
        cursorHover = false
        getCursor()?.request('marker', '')
      }
    }
  }
  setEnabled(false)

  function update() {
    if (!enabled) return

    // Limb visibility: markers rotate with the Earth, so world position is
    // required — the local position never changes.
    cameraDir.copy(camera.position).normalize()

    for (const marker of markers) {
      marker.dot.getWorldPosition(tmpWorldPos).normalize()
      const facing = tmpWorldPos.dot(cameraDir)

      const fade = THREE.MathUtils.clamp(
        (facing - cfg.visibilityThreshold) / cfg.visibilityFadeRange,
        0,
        1,
      )
      marker.hoverEnabled = facing > cfg.visibilityThreshold
      marker.dot.visible = fade > 0.001
      marker.dotMaterial.opacity = cfg.markerOpacity * fade
    }

    // Hover: nearest hit sphere whose marker is on the visible side.
    hoveredMarker = pointerActive ? pickMarkerAt(lastMoveX, lastMoveY) : null

    // Advanced here rather than from a delta so the pulse is wall-clock based
    // and cannot drift if a frame is long.
    const pulsePhase =
      (performance.now() / 1000) * ((Math.PI * 2) / cfg.destinationPulsePeriod)
    const pulse = 1 + Math.sin(pulsePhase) * cfg.destinationPulseAmount

    for (const marker of markers) {
      marker.hovered = marker === hoveredMarker

      const targetScale = marker.baseScale * (marker.hovered ? cfg.markerHoverScale : 1)
      marker.currentScale = THREE.MathUtils.lerp(marker.currentScale, targetScale, 0.18)
      // The pulse multiplies the eased scale instead of feeding into it, so
      // hover still settles cleanly rather than chasing a moving target.
      marker.dot.scale.setScalar(
        marker.isDestination ? marker.currentScale * pulse : marker.currentScale,
      )

      marker.element.classList.toggle('is-visible', marker.hovered)
      // The limb test that also gates pickability. Consumed only by the
      // (hover: none) rule in styles.css, where the destination tag is
      // permanent — without it that label would sit over the far side of the
      // globe advertising a marker nothing can hit.
      marker.element.classList.toggle('is-near', marker.hoverEnabled)
    }

    // Requested only on changes. The manager de-duplicates anyway, but this
    // runs every frame and the flag is what keeps it off the hot path.
    const wantsCursor = !!hoveredMarker
    if (wantsCursor !== cursorHover) {
      cursorHover = wantsCursor
      getCursor()?.request('marker', wantsCursor ? 'pointer' : '')
    }
  }

  function dispose() {
    window.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointerup', onPointerUp)
    for (const { element, handler } of tagListeners) {
      element.removeEventListener('click', handler)
    }
    for (const marker of markers) {
      marker.dotMaterial.dispose()
      marker.element.remove()
    }
    dotGeometry.dispose()
    hitGeometry.dispose()
    hitMaterial.dispose()
    if (cursorHover) getCursor()?.request('marker', '')
  }

  /**
   * World position of a marker's dot, or null if there is no such marker.
   *
   * World, not local: markers are parented under the group that spins the
   * Earth's surface, so the local position never changes and only the world one
   * says where the place actually is right now. The warp's dolly reads this
   * every frame to aim at the destination while the globe keeps turning.
   */
  function getWorldPosition(id: string, target: THREE.Vector3): THREE.Vector3 | null {
    const marker = markers.find((m) => m.data.id === id)
    if (!marker) return null
    return marker.dot.getWorldPosition(target)
  }

  return { group, update, setEnabled, getWorldPosition, dispose }
}

export type GeoMarkers = ReturnType<typeof createGeoMarkers>
