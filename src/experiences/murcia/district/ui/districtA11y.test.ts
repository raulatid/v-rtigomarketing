// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DistrictA11y } from './districtA11y'

// The keyboard and screen-reader way through the services section. Its cases
// lived in the display district's interaction suite until that went (plan
// 024); what is pinned here is what a keyboard user can reach in each state,
// and what a screen reader is told.

function make() {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const events = {
    onEnter: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  }
  const a11y = new DistrictA11y(parent, 'Servicios', 'es', events)
  const buttons = () => [...parent.querySelectorAll<HTMLButtonElement>('button')]
  const visible = () => buttons().filter((b) => !b.hidden).map((b) => b.textContent)
  const live = () => parent.querySelector('.district-a11y-live')?.textContent ?? ''
  return { parent, a11y, events, buttons, visible, live }
}

let fixture: ReturnType<typeof make>

afterEach(() => {
  fixture.a11y.dispose()
  fixture.parent.remove()
})

const overview = { districtActive: false }
const intro = { districtActive: true }
const service = { districtActive: true }

describe('the services keyboard surface', () => {
  it('offers only the way in from the overview, and says nothing', () => {
    fixture = make()
    fixture.a11y.update(overview, null)
    expect(fixture.visible()).toEqual(['Servicios: explorar'])
    expect(fixture.live()).toBe('')
  })

  it('announces the intro once, without saying the label twice', () => {
    fixture = make()
    fixture.a11y.update(intro, { eyebrow: 'Servicios', title: '', summary: 'Lo que hacemos.' })
    expect(fixture.live()).toBe('Servicios. Lo que hacemos.')
    expect(fixture.visible()).toEqual(['Servicio anterior', 'Servicio siguiente', 'volver'])
  })

  it('announces a service with one full stop per part', () => {
    fixture = make()
    fixture.a11y.update(service, {
      eyebrow: 'Servicios · 01 / 05',
      title: 'SEO',
      summary: 'La búsqueda es el único canal que sigue devolviéndote el trabajo.',
    })
    expect(fixture.live()).toBe(
      'Servicios · 01 / 05. SEO. La búsqueda es el único canal que sigue devolviéndote el trabajo.',
    )
    expect(fixture.visible()).toEqual(['Servicio anterior', 'Servicio siguiente', 'volver'])
  })

  it('drives every intent from its buttons', () => {
    fixture = make()
    fixture.a11y.update(service, { eyebrow: 'e', title: 't', summary: 's' })
    for (const button of fixture.buttons()) button.click()
    const { events } = fixture
    for (const handler of Object.values(events)) expect(handler).toHaveBeenCalledTimes(1)
  })
})
