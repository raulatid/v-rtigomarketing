import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'
import { CaseChart } from './CaseChart'
import { attachSheetDrag } from '../interaction/sheetDrag'
import { caseSheetLayout } from '../interaction/caseSheetLayout'
import { CASE_PANEL_DOCK_MIN_WIDTH, CASE_PANEL_DOCK_MIN_HEIGHT } from '../experiences/earth/camera/closeUpFraming'

interface Props {
  data: SatelliteDef | null
  onClose: () => void
  /** Live client-space bottom edge of the selected satellite's brand plate. */
  getLogoBottom?: (id: string) => number | null
  /**
   * Opens the audit from the foot of the case. Optional so a panel with no
   * audit behind it renders no dead link. Opening the audit deselects the case
   * (App's `handleAuditOpenChange`), so this panel closes on its own.
   */
  onRequestAudit?: () => void
}

/** Which of the mobile sheet's two heights is showing. Inert on desktop. */
type SheetStop = 'peek' | 'expanded'

// "Caso de éxito" panel, shown while a satellite is focused.
//
// ONE COMPONENT, TWO LAYOUTS. The sheet shares its drag controller with the
// services campus; each panel owns its own sizing and presentation.
//
// On desktop it docks to the right, and that composition is a contract with the
// camera: the close-up pushes the satellite LEFT of centre precisely to clear
// this column. Change the panel's width and that offset needs revisiting — it
// is solved per viewport in `experiences/earth/camera/closeUpFraming.ts`.
//
// On a narrow OR SHORT viewport it is a bottom sheet with two stops, and the
// lateral offset goes to zero with it. The two are one decision; the breakpoint
// is written in both places and they must move together.
//
// The stops exist because a single-stop sheet covered the thing it was
// describing. At 60dvh anchored to the bottom, its top edge sat at 40% of the
// screen while the close-up centres the satellite at 50% — so tapping a
// satellite hid it behind a panel about it, and 28-38% of the case sat behind a
// scroll with nothing to indicate there was one. Peek shows the headline and
// leaves the satellite in frame; expanded is for reading.
//
// Kept mounted and toggled by class so it can transition in and out. The source
// project pops it with display:block and its own notes call a transition "an
// easy upgrade" — this is that upgrade.
export function CasePanel({ data, onClose, onRequestAudit, getLogoBottom }: Props) {
  // `data` goes null the instant a case is deselected, but the panel takes its
  // CSS fade to leave. Rendering from `data` directly emptied every field on
  // the first frame of the exit, so the fade animated a blank shell — which is
  // exactly what read as an "instant" close. Keep showing the LAST case while
  // fading out; `data` itself still drives visibility and interactivity.
  const lastDataRef = useRef<SatelliteDef | null>(null)
  if (data) lastDataRef.current = data
  const shown = data ?? lastDataRef.current
  const meta = shown ? [shown.sector, shown.location, shown.year].filter((part) => part.trim() !== '').join(' · ') : ''

  // Open at the largest height that leaves the logo visible. Both dragging
  // and clicking use this same live ceiling; peek offers more scene space.
  const [stop, setStop] = useState<SheetStop>('expanded')
  const panelRef = useRef<HTMLElement>(null)
  const gripRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // Every new selection re-opens at the expanded stop, so a case the viewer
  // lowered does not leave the NEXT one opening half-shut — the opening height
  // is a property of opening a case, not something inherited from the last one.
  //
  // Keyed on the case id rather than on `data` being truthy: re-selecting while
  // one is already open is a new case and should re-open, and the deselect that
  // sets `data` to null must NOT reset, or the sheet jumps stop mid-fade.
  const selectedId = data?.id ?? null
  useLayoutEffect(() => {
    if (selectedId) setStop('expanded')
  }, [selectedId])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const grip = gripRef.current
    const header = headerRef.current
    if (!selectedId || !panel || !grip || !header) return
    const dock = window.matchMedia(`(min-width: ${CASE_PANEL_DOCK_MIN_WIDTH}px) and (min-height: ${CASE_PANEL_DOCK_MIN_HEIGHT}px)`)
    let expanded = true
    let limits = { maximum: 0, compact: 0 }
    const measure = () => {
      if (dock.matches) return
      const viewport = window.visualViewport
      const top = viewport?.offsetTop ?? 0
      const height = viewport?.height ?? window.innerHeight
      limits = caseSheetLayout(top, height, getLogoBottom?.(selectedId) ?? null)
      // Read layout before writing CSS variables, avoiding a second layout pass.
      const controls = grip.offsetHeight + header.offsetHeight +
        (parseFloat(getComputedStyle(panel).paddingBottom) || 0)
      const write = (name: string, value: number) => {
        const css = `${value}px`
        if (panel.style.getPropertyValue(name) !== css) panel.style.setProperty(name, css)
      }
      write('--case-sheet-maximum', limits.maximum)
      write('--case-sheet-compact', limits.compact)
      write('--case-sheet-bottom', Math.max(0, window.innerHeight - top - height))
      // During approach the logo can still be near the viewport's lower edge.
      // Wait for room for the controls rather than covering it with a minimum height.
      panel.toggleAttribute('data-sheet-waiting', limits.maximum < controls || limits.maximum === 0)
    }
    measure()
    // Follow the actual camera and billboard animation without React updates.
    let frame = 0
    const tick = () => { measure(); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    const drag = attachSheetDrag({
      grip,
      surfaces: [header],
      enabled: () => !dock.matches && limits.maximum > 0 && !panel.hasAttribute('data-sheet-waiting'),
      expanded: () => expanded,
      setExpanded(value) { expanded = value; setStop(value ? 'expanded' : 'peek') },
      position: () => Math.max(0, limits.maximum - panel.getBoundingClientRect().height),
      limit: () => limits.maximum - limits.compact,
      render(position) {
        if (position === null) {
          panel.removeAttribute('data-sheet-dragging')
          panel.style.removeProperty('height')
        } else {
          panel.dataset.sheetDragging = 'true'
          panel.style.height = `${Math.max(limits.compact, Math.min(limits.maximum, limits.maximum - position))}px`
        }
      },
    })
    const reset = () => { drag.reset(); measure() }
    dock.addEventListener('change', reset)
    window.visualViewport?.addEventListener('resize', reset)
    window.visualViewport?.addEventListener('scroll', reset)
    return () => {
      cancelAnimationFrame(frame)
      dock.removeEventListener('change', reset)
      window.visualViewport?.removeEventListener('resize', reset)
      window.visualViewport?.removeEventListener('scroll', reset)
      drag.dispose()
    }
  }, [selectedId, getLogoBottom])

  return (
    <aside
      ref={panelRef}
      className={`case-panel${data ? ' is-visible' : ''}`}
      data-stop={stop}
      aria-hidden={!data}
      role="complementary"
      // The case's own brand colour (Sanity `brandColor`, the same one the
      // holo panel paints with) drives every accent below — metric-card top
      // edge, list bullets, chart marks — through one custom property. Read
      // from `shown`, not `data`, so the exit fade keeps its colour too.
      // A brand with no colour arrives as #ffffff from the content build.
      style={shown ? ({ '--case-brand': shown.brandColor } as CSSProperties) : undefined}
    >
      {/* The sheet's grip. Present in the DOM at every size and hidden by CSS
          above the breakpoint, exactly as Murcia's is: it belongs to a layout,
          not to a device, and a JS media query here would be a second source of
          truth for a breakpoint the stylesheet already owns. */}
      <button
        ref={gripRef}
        className="case-panel__handle"
        type="button"
        aria-label="Desplegar o plegar el panel"
        aria-expanded={stop === 'expanded'}
        tabIndex={data ? 0 : -1}
      />

      <div ref={headerRef} className="case-panel__header">
        <span className="case-panel__eyebrow">Caso de éxito</span>
        <button
          className="case-panel__close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          tabIndex={data ? 0 : -1}
        >
          ✕
        </button>
      </div>

      {/* Everything below the header scrolls; the handle and the header do not.
          A sheet whose close button scrolls away is a sheet you cannot dismiss
          without first scrolling back up. */}
      <div className="case-panel__body">
        <h2 className="case-panel__title">{shown?.name ?? ''}</h2>

        {/* All content renders from `shown` (the last selected case), never from
          `data` — that is what lets the exit fade play over the panel's final
          contents instead of over emptied fields. */}
        {/* Sector, location and year are each editorial: the line joins the
            ones the case says, and is left out when it says none. The
            placeholders below keep the panel's height before the first case;
            once a case is shown, its own absences drive the layout. */}
        {(!shown || meta) && <p className="case-panel__meta">{meta}</p>}

        {(!shown || shown.metrics.length > 0) && (
          <div className="case-panel__metrics">
            {(
              shown?.metrics ?? [
                { label: 'Métrica', value: '—' },
                { label: 'Métrica', value: '—' },
              ]
            ).map((metric, i) => (
              <div className="case-panel__metric" key={i}>
                <div className="case-panel__metric-label">{metric.label}</div>
                <div className="case-panel__metric-value">{metric.value}</div>
              </div>
            ))}
          </div>
        )}

        <p className="case-panel__description">{shown?.summary ?? ''}</p>

        <ul className="case-panel__details">
          {(shown?.details ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        {/* The graph area keeps a fixed height whether or not a case is selected,
          so the panel's height doesn't jump during the fade. A case with
          nothing to plot has no block at all rather than an empty frame. */}
        {(!shown || shown.chart) && (
          <div className="case-panel__graph">{shown?.chart ? <CaseChart chart={shown.chart} /> : null}</div>
        )}

        {/* The case's next step. The proof used to end at its chart, so the one
            ask on the site was never one step from the evidence for it. Text,
            not a second button: the blue belongs to the Auditoría box alone
            (DESIGN.md, the Spent-Once rule), and this is its quiet doorway. */}
        {onRequestAudit && (
          <button
            className="case-panel__next"
            type="button"
            onClick={onRequestAudit}
            tabIndex={data ? 0 : -1}
          >
            <span className="case-panel__next-lead">¿Un reto parecido?</span>{' '}
            <span className="case-panel__next-action">
              Solicita la auditoría{' '}
              <span className="case-panel__next-arrow" aria-hidden="true">
                →
              </span>
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}
