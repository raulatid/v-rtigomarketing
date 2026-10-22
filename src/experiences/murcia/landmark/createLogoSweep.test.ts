import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createLogoSweep } from './createLogoSweep'
import { VERTIGO_BUILDING } from './vertigoBuildingConfig'

// The logo's material comes from the city's loader and may be shared; these
// pin that only the logo sweeps, that the band is a mix at the two include
// points, and that the strength rests at exactly zero outside the section.

type Shader = THREE.WebGLProgramParametersWithUniforms

function compile(material: THREE.Material): Shader {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n  #include <project_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n  vec3 outgoingLight = vec3(0.0);\n  #include <opaque_fragment>\n}',
  } as unknown as Shader
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

function city(shared: THREE.Material) {
  const logo = VERTIGO_BUILDING.logoNodeNames.map((name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 1), shared)
    mesh.name = name
    return mesh
  })
  const elsewhere = new THREE.Mesh(new THREE.BoxGeometry(), shared)
  const root = new THREE.Group().add(...logo, elsewhere)
  root.updateMatrixWorld(true)
  return { root, logo, elsewhere }
}

describe('the logo sweep', () => {
  it('clones the shared material for the logo alone, and hands it back on dispose', () => {
    const shared = new THREE.MeshStandardMaterial()
    const { root, logo, elsewhere } = city(shared)
    const sweep = createLogoSweep(root, VERTIGO_BUILDING)

    expect(logo[0]!.material).not.toBe(shared)
    expect(logo[1]!.material).toBe(logo[0]!.material)
    expect(elsewhere.material).toBe(shared)
    expect((logo[0]!.material as THREE.Material).customProgramCacheKey()).toMatch(/\|sweep$/)

    sweep.dispose()
    expect(logo.every((mesh) => mesh.material === shared)).toBe(true)
  })

  it('mixes the band into outgoingLight and carries the mark frame through the vertex stage', () => {
    const { root, logo } = city(new THREE.MeshStandardMaterial())
    createLogoSweep(root, VERTIGO_BUILDING)
    const shader = compile(logo[0]!.material as THREE.Material)

    expect(shader.vertexShader).toMatch(/#include <project_vertex>\nvSweep = /)
    expect(shader.fragmentShader).toMatch(/outgoingLight = mix\(outgoingLight, uSweepColor, uSweep \* .*\);\n#include <opaque_fragment>/)
    expect(shader.uniforms.uSweep).toBeDefined()
  })

  it('rises while on, falls when off and rests at exactly zero', () => {
    const { root, logo } = city(new THREE.MeshStandardMaterial())
    const sweep = createLogoSweep(root, VERTIGO_BUILDING)
    const strength = compile(logo[0]!.material as THREE.Material).uniforms.uSweep

    sweep.update(1)
    expect(strength.value).toBe(0)
    sweep.setTarget(true)
    for (let i = 0; i < 60; i++) sweep.update(1 / 30)
    expect(strength.value).toBeGreaterThan(0)
    sweep.setTarget(false)
    for (let i = 0; i < 60; i++) sweep.update(1 / 30)
    expect(strength.value).toBe(0)
  })

  it('places the band by elapsed time, not by frame count', () => {
    const run = (fps: number) => {
      const { root, logo } = city(new THREE.MeshStandardMaterial())
      const sweep = createLogoSweep(root, VERTIGO_BUILDING)
      const at = compile(logo[0]!.material as THREE.Material).uniforms.uSweepAt
      sweep.setTarget(true)
      for (let i = 0; i < fps; i++) sweep.update(1 / fps)
      return at.value as number
    }
    expect(run(30)).toBeCloseTo(run(120), 5)
  })
})
