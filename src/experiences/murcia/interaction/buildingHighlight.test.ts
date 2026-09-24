import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { blinkStrength, createBuildingHighlight, easeHighlight, stepHighlight } from './buildingHighlight'
import type { BuildingHighlightOptions } from './buildingHighlight'

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
  // Dark for the wait, then lit for the duration, with a smooth edge in and out,
  // so the building says "here" for long enough to be seen and then leaves the
  // viewer alone.
  it('is dark through the wait and fully lit in the middle of the duration', () => {
    expect(blinkStrength(0, 5, 2, 0.4)).toBe(0)
    expect(blinkStrength(4.9, 5, 2, 0.4)).toBe(0)
    expect(blinkStrength(6, 5, 2, 0.4)).toBe(1)
    expect(blinkStrength(5.5, 5, 2, 0.4)).toBe(1)
    expect(blinkStrength(6.5, 5, 2, 0.4)).toBe(1)
  })

  it('repeats every wait plus duration', () => {
    expect(blinkStrength(7.5, 5, 2, 0.4)).toBe(0)
    expect(blinkStrength(13, 5, 2, 0.4)).toBe(1)
    expect(blinkStrength(12.2, 5, 2, 0.4)).toBeCloseTo(blinkStrength(5.2, 5, 2, 0.4), 10)
  })

  it('rises over its first edge and falls over its last, symmetrically', () => {
    expect(blinkStrength(5.1, 5, 2, 0.4)).toBeGreaterThan(0)
    expect(blinkStrength(5.1, 5, 2, 0.4)).toBeLessThan(blinkStrength(5.3, 5, 2, 0.4))
    expect(blinkStrength(6.9, 5, 2, 0.4)).toBeLessThan(blinkStrength(6.7, 5, 2, 0.4))
    expect(blinkStrength(5.2, 5, 2, 0.4)).toBeCloseTo(blinkStrength(6.8, 5, 2, 0.4), 10)
    expect(blinkStrength(5.2, 5, 2, 0.4)).toBeCloseTo(0.5, 10)
  })

  it('switches without an edge when given none', () => {
    expect(blinkStrength(5.01, 5, 2, 0)).toBe(1)
  })

  it('lights nothing for a degenerate wait or duration', () => {
    expect(blinkStrength(6, -1, 2, 0.4)).toBe(0)
    expect(blinkStrength(6, 5, 0, 0.4)).toBe(0)
    expect(blinkStrength(Number.NaN, 5, 2, 0.4)).toBe(0)
  })
})

describe('the idle blink', () => {
  const BLINKING = { ...OPTIONS, blink: { wait: 5, duration: 2, edge: 0.4, strength: 0.7 } }

  it('waits, lights the building on its own at the blink strength, then goes dark again', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.update(1)
    expect(light.value).toBe(0)
    highlight.update(5)
    expect(light.value).toBeCloseTo(0.7 * OPTIONS.intensity, 10)
    highlight.update(1.5)
    expect(light.value).toBe(0)
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

    highlight.update(6)
    expect(light.value).toBe(0)
  })

  it('stays dark while paused, blink after blink', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.setBlinking(false)
    highlight.update(0.5)
    expect(light.value).toBe(0)
    highlight.update(6)
    expect(light.value).toBe(0)
  })

  it('fades a blink under way when paused, rather than cutting it', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.update(5.8)
    highlight.setBlinking(false)
    highlight.update(0.1)
    expect(light.value).toBeGreaterThan(0)
    expect(light.value).toBeLessThan(0.7 * OPTIONS.intensity)
  })

  it('resumes at the start of the wait, and lights a full wait later', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const highlight = createBuildingHighlight([mesh], BLINKING)
    const light = compile(mesh.material as THREE.Material).uniforms.uHighlight

    highlight.setBlinking(false)
    highlight.update(2.5)
    highlight.setBlinking(true)
    highlight.update(0.2)
    expect(light.value).toBe(0)
    highlight.update(4.7)
    expect(light.value).toBe(0)
    highlight.update(1.1)
    expect(light.value).toBeCloseTo(0.7 * OPTIONS.intensity, 10)
  })
})

describe('idleLevel, what keeps time with the blink reads', () => {
  const BLINKING = { ...OPTIONS, blink: { wait: 5, duration: 2, edge: 0.4, strength: 0.7 } }
  const make = (options: BuildingHighlightOptions = BLINKING) =>
    createBuildingHighlight([new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())], options)

  it('is the blink, without the intensity', () => {
    const highlight = make()
    highlight.update(6)
    expect(highlight.idleLevel).toBeCloseTo(0.7, 10)
    highlight.update(1.5)
    expect(highlight.idleLevel).toBe(0)
  })

  it('ignores a hover, which is not the blink', () => {
    const highlight = make()
    highlight.setTarget(true)
    highlight.update(2)
    expect(highlight.idleLevel).toBe(0)
  })

  it('is 0 while paused and with the blink off', () => {
    const paused = make()
    paused.setBlinking(false)
    paused.update(10)
    paused.update(6)
    expect(paused.idleLevel).toBe(0)

    const off = make({ ...OPTIONS, blink: null })
    off.update(6)
    expect(off.idleLevel).toBe(0)
  })
})