import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createRioWater } from './createRioWater'
import { DEFAULT_RIO_WATER_CONFIG } from './rioWaterConfig'

// The material's construction-time contract, asserted without a GPU.
//
// The failure this prevents is not a wrong pixel, it is a stutter. Murcia's
// `warm()` calls `renderer.compileAsync`, which compiles the program from the
// uniforms present at that moment. A uniform the shader declares but the
// material does not supply is added the first time something writes it — which
// invalidates the program and moves a shader compile onto the warp cut, where
// it is a visible hitch and nothing reports it.

/** Uniform names a `.glsl` source declares, arrays included. */
function declaredUniforms(source: string): string[] {
  return [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/gm)].map(
    (match) => match[1]!,
  )
}

describe('createRioWater', () => {
  const water = createRioWater(DEFAULT_RIO_WATER_CONFIG)

  it('fits all forty banks of the selected export and matches the shader capacity', () => {
    const segments = new Float32Array(40 * 6)
    for (let i = 0; i < segments.length; i++) segments[i] = i / 10
    water.setBankSegments(segments, new THREE.Matrix4())
    expect(water.material.uniforms.uBankSegmentCount!.value).toBe(40)
    const capacity = Number(water.material.fragmentShader.match(/#define MAX_BANK_SEGMENTS (\d+)/)?.[1])
    expect(water.material.uniforms.uBankSegments!.value).toHaveLength(capacity)
    expect(capacity).toBeGreaterThanOrEqual(40)
  })

  it('supplies every uniform the shaders declare', () => {
    const declared = [
      ...declaredUniforms(water.material.vertexShader),
      ...declaredUniforms(water.material.fragmentShader),
    ]

    // Sanity: the regex has to actually find them, or this test passes by
    // matching nothing.
    expect(declared.length).toBeGreaterThan(15)

    for (const name of declared) {
      expect(water.material.uniforms, `${name} is declared but never supplied`).toHaveProperty(name)
    }
  })

  it('declares no uniform the shaders do not use', () => {
    // Includes expanded: three's chunks declare the fog uniforms the material
    // has to carry once `fog: true` meets a Scene with fog.
    const expand = (source: string) =>
      source.replace(/#include <(\w+)>/g, (_, chunk: string) => THREE.ShaderChunk[chunk as keyof typeof THREE.ShaderChunk] ?? '')
    const declared = new Set([
      ...declaredUniforms(expand(water.material.vertexShader)),
      ...declaredUniforms(expand(water.material.fragmentShader)),
    ])

    // The other direction, which is what caught the sandbox's debug uniform on
    // the way in: a uniform left in `uniforms` after its shader code is gone is
    // invisible, since three simply never binds it.
    for (const name of Object.keys(water.material.uniforms)) {
      expect(declared, `${name} is supplied but no shader declares it`).toContain(name)
    }
  })

  it('converts the authored sRGB colours into the linear space the shader works in', () => {
    // Hex in config is authored for sRGB, like every other colour in this repo.
    // Assigning it raw would leave the water reading noticeably brighter and
    // flatter than the value that was tuned — a wrong picture, not an error.
    const deep = water.material.uniforms['uDeepColor']!.value as THREE.Color
    const expected = new THREE.Color().setHex(
      DEFAULT_RIO_WATER_CONFIG.deepColor,
      THREE.SRGBColorSpace,
    )

    expect(deep.r).toBeCloseTo(expected.r, 6)
    expect(deep.g).toBeCloseTo(expected.g, 6)
    expect(deep.b).toBeCloseTo(expected.b, 6)
    expect(deep.getHex(THREE.SRGBColorSpace)).toBe(DEFAULT_RIO_WATER_CONFIG.deepColor)
  })

  it('is seen in white light until it is given another, and takes it as given', () => {
    // A copy, not the caller's object: the host reuses its scratch colour.
    const fresh = createRioWater(DEFAULT_RIO_WATER_CONFIG)
    const light = fresh.material.uniforms['uLight']!.value as THREE.Color
    expect(light.toArray()).toEqual([1, 1, 1])
    const night = new THREE.Color(0.07, 0.1, 0.17)
    fresh.setLight(night)
    night.setRGB(1, 0, 0)
    expect(light.toArray()).toEqual([0.07, 0.1, 0.17])
  })

  it('follows the channel only when asked, and signs it from flowReversed', () => {
    // The define is part of the program: the river and the lake are two
    // materials, so each compiles once, at warm, in its own variant.
    expect(water.material.defines).not.toHaveProperty('USE_RIVER_CHANNEL')
    const river = createRioWater(DEFAULT_RIO_WATER_CONFIG, { followChannel: true })
    expect(river.material.defines).toHaveProperty('USE_RIVER_CHANNEL')
    expect(river.material.vertexShader).toMatch(/attribute vec2 riverCoord;/)
    expect(river.material.vertexShader).toMatch(/attribute vec2 riverTangent;/)

    // The channel coordinates carry no sign of their own; reversing the flow
    // has to reach them, not just the fallback axis.
    river.setFlowAxis({ x: 1, z: 0 }, new THREE.Matrix4(), true)
    expect(river.material.uniforms['uFlowSign']!.value).toBe(-1)
    river.setFlowAxis({ x: 1, z: 0 }, new THREE.Matrix4(), false)
    expect(river.material.uniforms['uFlowSign']!.value).toBe(1)
    river.dispose()
  })

  it('advances uTime from the elapsed seconds it is given', () => {
    // The trap this module's own doc comment warns about: `MurciaExperience.update`
    // receives a delta, and passing it straight through pins uTime near 1/60 —
    // a river frozen mid-ripple that still renders as convincing water.
    water.update(12.5)
    expect(water.material.uniforms['uTime']!.value).toBe(12.5)
  })
})
