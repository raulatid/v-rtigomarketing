import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createHintParticles,
  HINT_ATTRIBUTE_NAMES,
  HINT_FRAGMENT,
  HINT_UNIFORM_NAMES,
  HINT_VERTEX,
} from './createHintParticles'

// The only Node-visible defence against a shader that dies quietly.
//
// There are two ways to break the link between GLSL and the JavaScript that
// feeds it, and BOTH are invisible to `tsc` and to every other test in this
// repo, because nothing here compiles a shader:
//
//   1. A uniform USED in GLSL but not DECLARED there. The program fails to
//      compile and the material draws nothing at all. This is not hypothetical:
//      `79a084a` added `uHover`/`uHoverGain` to a material's uniforms and to its
//      fragment body but not to its declarations, and every hologram in the
//      scene — halo, emitter, and the brand artwork — went blank. It surfaced as
//      "the logos are gone" and took a commit to find.
//
//   2. A uniform DECLARED in the JavaScript object but never used in GLSL. The
//      compiler strips it, `getUniformLocation` returns null, and three silently
//      skips every write. A single typo — `uOpactiy` — becomes a value that
//      never arrives, with no error anywhere at all.
//
// So this asserts the two identifier sets match IN BOTH DIRECTIONS. It is not a
// compiler and it cannot prove the shader links; the e2e pixel assertion is the
// only tier that can. It catches the two mistakes that are actually made.

/** GLSL identifiers are matched on source with comments removed — a name in a
 *  comment is documentation, not a use, and counting it would hide a real gap. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function identifiers(source: string, pattern: RegExp): Set<string> {
  return new Set(stripComments(source).match(pattern) ?? [])
}

const UNIFORM_USE = /\bu[A-Z]\w*/g
const ATTRIBUTE_DECL = /attribute\s+\w+\s+(a\w+)/g

const usedUniforms = new Set([
  ...identifiers(HINT_VERTEX, UNIFORM_USE),
  ...identifiers(HINT_FRAGMENT, UNIFORM_USE),
])

function declaredAttributes(source: string): Set<string> {
  const found = new Set<string>()
  for (const match of stripComments(source).matchAll(ATTRIBUTE_DECL)) found.add(match[1]!)
  return found
}

describe('the hint shader', () => {
  it('declares every uniform it uses', () => {
    // Direction 1: the compile-time death. Anything the GLSL reads must be in
    // the list the material is built from.
    const missing = [...usedUniforms].filter((name) => !HINT_UNIFORM_NAMES.includes(name as never))
    expect(missing, 'used in GLSL but absent from HINT_UNIFORM_NAMES').toEqual([])
  })

  it('uses every uniform it declares', () => {
    // Direction 2: the silent one. A declared uniform nothing reads is either
    // dead weight or, far more likely, a name that was misspelt on one side.
    const unused = HINT_UNIFORM_NAMES.filter((name) => !usedUniforms.has(name))
    expect(unused, 'declared but never read by the GLSL').toEqual([])
  })

  it('feeds the material exactly the uniforms the shader asks for', () => {
    // The list above is only useful if it is the list the material is actually
    // built from. Read off the constructed object rather than trusted.
    const hint = createHintParticles()
    const material = hint.object.material as THREE.ShaderMaterial
    expect(Object.keys(material.uniforms).sort()).toEqual([...HINT_UNIFORM_NAMES].sort())
    hint.dispose()
  })

  it('sets every attribute the vertex shader declares', () => {
    const declared = declaredAttributes(HINT_VERTEX)
    expect([...declared].sort()).toEqual([...HINT_ATTRIBUTE_NAMES].sort())

    const hint = createHintParticles()
    const attributes = hint.object.geometry.attributes
    for (const name of HINT_ATTRIBUTE_NAMES) expect(attributes[name], name).toBeDefined()
    // three supplies this one and the draw call has no vertex count without it,
    // even though nothing ever reads it.
    expect(attributes.position).toBeDefined()
    hint.dispose()
  })

  it('closes the fragment shader with the colour-space conversion', () => {
    // A raw ShaderMaterial gets no output conversion appended, and the omission
    // fails as "looks a bit dark" rather than as an error — which is why every
    // hand-written fragment in this repo ends the same way.
    expect(HINT_FRAGMENT).toContain('#include <colorspace_fragment>')
  })

  it('never reads the model-view matrix, because it is locked to the camera', () => {
    // The whole placement argument rests on this: the figure is built in view
    // space from the projection alone. A modelViewMatrix creeping in would make
    // the hint drift with the scene graph and nothing would fail loudly.
    expect(stripComments(HINT_VERTEX)).not.toContain('modelViewMatrix')
    expect(stripComments(HINT_VERTEX)).toContain('projectionMatrix')
  })
})

describe('the hint material', () => {
  it('blends normally, so overlapping dots cannot sum past the bloom knee', () => {
    // Additive is right for the hover cue and wrong here: ~600 sprites at ~3px
    // spacing overlap along the stems, which is exactly the ink that carries the
    // letterforms. See createHintParticles' header, departure 2.
    const hint = createHintParticles()
    const material = hint.object.material as THREE.ShaderMaterial
    expect(material.blending).toBe(THREE.NormalBlending)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    hint.dispose()
  })

  it('draws nothing until a figure has been sampled', () => {
    // A hint that failed to rasterize must read as absent. Points left at the
    // origin would draw a bright knot in the middle of the frame instead.
    const hint = createHintParticles()
    expect(hint.object.geometry.drawRange.count).toBe(0)
    hint.dispose()
  })

  it('starts invisible and un-culled', () => {
    const hint = createHintParticles()
    expect(hint.object.visible).toBe(false)
    // The dummy position attribute is all zeros, so the computed bounding sphere
    // is a point at the origin — which for a view-space figure is off screen
    // most of the time, and culling would take the whole hint with it.
    expect(hint.object.frustumCulled).toBe(false)
    hint.dispose()
  })

  it('keeps the phase inside 0..1 whatever it is handed', () => {
    const hint = createHintParticles()
    const material = hint.object.material as THREE.ShaderMaterial
    hint.setPhase(4, -2)
    expect(material.uniforms.uProgress!.value).toBe(1)
    expect(material.uniforms.uExit!.value).toBe(0)
    hint.setPhase(Number.NaN, Number.NaN)
    expect(material.uniforms.uProgress!.value).toBe(0)
    hint.dispose()
  })
})
