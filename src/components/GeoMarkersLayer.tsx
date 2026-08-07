import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createGeoMarkers, GeoMarkers } from '../orbit-system/createGeoMarkers'
import { EARTH_CONFIG } from '../earthConfig'
import { SequenceState } from '../sequenceState'
import { atOrAfter } from '../sceneVisibility'

interface Props {
  state: SequenceState
  active: boolean
  /** Fired when a destination marker is clicked. See createGeoMarkers. */
  onSelectDestination?: (id: string) => void
}

// Rendered INSIDE the Earth's spin group so the markers stay pinned to the
// geography they label. scale={EARTH_CONFIG.radius} because marker positions,
// like the orbit presets, are expressed in "Earth radius = 1" units.
//
// Also owns the CSS2D renderer for the hover tags. That is a second DOM-based
// renderer overlaying the canvas; it draws at useFrame priority 2 so it runs
// after RenderPipeline (priority 1), which owns the WebGL render.
export function GeoMarkersLayer({ state, active, onSelectDestination }: Props) {
  const { camera, gl, scene, size } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const markersRef = useRef<GeoMarkers | null>(null)
  const labelRef = useRef<CSS2DRenderer | null>(null)
  const onSelectRef = useRef(onSelectDestination)
  onSelectRef.current = onSelectDestination

  useEffect(() => {
    const parent = gl.domElement.parentElement
    if (!parent) return

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(window.innerWidth, window.innerHeight)
    const el = labelRenderer.domElement
    el.className = 'geo-tag-layer'
    parent.appendChild(el)
    labelRef.current = labelRenderer

    const markers = createGeoMarkers({
      camera,
      domElement: gl.domElement,
      // Read through a ref so the effect does not rebuild the markers when the
      // handler identity changes.
      onSelect: (id) => onSelectRef.current?.(id),
    })
    markersRef.current = markers
    groupRef.current?.add(markers.group)

    return () => {
      markersRef.current = null
      labelRef.current = null
      groupRef.current?.remove(markers.group)
      markers.dispose()
      el.remove()
    }
  }, [camera, gl, scene])

  useEffect(() => {
    labelRef.current?.setSize(size.width, size.height)
  }, [size.width, size.height])

  // The tags are DOM at z-index 15, above the canvas — leaving them in the tree
  // while another experience is showing would float Earth's labels over it.
  // Hiding the layer rather than unmounting it keeps the CSS2DObject bindings
  // intact so a return needs no rebuild.
  useEffect(() => {
    const el = labelRef.current?.domElement
    if (el) el.style.display = active ? '' : 'none'
  }, [active])

  useFrame(() => {
    const markers = markersRef.current
    if (!markers) return

    // Only interactive once the Earth has settled. During the warp the camera is
    // moving fast and hover would be meaningless — and tags over a warping globe
    // would look broken.
    markers.setEnabled(active && atOrAfter(state.phase, 'orbits'))
    if (!active) return

    markers.update()

    labelRef.current?.render(scene, camera)
  }, 2)

  return <group ref={groupRef} scale={EARTH_CONFIG.radius} />
}
