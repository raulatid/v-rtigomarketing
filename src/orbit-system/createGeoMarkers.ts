import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { latLngToVector3 } from './geoUtils'
import { GEO_MARKERS, ORBIT_CONFIG } from './orbitConfig'

// City markers pinned to the rotating Earth. The returned group MUST be
// parented under whatever spins the Earth's surface, or the markers will slide
// off the geography they label.
//
// Handles limb fade (a marker on the far side must not show through the globe),
// raycast hover, and CSS2D tag visibility.

interface Options {
  camera: THREE.Camera
  domElement: HTMLElement
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
}

export function createGeoMarkers({ camera, domElement }: Options) {
  const cfg = ORBIT_CONFIG.markers
  const group = new THREE.Group()

  const dotGeometry = new THREE.SphereGeometry(cfg.markerSize, 16, 16)
  // Larger invisible sphere so the tiny dots are comfortable to hover.
  const hitGeometry = new THREE.SphereGeometry(cfg.hitSize, 8, 8)
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let pointerActive = false
  let cursorHover = false

  const markers: Marker[] = GEO_MARKERS.map((data) => {
    const position = latLngToVector3(data.lat, data.lng, cfg.radius)

    const dotMaterial = new THREE.MeshBasicMaterial({
      color: cfg.markerColor,
      transparent: true,
      opacity: cfg.markerOpacity,
      depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeometry, dotMaterial)
    dot.position.copy(position)

    const hit = new THREE.Mesh(hitGeometry, hitMaterial)
    hit.position.copy(position)

    const element = document.createElement('div')
    element.className = 'geo-tag'
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

    const marker: Marker = {
      data,
      dot,
      dotMaterial,
      hit,
      element,
      hoverEnabled: true,
      hovered: false,
      currentScale: 1,
    }
    hit.userData.marker = marker
    return marker
  })

  const hitMeshes = markers.map((m) => m.hit)

  function onPointerMove(event: PointerEvent) {
    const rect = domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    pointerActive = true
  }
  window.addEventListener('pointermove', onPointerMove)

  const tmpWorldPos = new THREE.Vector3()
  const cameraDir = new THREE.Vector3()
  let enabled = false

  function setEnabled(next: boolean) {
    if (enabled === next) return
    enabled = next
    group.visible = next
    if (!next) {
      for (const marker of markers) {
        marker.hovered = false
        marker.element.classList.remove('is-visible')
      }
      if (cursorHover) {
        cursorHover = false
        domElement.style.cursor = ''
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
    let hoveredMarker: Marker | null = null
    if (pointerActive) {
      raycaster.setFromCamera(mouse, camera)
      const intersections = raycaster.intersectObjects(hitMeshes, false)
      for (const intersection of intersections) {
        const marker = intersection.object.userData.marker as Marker
        if (marker.hoverEnabled) {
          hoveredMarker = marker
          break
        }
      }
    }

    for (const marker of markers) {
      marker.hovered = marker === hoveredMarker

      const targetScale = marker.hovered ? cfg.markerHoverScale : 1
      marker.currentScale = THREE.MathUtils.lerp(marker.currentScale, targetScale, 0.18)
      marker.dot.scale.setScalar(marker.currentScale)

      marker.element.classList.toggle('is-visible', marker.hovered)
    }

    // Write the cursor only on changes: other hover sources may share this
    // canvas, and per-frame writes would clobber each other.
    const wantsCursor = !!hoveredMarker
    if (wantsCursor !== cursorHover) {
      cursorHover = wantsCursor
      domElement.style.cursor = wantsCursor ? 'pointer' : ''
    }
  }

  function dispose() {
    window.removeEventListener('pointermove', onPointerMove)
    for (const marker of markers) {
      marker.dotMaterial.dispose()
      marker.element.remove()
    }
    dotGeometry.dispose()
    hitGeometry.dispose()
    hitMaterial.dispose()
    if (cursorHover) domElement.style.cursor = ''
  }

  return { group, update, setEnabled, dispose }
}

export type GeoMarkers = ReturnType<typeof createGeoMarkers>
