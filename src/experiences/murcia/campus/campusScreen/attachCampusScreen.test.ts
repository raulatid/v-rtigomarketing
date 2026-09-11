import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { attachCampusScreen, SCREEN_NODE_NAME } from './attachCampusScreen'
import { CAMPUS_SCREEN_NODE_NAME } from '../campusConfig'

// The strip's failure path, which is the one the city depends on: a campus
// with no screen must still load and say why it is dark. The lit path needs a
// 2D canvas and a GPU, and is verified by looking at it — the same split as
// `landmark/towerScreen/attachTowerScreen.test.ts`.

const options = { anisotropy: 1, reducedMotion: false }

describe('the campus screen', () => {
  it('looks for the node the campus config names', () => {
    expect(SCREEN_NODE_NAME).toBe(CAMPUS_SCREEN_NODE_NAME)
  })

  it('stays dark and says so when the model has no strip', async () => {
    const root = new THREE.Group()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const screen = attachCampusScreen(root, options)

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
    warn.mockRestore()
  })

  it('refuses a strip without UVs, since the word rides them', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    const flat = new THREE.Mesh(geometry)
    flat.name = SCREEN_NODE_NAME
    const root = new THREE.Group()
    root.add(flat)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(attachCampusScreen(root, options).facade).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
