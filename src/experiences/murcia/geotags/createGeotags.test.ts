import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createGeotags, createPinGeometry, distanceFade, pinLift, type GeotagSite } from './createGeotags'
import { GEOTAG } from './geotagConfig'

const FAR = GEOTAG.farDistance + 200
const NEAR = GEOTAG.nearDistance - 50

/** A site mid-blink unless told otherwise, since a pin only shows during one. */
function site(id: string, x = 0, pulse = () => 1): GeotagSite {
  return { id, base: (out) => out.set(x, 20, 0), pulse }
}

/** A camera `distance` away from the pin over x = 0, level with it. */
function cameraAt(distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 20 + GEOTAG.clearance, distance)
  return camera
}

/** Shown and settled: long past the fade. */
function settled(tags: ReturnType<typeof createGeotags>, camera: THREE.Camera) {
  tags.setVisible(true)
  tags.update(GEOTAG.fadeSeconds * 2, camera)
  return tags.object3D.children as THREE.Mesh[]
}

describe('distanceFade', () => {
  it('is 0 up close, 1 far away, and eased between', () => {
    expect(distanceFade(100, 250, 350)).toBe(0)
    expect(distanceFade(250, 250, 350)).toBe(0)
    expect(distanceFade(300, 250, 350)).toBeCloseTo(0.5, 10)
    expect(distanceFade(350, 250, 350)).toBe(1)
    expect(distanceFade(900, 250, 350)).toBe(1)
  })

  it('is 0 for a distance that is not a number', () => {
    expect(distanceFade(Number.NaN, 250, 350)).toBe(0)
  })
})

describe('pinLift', () => {
  const still = { ...GEOTAG, floatAmplitude: 0 }

  it('hops by the pulse, the site highlight blink', () => {
    expect(pinLift(0, 0, still)).toBe(0)
    expect(pinLift(0, 1, still)).toBe(GEOTAG.hopAmplitude)
    expect(pinLift(0, 0.5, still)).toBe(GEOTAG.hopAmplitude / 2)
  })

  it('clamps a pulse outside 0..1 and ignores one that is not a number', () => {
    expect(pinLift(0, 3, still)).toBe(GEOTAG.hopAmplitude)
    expect(pinLift(0, Number.NaN, still)).toBe(0)
  })

  it('floats on its own period', () => {
    const quarter = GEOTAG.floatPeriod / 4
    expect(pinLift(quarter, 0, GEOTAG)).toBeCloseTo(GEOTAG.floatAmplitude, 10)
    expect(pinLift(GEOTAG.floatPeriod, 0, GEOTAG)).toBeCloseTo(0, 10)
  })
})

describe('createPinGeometry', () => {
  it('stands its tip on the origin and its crown at the height', () => {
    const geometry = createPinGeometry(18)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    // The bevel grows the outline by a fraction of a unit either way.
    expect(box.min.y).toBeLessThan(0.5)
    expect(box.max.y).toBeGreaterThan(17.5)
    expect(box.max.y).toBeLessThan(19)
    // Centred in depth, so it turns about its own middle.
    expect(box.min.z + box.max.z).toBeCloseTo(0, 6)
  })
})

