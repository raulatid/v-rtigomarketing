import { useRef } from 'react'
import { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'
import { CaseChart } from './CaseChart'

interface Props {
  data: SatelliteDef | null
  onClose: () => void
}

// Right-side "caso de éxito" panel, shown while a satellite is focused.
//
// The composition is a contract with the camera: the close-up pushes the
// satellite to the LEFT of centre precisely to clear this space. Change the
// panel's width and that offset needs revisiting — it is solved per viewport in
// `experiences/earth/camera/closeUpFraming.ts`.
//
// Below 767px this stops being a right-hand dock and becomes a bottom sheet
// (styles.css), and the offset goes to zero with it. The two are one decision.
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

  return (
    <aside
      className={`case-panel${data ? ' is-visible' : ''}`}
      aria-hidden={!data}
      role="complementary"
    >
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

      <h2 className="case-panel__title">{shown?.name ?? ''}</h2>

      {/* All content renders from `shown` (the last selected case), never from
          `data` — that is what lets the exit fade play over the panel's final
          contents instead of over emptied fields. */}
      <p className="case-panel__meta">
        {shown ? `${shown.sector} · ${shown.location} · ${shown.year}` : ''}
      </p>

      <div className="case-panel__metrics">
        {(shown?.metrics ?? [{ label: 'Métrica', value: '—' }, { label: 'Métrica', value: '—' }]).map(
          (metric, i) => (
            <div className="case-panel__metric" key={i}>
              <div className="case-panel__metric-label">{metric.label}</div>
              <div className="case-panel__metric-value">{metric.value}</div>
            </div>
          ),
        )}
      </div>

      <p className="case-panel__description">{shown?.summary ?? ''}</p>

      <ul className="case-panel__details">
        {(shown?.details ?? []).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {/* The graph area keeps a fixed height whether or not a case is selected,
          so the panel's height doesn't jump during the fade. */}
      <div className="case-panel__graph">
        {shown ? <CaseChart chart={shown.chart} /> : null}
      </div>
    </aside>
  )
}
