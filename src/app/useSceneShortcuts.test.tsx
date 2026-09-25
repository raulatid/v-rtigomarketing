// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSceneShortcuts, type SceneShortcutCity, type SceneShortcuts } from './useSceneShortcuts'
import type { ExperienceId } from './experience'
import type { HeaderMenuState } from '../corner-logo/headerMenuTiming'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Props {
  activeExperience: ExperienceId
  menuState: HeaderMenuState
}

function setup(initial: Props, options: { flies?: boolean; warps?: boolean } = {}) {
  const city: SceneShortcutCity = {
    flyToBlog: vi.fn(() => options.flies ?? true),
    requestBlog: vi.fn(),
    requestServices: vi.fn(),
  }
  const murciaRef = { current: city }
  const navigateTo = vi.fn((_: ExperienceId) => options.warps ?? true)
  const openBlogIndex = vi.fn()
  let api!: SceneShortcuts

  function Probe(props: Props) {
    api = useSceneShortcuts({ ...props, murciaRef, navigateTo, openBlogIndex })
    return null
  }

  const container = document.createElement('div')
  const root: Root = createRoot(container)
  const render = (props: Props) => act(() => root.render(<Probe {...props} />))
  render(initial)
  roots.push(root)
  return {
    city,
    navigateTo,
    openBlogIndex,
    render,
    request: (shortcut: 'blog' | 'services') => act(() => api.request(shortcut)),
    settled: () => act(() => api.onWarpSettled()),
  }
}

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
})

describe('a press waits for the menu to close', () => {
  it('does nothing while the menu is folding, and acts once it is closed', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closing' })
    t.request('blog')
    expect(t.navigateTo).not.toHaveBeenCalled()
    t.render({ activeExperience: 'earth', menuState: 'closed' })
    expect(t.navigateTo).toHaveBeenCalledTimes(1)
  })

  it('acts at once where there is no menu to wait for', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closed' })
    t.request('blog')
    expect(t.navigateTo).toHaveBeenCalledTimes(1)
  })

  it('acts once, not again on the next render', () => {
    const t = setup({ activeExperience: 'murcia', menuState: 'closed' })
    t.request('services')
    t.render({ activeExperience: 'murcia', menuState: 'closed' })
    expect(t.city.requestServices).toHaveBeenCalledTimes(1)
  })
})

describe('Blog', () => {
  it('warps from Earth, and asks for the flight to the panel when the warp settles', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closed' })
    t.request('blog')
    expect(t.navigateTo).toHaveBeenCalledWith('murcia')
    expect(t.city.requestBlog).not.toHaveBeenCalled()
    t.settled()
    expect(t.city.requestBlog).toHaveBeenCalledTimes(1)
    expect(t.city.requestServices).not.toHaveBeenCalled()
    // Never over Earth: the opening is the flight's, at the end of its approach.
    expect(t.openBlogIndex).not.toHaveBeenCalled()
    t.settled()
    expect(t.city.requestBlog).toHaveBeenCalledTimes(1)
  })

  it('does nothing from Earth when the warp is refused', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closed' }, { warps: false })
    t.request('blog')
    t.settled()
    expect(t.city.requestBlog).not.toHaveBeenCalled()
    expect(t.openBlogIndex).not.toHaveBeenCalled()
  })

  it('flies to the panel in the city, and leaves the opening to the flight', () => {
    const t = setup({ activeExperience: 'murcia', menuState: 'closed' })
    t.request('blog')
    expect(t.city.flyToBlog).toHaveBeenCalledTimes(1)
    expect(t.openBlogIndex).not.toHaveBeenCalled()
  })

  it('still opens the blog when the city refuses the flight', () => {
    const t = setup({ activeExperience: 'murcia', menuState: 'closed' }, { flies: false })
    t.request('blog')
    expect(t.openBlogIndex).toHaveBeenCalledTimes(1)
  })
})

describe('Servicios', () => {
  it('asks the city for the campus when already there', () => {
    const t = setup({ activeExperience: 'murcia', menuState: 'closed' })
    t.request('services')
    expect(t.navigateTo).not.toHaveBeenCalled()
    expect(t.city.requestServices).toHaveBeenCalledTimes(1)
  })

  it('warps from Earth, and asks for the campus when the warp settles', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closed' })
    t.request('services')
    expect(t.navigateTo).toHaveBeenCalledWith('murcia')
    expect(t.city.requestServices).not.toHaveBeenCalled()
    t.settled()
    expect(t.city.requestServices).toHaveBeenCalledTimes(1)
    // Only that arrival: a later warp is not one the button asked for.
    t.settled()
    expect(t.city.requestServices).toHaveBeenCalledTimes(1)
  })

  it('leaves nothing waiting when the warp is refused', () => {
    const t = setup({ activeExperience: 'earth', menuState: 'closed' }, { warps: false })
    t.request('services')
    t.settled()
    expect(t.city.requestServices).not.toHaveBeenCalled()
  })
})