describe('createGeotags', () => {
  it('makes one pin per site, none of which a ray can hit', () => {
    const tags = createGeotags([site('a'), site('b', 100)], { reducedMotion: false })
    const pins = tags.object3D.children as THREE.Mesh[]
    expect(pins).toHaveLength(2)

    const hits: THREE.Intersection[] = []
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 30, 50), new THREE.Vector3(0, 0, -1))
    for (const pin of pins) pin.raycast(ray, hits)
    expect(hits).toHaveLength(0)
  })

  it('is shown from afar and hidden up close', () => {
    const far = settled(createGeotags([site('a')], { reducedMotion: false }), cameraAt(FAR))
    expect(far[0].visible).toBe(true)
    expect((far[0].material as THREE.MeshBasicMaterial).opacity).toBe(1)

    const near = settled(createGeotags([site('a')], { reducedMotion: false }), cameraAt(NEAR))
    expect(near[0].visible).toBe(false)
  })

  it('fades out when navigation stops, and is gone once it has', () => {
    const tags = createGeotags([site('a')], { reducedMotion: false })
    const camera = cameraAt(FAR)
    const [pin] = settled(tags, camera)
    tags.setVisible(false)
    tags.update(GEOTAG.fadeSeconds / 2, camera)
    const halfway = (pin.material as THREE.MeshBasicMaterial).opacity
    expect(halfway).toBeGreaterThan(0)
    expect(halfway).toBeLessThan(1)
    tags.update(GEOTAG.fadeSeconds, camera)
    expect(pin.visible).toBe(false)
  })

  it('stands over its site and faces the camera about the vertical only', () => {
    const tags = createGeotags([site('a', 40)], { reducedMotion: true })
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(40 + FAR, 200, 0)
    const [pin] = settled(tags, camera)
    expect(pin.position.x).toBe(40)
    expect(pin.position.y).toBe(20 + GEOTAG.clearance)
    expect(pin.rotation.x).toBe(0)
    expect(pin.rotation.z).toBe(0)
    // Its face (+Z) turned toward +X, where the camera is.
    const facing = new THREE.Vector3(0, 0, 1).applyEuler(pin.rotation)
    expect(facing.x).toBeCloseTo(1, 10)
  })

  it('shows only while its site blinks, fading with the blink', () => {
    let pulse = 0
    const tags = createGeotags([site('a', 0, () => pulse)], { reducedMotion: false })
    const camera = cameraAt(FAR)
    const [pin] = settled(tags, camera)
    expect(pin.visible).toBe(false)

    pulse = 0.5
    tags.update(0, camera)
    expect(pin.visible).toBe(true)
    expect((pin.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.5, 10)

    pulse = 1
    tags.update(0, camera)
    expect((pin.material as THREE.MeshBasicMaterial).opacity).toBe(1)

    pulse = 0
    tags.update(0, camera)
    expect(pin.visible).toBe(false)
  })

  it('stays shown between blinks under reduced motion, where there are none', () => {
    const tags = createGeotags([site('a', 0, () => 0)], { reducedMotion: true })
    const [pin] = settled(tags, cameraAt(FAR))
    expect(pin.visible).toBe(true)
    expect((pin.material as THREE.MeshBasicMaterial).opacity).toBe(1)
  })

  it('hops with its own site pulse, and not with another', () => {
    let pulse = 0
    const tags = createGeotags([site('a', 0, () => pulse), site('b', 100)], {
      reducedMotion: false,
      config: { ...GEOTAG, floatAmplitude: 0 },
    })
    const camera = cameraAt(FAR)
    const [a, b] = settled(tags, camera)
    const restA = a.position.y
    const restB = b.position.y
    pulse = 1
    tags.update(0, camera)
    expect(a.position.y - restA).toBeCloseTo(GEOTAG.hopAmplitude, 10)
    expect(b.position.y).toBe(restB)
  })

  it('stands still under reduced motion, pulse or not', () => {
    const tags = createGeotags([site('a', 0, () => 1)], { reducedMotion: true })
    const camera = cameraAt(FAR)
    const [pin] = settled(tags, camera)
    const rest = pin.position.y
    tags.update(GEOTAG.floatPeriod / 4, camera)
    expect(pin.position.y).toBe(rest)
    expect(rest).toBe(20 + GEOTAG.clearance)
  })

  it('leaves the scene and frees what it made on dispose', () => {
    const scene = new THREE.Scene()
    const tags = createGeotags([site('a')], { reducedMotion: false })
    scene.add(tags.object3D)
    const [pin] = tags.object3D.children as THREE.Mesh[]
    let freed = 0
    pin.geometry.addEventListener('dispose', () => (freed += 1))
    ;(pin.material as THREE.Material).addEventListener('dispose', () => (freed += 1))
    tags.dispose()
    expect(tags.object3D.parent).toBeNull()
    expect(freed).toBe(2)
  })
})
