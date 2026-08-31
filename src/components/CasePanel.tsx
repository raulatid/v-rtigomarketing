import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'
import { CaseChart } from './CaseChart'

interface Props {
  data: SatelliteDef | null
  onClose: () => void
}

/** Which of the mobile sheet's two heights is showing. Inert on desktop. */
type SheetStop = 'peek' | 'expanded'

// "Caso de éxito" panel, shown while a satellite is focused.
//
// ONE COMPONENT, TWO LAYOUTS. Murcia's district panel made the same split for
// the same reason; it was retired on 2026-08-31 when that district moved to a
// projected in-world display, so this is now the only implementation of the
// sheet below rather than a copy of one.
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
export function CasePanel({ data, onClose }: Props) {
  // `data` goes null the instant a case is deselected, but the panel takes its
  // CSS fade to leave. Rendering from `data` directly emptied every field on
  // the first frame of the exit, so the fade animated a blank shell — which is
  // exactly what read as an "instant" close. Keep showing the LAST case while
  // fading out; `data` itself still drives visibility and interactivity.
  const lastDataRef = useRef<SatelliteDef | null>(null)
  if (data) lastDataRef.current = data
  const shown = data ?? lastDataRef.current

  const [stop, setStop] = useState<SheetStop>('peek')

  // Every new selection starts at the peek stop. Carrying the previous stop
  // over means the next case opens already expanded, with the satellite the
  // viewer just tapped hidden behind it.
  //
  // Keyed on the case id rather than on `data` being truthy: re-selecting while
  // one is already open is a new case and should re-peek, and the deselect that
  // sets `data` to null must NOT reset, or the sheet drops to peek mid-fade.
  const selectedId = data?.id ?? null
  useEffect(() => {
    if (selectedId) setStop('peek')
  }, [selectedId])

  return (
    <aside
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
        className="case-panel__handle"
        type="button"
        aria-label="Desplegar o plegar el panel"
        aria-expanded={stop === 'expanded'}
        onClick={() => setStop((s) => (s === 'peek' ? 'expanded' : 'peek'))}
        tabIndex={data ? 0 : -1}
      />

      <div className="case-panel__header">
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
        <p className="case-panel__meta">
          {shown ? `${shown.sector} · ${shown.location} · ${shown.year}` : ''}
        </p>

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

        <p className="case-panel__description">{shown?.summary ?? ''}</p>

        <ul className="case-panel__details">
          {(shown?.details ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        {/* The graph area keeps a fixed height whether or not a case is selected,
          so the panel's height doesn't jump during the fade. */}
        <div className="case-panel__graph">{shown ? <CaseChart chart={shown.chart} /> : null}</div>
      </div>
    </aside>
  )
}
