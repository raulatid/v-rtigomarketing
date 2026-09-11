import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { attachTowerScreen, SCREEN_NODE_NAME, selectScreenUv, uvAttributeName } from './attachTowerScreen'

// The screen's failure path, which is the one the city depends on: a tower
// with no screen must still load, stand in its colours, and say why it is dark.
// The lit path needs a 2D canvas and a GPU, and is verified by looking at it.

function tower(screen?: THREE.Mesh): THREE.Group {
  const root = new THREE.Group()
  const stone = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  stone.name = 'ARCH_Stone_Limestone'
  root.add(stone)
  if (screen) root.add(screen)
  return root
}

const options = { anisotropy: 1, reducedMotion: false }

describe('the tower screen', () => {
  it('stays dark and says so when the model has no screen, but still colours the tower', async () => {
    const root = tower()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const screen = attachTowerScreen(root, options)

    expect(screen.facade).toBeNull()
    expect(screen.carousel).toBeNull()
    expect(screen.compositionIds).toEqual([])
    await expect(screen.ready).resolves.toBe(false)
    expect(() => {
      screen.update(0.016)
      screen.dispose()
    }).not.toThrow()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(SCREEN_NODE_NAME)
    const stone = root.getObjectByName('ARCH_Stone_Limestone') as THREE.Mesh
    expect((stone.material as THREE.Material).name).toBe('MAT_ARCH_Stone_Limestone')
    warn.mockRestore()
  })

  it('refuses a screen mesh without UVs, since the compositions ride them', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    const flat = new THREE.Mesh(geometry)
    flat.name = SCREEN_NODE_NAME
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(attachTowerScreen(tower(flat), options).facade).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('looks for the screen under the name its host configures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    attachTowerScreen(tower(), { ...options, screenNodeName: 'Pantalla' })
    expect(String(warn.mock.calls[0]?.[0])).toContain('Pantalla')
    warn.mockRestore()
  })

  it('refuses a screen that lacks the UV set its host names, and says which', () => {
    // murcia-v7 exports the trim-band UV first and the screen's second; a
    // config pointing at set 1 must not silently fall back to the band.
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2))
    const bandOnly = new THREE.Mesh(geometry)
    bandOnly.name = SCREEN_NODE_NAME
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(attachTowerScreen(tower(bandOnly), { ...options, screenUvChannel: 1 }).facade).toBeNull()
    expect(String(warn.mock.calls[0]?.[0])).toContain('uv1')
    warn.mockRestore()
  })
})

describe('selecting the screen UV set', () => {
  it('names the attributes the way GLTFLoader does', () => {
    expect(uvAttributeName(0)).toBe('uv')
    expect(uvAttributeName(1)).toBe('uv1')
  })

  it('moves the named set into `uv` and drops the band that sat there', () => {
    const geometry = new THREE.BufferGeometry()
    const band = new THREE.BufferAttribute(new Float32Array([0.04, 0.82, 0.96, 0.82, 0.5, 0.87]), 2)
    const screen = new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2)
    geometry.setAttribute('uv', band)
    geometry.setAttribute('uv1', screen)
    const mesh = new THREE.Mesh(geometry)

    selectScreenUv(mesh, 1)

    expect(mesh.geometry.getAttribute('uv')).toBe(screen)
    expect(mesh.geometry.getAttribute('uv1')).toBeUndefined()
  })

  it('leaves set 0 alone', () => {
    const geometry = new THREE.BufferGeometry()
    const uv = new THREE.BufferAttribute(new Float32Array(6), 2)
    geometry.setAttribute('uv', uv)
    const mesh = new THREE.Mesh(geometry)
    selectScreenUv(mesh, 0)
    expect(mesh.geometry.getAttribute('uv')).toBe(uv)
  })
})
