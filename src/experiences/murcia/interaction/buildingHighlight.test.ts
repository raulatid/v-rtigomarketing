import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { blinkStrength, createBuildingHighlight, easeHighlight, stepHighlight } from './buildingHighlight'

// The lightmapped materials this lands on are shared across the city and carry
// a compile hook that samples the atlas. Both facts are what these tests pin:
// the set lights and nothing else does, and the atlas hook survives the clone.

const OPTIONS = { color: '#38a9d6', intensity: 0.35, duration: 0.4 }

type Shader = THREE.WebGLProgramParametersWithUniforms

function fakeShader(fragment = '#include <common>\nvoid main() {\n  vec3 outgoingLight = vec3(0.0);\n  #include <opaque_fragment>\n}'): Shader {
  return { uniforms: {}, vertexShader: '', fragmentShader: fragment } as unknown as Shader
}

function compile(material: THREE.Material): Shader {
  const shader = fakeShader()
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

describe('the building highlight', () => {
  it('clones each shared material once and leaves the rest of the city on the original', () => {
    const shared = new THREE.MeshBasicMaterial()
    const a = new THREE.Mesh(new THREE.BoxGeometry(), shared)
    const b = new THREE.Mesh(new THREE.BoxGeometry(), shared)
    const elsewhere = new THREE.Mesh(new THREE.BoxGeometry(), shared)
    const building = new THREE.Group().add(a, b)

    createBuildingHighlight([building], OPTIONS)

    expect(a.material).not.toBe(shared)
    expect(b.material).toBe(a.material)
    expect(elsewhere.material).toBe(shared)
  })

  it('keeps the source compile hook and program key, and adds its own', () => {
    const source = new THREE.MeshBasicMaterial()
    const atlasHook = vi.fn()
    source.onBeforeCompile = atlasHook
    source.customProgramCacheKey = () => 'lightmap-key'
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source)

    createBuildingHighlight([mesh], OPTIONS)
    const clone = mesh.material as THREE.Material
    const shader = compile(clone)

    expect(atlasHook).toHaveBeenCalledTimes(1)
    expect(clone.customProgramCacheKey()).toBe('lightmap-key|highlight')
    expect(shader.fragmentShader).toMatch(
      /outgoingLight = mix\(outgoingLight, uHighlightColor, uHighlight\);\n#include <opaque_fragment>/,
    )
    expect(shader.fragmentShader).toContain('uniform float uHighlight;')
    expect(shader.uniforms.uHighlight).toBeDefined()
    expect(shader.uniforms.uHighlightColor).toBeDefined()
  })

  it('refuses a three whose fragment has no <opaque_fragment>', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    createBuildingHighlight([mesh], OPTIONS)
    const material = mesh.material as THREE.Material
    expect(() => material.onBeforeCompile(fakeShader('void main() {}'), {} as THREE.WebGLRenderer)).toThrow(
      /opaque_fragment/,
    )
  })

  it('rises on one eased strength, reverses from where it is, and rests at exactly zero', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], OPTIONS)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    expect(light.value).toBe(0)
    highlight.setTarget(true)
    highlight.update(0.2)
    expect(light.value).toBeCloseTo(easeHighlight(0.5) * OPTIONS.intensity)

    // Leaving mid-rise falls back from 0.5, never from full.
    highlight.setTarget(false)
    highlight.update(0.04)
    expect(light.value).toBeCloseTo(easeHighlight(0.4) * OPTIONS.intensity)

    highlight.update(10)
    expect(light.value).toBe(0)
  })

  it('lights every material in the set on the same strength', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const b = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()])
    createBuildingHighlight([a, b], OPTIONS)
    const materials = [a.material as THREE.Material, ...(b.material as THREE.Material[])]
    const uniforms = materials.map((material) => compile(material).uniforms.uHighlight)
    expect(new Set(uniforms).size).toBe(1)
  })

  it('hands the originals back and frees its clones on dispose', () => {
    const original = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original)
    const highlight = createBuildingHighlight([mesh], OPTIONS)
    const clone = mesh.material as THREE.Material
    const freed = vi.spyOn(clone, 'dispose')

    highlight.dispose()

    expect(mesh.material).toBe(original)
    expect(freed).toHaveBeenCalledTimes(1)
  })

  it('does not take back a material someone else has assigned since', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], OPTIONS)
    const later = new THREE.MeshBasicMaterial()
    mesh.material = later
    highlight.dispose()
    expect(mesh.material).toBe(later)
  })
})

describe('stepHighlight', () => {
  it('lands exactly on the target however large the step', () => {
    expect(stepHighlight(0.3, 1, 5, 0.4)).toBe(1)
    expect(stepHighlight(0.3, 0, 5, 0.4)).toBe(0)
  })

  it('snaps when asked for no animation, and never leaks NaN', () => {
    expect(stepHighlight(0, 1, 0.016, 0)).toBe(1)
    expect(stepHighlight(Number.NaN, 0, 0.016, 0.4)).toBe(0)
  })
})

describe('blinkStrength', () => {
  // One blink per period: a smooth bump that fills the first `duration`
  // seconds and nothing for the rest, so the building says "here" and then
  // leaves the viewer alone.
  it('is dark outside the blink and peaks in the middle of it', () => {
    expect(blinkStrength(0, 5, 1)).toBe(0)
    expect(blinkStrength(0.5, 5, 1)).toBeCloseTo(1, 10)
    expect(blinkStrength(1, 5, 1)).toBe(0)
    expect(blinkStrength(3, 5, 1)).toBe(0)
  })

  it('repeats every period', () => {
    expect(blinkStrength(5.5, 5, 1)).toBeCloseTo(blinkStrength(0.5, 5, 1), 10)
    expect(blinkStrength(10.5, 5, 1)).toBeCloseTo(1, 10)
  })

  it('rises and falls without a corner', () => {
    expect(blinkStrength(0.1, 5, 1)).toBeLessThan(blinkStrength(0.3, 5, 1))
    expect(blinkStrength(0.7, 5, 1)).toBeGreaterThan(blinkStrength(0.9, 5, 1))
    expect(blinkStrength(0.25, 5, 1)).toBeCloseTo(blinkStrength(0.75, 5, 1), 10)
  })

  it('lights nothing for a degenerate period or duration', () => {
    expect(blinkStrength(0.5, 0, 1)).toBe(0)
    expect(blinkStrength(0.5, 5, 0)).toBe(0)
  })
})

describe('the idle blink', () => {
  const BLINKING = { ...OPTIONS, blink: { period: 5, duration: 1, strength: 0.7 } }

  it('lights the building on its own, at the blink strength, and goes dark between blinks', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.update(0.5)
    expect(light.value).toBeCloseTo(0.7 * OPTIONS.intensity, 10)
    highlight.update(1)
    expect(light.value).toBe(0)
    highlight.update(4)
    expect(light.value).toBeCloseTo(0.7 * OPTIONS.intensity, 10)
  })

  it('never outshines a hover, which holds the building fully lit through a blink', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.setTarget(true)
    highlight.update(10)
    highlight.update(0.5)
    expect(light.value).toBeCloseTo(OPTIONS.intensity, 10)
  })

  it('stays dark with the blink off, as the reduced-motion build has it', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], { ...OPTIONS, blink: null })
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.update(0.5)
    expect(light.value).toBe(0)
  })
})
