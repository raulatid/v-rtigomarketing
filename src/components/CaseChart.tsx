import { CaseChart as CaseChartData } from '../data/caseStudies'

// Tiny hand-rolled SVG charts for the case panel: line, bars, area, donut.
//
// Inline SVG instead of a charting library on purpose — four fixed shapes over
// ~12 static points don't justify a dependency, and staying in plain SVG keeps
// the panel's monochrome glass styling (currentColor + opacity) in CSS.
//
// All values are normalized here, so the data file can use any units.

interface Props {
  chart: CaseChartData
}

// ViewBox size. The SVG scales to the panel column; only ratios matter.
const W = 340
const H = 120
const PAD = 8

function scalePoints(values: number[]): [number, number][] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((v, i) => [
    PAD + (i / (values.length - 1)) * (W - PAD * 2),
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ])
}

function GridLines() {
  return (
    <g className="case-chart__grid">
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={PAD} x2={W - PAD} y1={H * t} y2={H * t} />
      ))}
    </g>
  )
}

function LineChart({ values, filled }: { values: number[]; filled: boolean }) {
  const pts = scalePoints(values)
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="case-chart__svg" aria-hidden="true">
      <GridLines />
      {filled && (
        <path
          className="case-chart__fill"
          d={`${path} L${last[0]},${H - PAD} L${pts[0][0]},${H - PAD} Z`}
        />
      )}
      <path className="case-chart__stroke" d={path} />
      <circle className="case-chart__dot" cx={last[0]} cy={last[1]} r={3.5} />
    </svg>
  )
}

function BarChart({ values, labels }: { values: number[]; labels?: string[] }) {
  const max = Math.max(...values)
  const labelRoom = labels ? 16 : 0
  const plotH = H - PAD - labelRoom
  const slot = (W - PAD * 2) / values.length
  const barW = Math.min(slot * 0.55, 36)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="case-chart__svg" aria-hidden="true">
      <GridLines />
      {values.map((v, i) => {
        const h = (v / max) * (plotH - PAD)
        const x = PAD + slot * i + (slot - barW) / 2
        return (
          <g key={i}>
            <rect
              className={`case-chart__bar${v === max ? ' is-max' : ''}`}
              x={x}
              y={plotH - h}
              width={barW}
              height={h}
              rx={2}
            />
            {labels?.[i] && (
              <text className="case-chart__tick" x={x + barW / 2} y={H - 4} textAnchor="middle">
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function DonutChart({ values, labels }: { values: number[]; labels?: string[] }) {
  const total = values.reduce((a, b) => a + b, 0)
  const r = 42
  const cx = 60
  const cy = H / 2
  const circumference = 2 * Math.PI * r
  // Gap between segments, in circumference units.
  const gap = 3
  let offset = 0
  const segments = values.map((v) => {
    const len = (v / total) * circumference
    const seg = { len: Math.max(len - gap, 1), start: offset }
    offset += len
    return seg
  })
  return (
    <div className="case-chart__donut">
      <svg viewBox={`0 0 120 ${H}`} className="case-chart__svg case-chart__svg--donut" aria-hidden="true">
        {segments.map((s, i) => (
          <circle
            key={i}
            className="case-chart__segment"
            cx={cx}
            cy={cy}
            r={r}
            style={{ opacity: 0.95 - i * 0.22 }}
            strokeDasharray={`${s.len} ${circumference - s.len}`}
            strokeDashoffset={-s.start}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
      </svg>
      <ul className="case-chart__legend">
        {values.map((v, i) => (
          <li key={i}>
            <span className="case-chart__swatch" style={{ opacity: 0.95 - i * 0.22 }} />
            {labels?.[i] ?? `Serie ${i + 1}`}
            <span className="case-chart__legend-value">{Math.round((v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CaseChart({ chart }: Props) {
  return (
    <figure className="case-chart">
      <figcaption className="case-chart__title">{chart.title}</figcaption>
      {chart.type === 'line' && <LineChart values={chart.values} filled={false} />}
      {chart.type === 'area' && <LineChart values={chart.values} filled />}
      {chart.type === 'bars' && <BarChart values={chart.values} labels={chart.labels} />}
      {chart.type === 'donut' && <DonutChart values={chart.values} labels={chart.labels} />}
    </figure>
  )
}
