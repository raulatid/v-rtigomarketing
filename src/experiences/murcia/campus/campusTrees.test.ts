import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { splitCampusTrees } from './campusTrees'

// The city's instanced trees are one mesh per prototype. The park's own have
// to come out of it whole: their matrices and their per-instance atlas
// rectangles, while the city keeps the rest in order.

const ST = '_LIGHTMAP_ST'

function city() {
  const root = new THREE.Group()
  // The campus's ground: a 20 x 20 plate round the origin.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial())
  ground.rotation.x = -Math.PI / 2
  root.add(ground)

  // Four trees: two on the plate, two off it.
  const xs = [-30, 2, 40, 5]
  const zs = [0, 3, 0, -4]
  const geometry = new THREE.BoxGeometry(1, 4, 1)
  const st = new Float32Array(xs.flatMap((_, i) => [i, i + 0.5, i + 0.25, i + 0.75]))
  geometry.setAttribute(ST, new THREE.InstancedBufferAttribute(st, 4))
  const material = new THREE.MeshBasicMaterial()
  const trees = new THREE.InstancedMesh(geometry, material, xs.length)
  xs.forEach((x, i) => trees.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2, zs[i]!)))
  root.add(trees)
  return { root, ground, trees, geometry, material }
}

describe('splitCampusTrees', () => {
  it('moves the instances standing on the ground into a mesh of their own', () => {
    const { root, ground, trees, geometry, material } = city()
    const [park, ...rest] = splitCampusTrees(root, [ground])
    expect(rest).toHaveLength(0)
    expect(park!.count).toBe(2)
    expect(park!.material).toBe(material)
    expect(park!.parent).toBe(root)
    expect(park!.geometry.attributes.position).toBe(geometry.attributes.position)

    const at = (mesh: THREE.InstancedMesh, i: number) =>
      new THREE.Vector3().setFromMatrixPosition(
        (() => {
          const m = new THREE.Matrix4()
          mesh.getMatrixAt(i, m)
          return m
        })(),
      )
    expect(at(park!, 0).toArray()).toEqual([2, 2, 3])
    expect(at(park!, 1).toArray()).toEqual([5, 2, -4])
    expect(Array.from(park!.geometry.getAttribute(ST).array)).toEqual([1, 1.5, 1.25, 1.75, 3, 3.5, 3.25, 3.75])

    expect(trees.count).toBe(2)
    expect(at(trees, 0).toArray()).toEqual([-30, 2, 0])
    expect(at(trees, 1).toArray()).toEqual([40, 2, 0])
    expect(Array.from(geometry.getAttribute(ST).array).slice(0, 8)).toEqual([0, 0.5, 0.25, 0.75, 2, 2.5, 2.25, 2.75])
  })

  it('leaves a box corner off a turned plate to the city', () => {
    const { root, ground, trees } = city()
    ground.rotation.z = Math.PI / 4
    // (9, 9) is inside the turned plate's bounding box but off the plate.
    trees.setMatrixAt(1, new THREE.Matrix4().makeTranslation(9, 2, 9))
    const [park] = splitCampusTrees(root, [ground])
    expect(park!.count).toBe(1)
    expect(trees.count).toBe(3)
  })

  it('touches nothing when no instance stands on the ground', () => {
    const { root, trees } = city()
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
    far.rotation.x = -Math.PI / 2
    far.position.set(500, 0, 500)
    root.add(far)
    expect(splitCampusTrees(root, [far])).toEqual([])
    expect(trees.count).toBe(4)
  })
})
