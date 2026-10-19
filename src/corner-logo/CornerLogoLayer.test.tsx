// @vitest-environment jsdom
import { act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CornerLogo } from './createCornerLogo'
import type { CornerLogoConfig } from './cornerLogoConfig'
import { CornerLogoLayer } from './CornerLogoLayer'

const three = vi.hoisted(() => ({ size: { width: 800, height: 600 } }))
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (s: { gl: object; size: { width: number; height: number } }) => unknown) =>
    select({ gl: {}, size: three.size }),
}))
const logo = vi.hoisted(() => ({
  setSize: vi.fn(),
  setCornerMetrics: vi.fn(),
  startSequence: vi.fn(),
  isReady: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('./createCornerLogo', () => ({ createCornerLogo: () => logo }))

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// The size effect runs at mount, while the logo is still a dynamic import away.
// The logo must still get the surface size the moment it exists, or its motion
// falls back to reading `window.innerHeight` every frame.
it('hands the new logo the canvas size without waiting for a resize', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const logoRef: RefObject<CornerLogo | null> = { current: null }
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <CornerLogoLayer
        config={{} as CornerLogoConfig}
        onLoadFailed={() => {}}
        logoRef={logoRef}
        handleRef={{ current: null }}
      />,
    )
  })
  await vi.waitFor(() => expect(logoRef.current).toBe(logo))
  expect(logo.setSize).toHaveBeenCalledWith(800, 600)
})
