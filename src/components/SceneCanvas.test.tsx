// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameSettings } from '../graphics/renderableExperience'
import { createNavigationState } from '../app/navigation/continuousState'
import { createSequenceState } from '../experiences/earth/config/sequenceState'
import { defaultIntroConfig } from '../experiences/earth/config/introConfig'
import { SceneCanvas } from './SceneCanvas'

const pipeline = vi.hoisted(() => ({ read: null as (() => FrameSettings) | null, reduced: false }))
// Exercise the application's real settings callback without creating a WebGL renderer.
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactNode }) => children, useFrame: () => {} }))
vi.mock('../experiences/earth/EarthExperience', () => ({ EarthExperience: () => null }))
vi.mock('../corner-logo/CornerLogoLayer', () => ({ CornerLogoLayer: () => null }))
vi.mock('../experiences/murcia/MurciaLayer', () => ({ MurciaLayer: () => null }))
vi.mock('../experiences/murcia/hint/MurciaHintLayer', () => ({ MurciaHintLayer: () => null }))
vi.mock('../platform/motionPreference', () => ({ prefersReducedMotion: () => pipeline.reduced }))
vi.mock('../graphics/RenderPipeline', () => ({
  RenderPipeline: ({ readSettings }: { readSettings: () => FrameSettings }) => {
    pipeline.read = readSettings
    return null
  },
}))

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  pipeline.read = null
  pipeline.reduced = false
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const navigation = createNavigationState()
  const noop = () => {}
  const props: ComponentProps<typeof SceneCanvas> = {
    config: defaultIntroConfig(), state: createSequenceState(), navigation,
    activeExperience: 'murcia', suspended: false,
    auditView: { open: false, reducedMotion: false },
    attention: { hintAllowed: false }, murciaAttention: { hintAllowed: false },
    overlayEl: { current: null }, orbitSystemRef: { current: null },
    interactionRef: { current: null }, logoRef: { current: null },
    cornerLogoHandleRef: { current: null }, murciaRef: { current: null },
    stepTransition: noop, onSelectCase: noop, onDeselectCase: noop,
    onLogoLoadFailed: noop, onMurciaReady: noop, onMurciaAttentionChange: noop,
    onOpenBlog: () => false, onBlogApproachStart: noop, onContextLost: noop,
  }
  const render = () => act(() => root!.render(<SceneCanvas {...props} />))
  render()
  return { navigation, props, render, read: () => pipeline.read!() }
}

describe('departure post-processing wiring', () => {
  it('starts only after commit, composes before blur, and clears at the cut', () => {
    const t = setup()
    t.navigation.zoomDepth = 1
    expect(t.read().vacuum).toBe(0)
    expect(t.read().route).toBe('direct')
    t.navigation.transitionCommitted = true
    expect(t.read().vacuum).toBe(0)
    t.navigation.transitionProgress = 0.01
    const departing = t.read()
    expect(departing.vacuum).toBeGreaterThan(0)
    expect(departing.motionBlur).toBe(0)
    expect(departing.route).toBe('direct-composited')
    expect(departing.bloomStrength).toBe(0)
    t.navigation.transitionProgress = 0.33
    expect(t.read().vacuum).toBeCloseTo(1)
    t.props.activeExperience = 'earth'
    t.navigation.transitionProgress = 0.5
    t.render()
    expect(t.read()).toMatchObject({ vacuum: 0, resetAccumulation: true })
    expect(t.read().resetAccumulation).toBe(false)
    t.navigation.transitionCommitted = false
    t.navigation.transitionProgress = 0
    expect(t.read().vacuum).toBe(0)
  })

  it('keeps the vacuum off on Earth and on arrival in Murcia while sharing blur', () => {
    const t = setup()
    t.props.activeExperience = 'earth'
    t.navigation.transitionCommitted = true
    t.navigation.transitionProgress = 0.3
    t.render()
    expect(t.read().vacuum).toBe(0)
    expect(t.read().motionBlur).toBeGreaterThan(0)
    t.props.activeExperience = 'murcia'
    t.navigation.transitionProgress = 0.6
    t.render()
    expect(t.read()).toMatchObject({ vacuum: 0, resetAccumulation: true })
    expect(t.read().motionBlur).toBeGreaterThan(0)
  })

  it('holds the vacuum at zero throughout reduced-motion departure', () => {
    pipeline.reduced = true
    const t = setup()
    t.navigation.transitionCommitted = true
    for (const p of [0, 0.01, 0.2, 0.33, 0.49, 0.5, 1]) {
      t.navigation.transitionProgress = p
      expect(t.read().vacuum).toBe(0)
    }
  })
})
