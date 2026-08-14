import {
  ARC_D,
  ARC_START,
  CENTER,
  DEPTH_VERTICES,
  FILL_D,
  FIRST_VERTEX,
  VIEWBOX,
  V_D,
} from './isotype'
import { DEFAULT_DRAW_CONFIG, DRAW_SHAPE, DRAW_TIMING, DrawConfig } from './drawConfig'
import { layoutStages } from './stageLayout'
import { createPlayhead, Readiness } from './playhead'

// P0: the isotype drawn stroke by stroke, a dot riding the tip — and the site's
// loading animation. Standalone by rule: no React, no GSAP, no three, no
// imports outside this directory. It must run in a bare HTML page given only a
// progress callback (DECISIONS.md, "Code that runs first depends on nothing").
//
// The playhead is a function of load progress, not of wall-clock time. See
// plan 006 §2 — the mapping and its four failure modes are all implemented in
// `frame()` below.

const NS = 'http://www.w3.org/2000/svg'

// Site copy is Spanish. These are the only strings this module renders.
//
// Each one corresponds to a real state, so none of them can be reassuring
// about something that is not true: `slow` only appears once the drawing has
// genuinely waited past its notice threshold, and `failed` only when a required
// asset has hard-failed and the sequence will never release.
const CAPTIONS = {
  loading: 'Cargando experiencia',
  preparing: 'Estamos preparándolo todo',
  almost: 'Casi listo',
  slow: 'Esto está tardando más de lo habitual',
  failed: 'No se pudo cargar la experiencia',
} as const
const STYLE_ID = 'vertigo-intro-draw-style'

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// GSAP names on the left, since these ratios were tuned there: power1 is
// quadratic, power2 is cubic.
const quadOut = (t: number) => 1 - (1 - t) * (1 - t)
const quadInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3)
const cubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

const CSS = `
.intro-root{position:fixed;inset:0;z-index:20;display:flex;align-items:center;
  justify-content:center;pointer-events:none;background:transparent}
.intro-svg{
  /* Fixed layout box, scaled by transform only. Animating width/height here
     cost a layout + re-raster every frame (docs/reports/006). */
  width:min(calc(var(--intro-base,32) * 1vmin),480px);
  height:min(calc(var(--intro-base,32) * 1vmin),480px);
  overflow:visible;will-change:transform,filter;transform-origin:50% 50%;
  transform:scale(calc(var(--intro-scale,1) * var(--intro-warp,1)))}
.intro-svg .v-stroke{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;
  stroke-linejoin:round}
.intro-svg .v-stroke--back{stroke-width:1.75;opacity:.85}
.intro-svg .v-stroke--depth{stroke-width:1.25;opacity:.6}
.intro-svg .v-fill{fill:#fff;stroke:none}
.intro-svg .v-dot{fill:#fff}
.intro-caption{position:absolute;left:50%;transform:translateX(-50%);
  top:calc(50% + min(19vmin,285px));margin:0;
  max-width:calc(100vw - 2rem);text-align:center;
  font:400 0.82rem/1.4 'Inter',system-ui,sans-serif;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,255,255,.62);
  opacity:0;transition:opacity .5s ease}
.intro-caption.is-visible{opacity:1}
@media (prefers-reduced-motion:reduce){.intro-caption{transition:none}}
`

function injectStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

// Pre-sampled point table. getPointAtLength() per frame was a measured cost
// (docs/reports/006) and it is on the critical path now that this animation is
// what the user is waiting on.
function samplePath(path: SVGPathElement, samples = 256) {
  const length = path.getTotalLength()
  const xs = new Float64Array(samples + 1)
  const ys = new Float64Array(samples + 1)
  for (let i = 0; i <= samples; i++) {
    const p = path.getPointAtLength((i / samples) * length)
    xs[i] = p.x
    ys[i] = p.y
  }
  return {
    length,
    at(t: number) {
      const u = clamp01(t) * samples
      const i = Math.floor(u)
      const j = Math.min(i + 1, samples)
      const f = u - i
      return { x: xs[i] + (xs[j] - xs[i]) * f, y: ys[i] + (ys[j] - ys[i]) * f }
    },
  }
}

// Local progress for item `index` inside a staggered group, given the group's
// own 0..1 progress.
function staggered(t: number, index: number, count: number, stagger: number, dur: number) {
  const span = dur + (count - 1) * stagger
  const start = (index * stagger) / span
  return clamp01((t - start) / (dur / span))
}

export interface IntroDrawOptions {
  /** Where the layer mounts. Defaults to document.body. */
  container?: HTMLElement
  config?: Partial<DrawConfig>
  /** Measured load progress, 0..1. Moves the drawing; never gates it. */
  getProgress: () => number
  /**
   * Whether the app can actually be shown. Gates the ending ONLY — the outline
   * advances without it. Deliberately a separate input from getProgress: they
   * answer different questions and conflating them was the original bug.
   */
  getReadiness: () => Readiness
  /** Fires each time the fill completes — on first run and after every replay. */
  onComplete: () => void
  /**
   * Diagnostics only. The intro keeps waiting; it does NOT complete, and this
   * never implies readiness (plan 007 Phase 4).
   */
  onTimeoutNotice?: () => void
  reducedMotion?: boolean
  /**
   * Pulse the leading dot while the playhead is stalled, so a wait never reads
   * as a crash. Works from the first frame — it does not depend on the dot
   * having been drawn yet (plan 007 Phase 2).
   */
  dotIdle?: boolean
}

export interface IntroDrawHandle {
  readonly root: HTMLDivElement
  readonly svg: SVGSVGElement
  /** 0..1 across the whole draw, fill included. */
  playhead(): number
  /** True once the fill has finished. Only reachable through readiness. */
  isDone(): boolean
  /** Held at the pre-ready limit, waiting on readiness. Diagnostics. */
  isHolding(): boolean
  /** Derived zone boundaries, for diagnostics and tests. */
  zones(): { zoneAEnd: number; preReadyLimit: number; ceiling: number }
  /**
   * Fires on every completion, including after a replay. The boot entry's
   * `completed` promise cannot serve this — a promise resolves once, so a
   * replayed draw would report itself finished the instant it restarted.
   */
  subscribeComplete(fn: () => void): () => void
  /** P1 shrink drives this instead of animating the layout box. */
  setScale(scale: number): void
  /** P2 warp's faked motion blur. */
  setWarp(blurPx: number, stretch: number): void
  setVisible(visible: boolean): void
  /** Debug seek / reduced motion: jump to the finished mark. */
  snapToEnd(): void
  /**
   * P0's live config. The app reads its defaults from here at runtime rather
   * than importing drawConfig, which would give Rollup a reason to hoist a
   * chunk shared between the boot entry and the app bundle.
   */
  getConfig(): DrawConfig
  setConfig(config: Partial<DrawConfig>): void
  replay(): void
  destroy(): void
  /** Per-frame trace for the §7 CSV dump. Empty unless `trace` was enabled. */
  trace: Array<[number, number, number, number]>
  setTrace(on: boolean): void
}

export function createIntroDraw(options: IntroDrawOptions): IntroDrawHandle {
  const doc = document
  injectStyles(doc)

  let cfg: DrawConfig = { ...DEFAULT_DRAW_CONFIG, ...options.config }

  // ── DOM ──
  const root = doc.createElement('div')
  root.className = 'intro-root'
  root.setAttribute('aria-hidden', 'true')

  const svg = el('svg', {
    class: 'intro-svg',
    viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
    preserveAspectRatio: 'xMidYMid meet',
  })
  svg.style.setProperty('--intro-base', String(cfg.introSize))
  root.appendChild(svg)

  const isoGroup = el('g')
  const isoInner = el('g')
  const backV = el('path', { class: 'v-stroke v-stroke--back', d: V_D })
  const backArc = el('path', { class: 'v-stroke v-stroke--back', d: ARC_D })
  isoInner.append(backV, backArc)
  isoGroup.appendChild(isoInner)

  const edges = DEPTH_VERTICES.map(([x, y]) =>
    el('line', { class: 'v-stroke v-stroke--depth', x1: x, y1: y, x2: x, y2: y }),
  )
  edges.forEach((e) => isoGroup.appendChild(e))

  const frontV = el('path', { class: 'v-stroke', d: V_D })
  const frontArc = el('path', { class: 'v-stroke', d: ARC_D })
  const fill = el('path', { class: 'v-fill', d: FILL_D })
  const dot = el('circle', { class: 'v-dot', r: 4, cx: CENTER.x, cy: CENTER.y })

  svg.append(isoGroup, frontV, frontArc, fill, dot)

  // Loading caption. Absolutely positioned rather than added to the flex flow,
  // because the mark has to stay EXACTLY at screen centre — the 3D logo blooms
  // there at the swap crossover, and nudging the 2D mark up would break the
  // substitution that crossover conceals.
  //
  // Not aria-hidden like the root: this is the only thing on screen that tells
  // a screen reader anything is happening. `role=status` announces changes
  // without stealing focus.
  const caption = doc.createElement('p')
  caption.className = 'intro-caption'
  caption.setAttribute('role', 'status')
  root.appendChild(caption)
  ;(options.container ?? doc.body).appendChild(root)

  // ── Geometry, measured once ──
  const vSample = samplePath(frontV)
  const arcSample = samplePath(frontArc)
  const backLengths = [backV, backArc].map((p) => p.getTotalLength())

  function applyIsoOffset() {
    const ox = cfg.isoOffset
    const oy = -cfg.isoOffset * DRAW_SHAPE.collapseYRatio
    isoInner.setAttribute('transform', `translate(${ox} ${oy})`)
    edges.forEach((e, i) => {
      const [x, y] = DEPTH_VERTICES[i]
      e.setAttribute('x2', String(x + ox))
      e.setAttribute('y2', String(y + oy))
    })
  }

  // Every depth edge is the same diagonal, so one length covers all nine.
  // Written to strokeDasharray here rather than per frame — only the offset
  // changes while drawing.
  let edgeLength = 0
  function measureEdges() {
    edgeLength = Math.hypot(cfg.isoOffset, cfg.isoOffset * DRAW_SHAPE.collapseYRatio)
    for (const edge of edges) edge.style.strokeDasharray = String(edgeLength)
  }

  ;[frontV, frontArc].forEach((p, i) => {
    const len = i === 0 ? vSample.length : arcSample.length
    p.style.strokeDasharray = String(len)
  })
  ;[backV, backArc].forEach((p, i) => {
    p.style.strokeDasharray = String(backLengths[i])
  })

  // ── Stage layout, and the three zones (plan 007 Phase 1) ──
  //
  //   Zone A  [0 .. zoneAEnd]           dot in, dot to first vertex.
  //                                     Time-driven, unconditional.
  //   Zone B  [zoneAEnd .. preReady]    the outline. Hybrid: autonomous curve
  //                                     or measured progress, whichever leads.
  //   Zone C  [preReady .. 1]           collapse + fill. READINESS ONLY.
  //
  // Every boundary is DERIVED from the stage weights, never hardcoded. Plan 007
  // suggested a literal PRE_READY_LIMIT of 0.82; with the shipped weights that
  // lands 4% into the collapse and would freeze the isometric scaffolding
  // mid-fade. The natural boundary is the end of the depth edges (0.8167 today
  // — within 0.4% of the suggested value, which is presumably where it came
  // from). Holding there also reads better: the construction stays on screen
  // while work continues, and collapse-then-fill becomes the "ready" gesture.
  // The stage table, and the three zone boundaries derived from it. Computed by
  // a pure function in stageLayout.ts — it is arithmetic over `cfg` and touches
  // no DOM, which is what lets playhead.test.ts assert against the real numbers
  // instead of a copy of them.
  let timeline = layoutStages(cfg)

  const local = (name: string, p: number) => {
    const s = timeline.stages[name]
    return clamp01((p - s.start) / (s.end - s.start))
  }

  // ── Rendering one playhead position ──
  let dotAlpha = 0

  function apply(p: number) {
    let dx = CENTER.x
    let dy = CENTER.y

    // STAGE 1 — the dot appears at centre.
    const tDot = cubicOut(local('dot', p))
    dotAlpha = tDot
    const dotScale = DRAW_SHAPE.dotScaleFrom + (1 - DRAW_SHAPE.dotScaleFrom) * tDot
    dot.setAttribute('r', String(4 * dotScale))

    // STAGE 2 — it travels to the V's first vertex.
    const tMove = cubicInOut(local('dotMove', p))
    dx = CENTER.x + (FIRST_VERTEX[0] - CENTER.x) * tMove
    dy = CENTER.y + (FIRST_VERTEX[1] - CENTER.y) * tMove

    // STAGE 3 — the V is traced, the dot riding the stroke tip.
    const tV = quadInOut(local('drawV', p))
    frontV.style.strokeDashoffset = String(vSample.length * (1 - tV))
    if (p > timeline.stages.drawV.start) {
      const pt = vSample.at(tV)
      dx = pt.x
      dy = pt.y
    }

    // STAGE 3b — hop to the arc, then trace it.
    const tHop = cubicInOut(local('arcHop', p))
    if (p > timeline.stages.arcHop.start) {
      const from = vSample.at(1)
      dx = from.x + (ARC_START[0] - from.x) * tHop
      dy = from.y + (ARC_START[1] - from.y) * tHop
    }
    const tArc = quadInOut(local('drawArc', p))
    frontArc.style.strokeDashoffset = String(arcSample.length * (1 - tArc))
    if (p > timeline.stages.drawArc.start) {
      const pt = arcSample.at(tArc)
      dx = pt.x
      dy = pt.y
    }

    dot.setAttribute('cx', String(dx))
    dot.setAttribute('cy', String(dy))

    // STAGE 4 — the fake isometric construction.
    const tBack = local('isoBack', p)
    ;[backV, backArc].forEach((path, i) => {
      const t = quadInOut(staggered(tBack, i, 2, DRAW_SHAPE.isoStagger, cfg.isoDrawDuration))
      path.style.strokeDashoffset = String(backLengths[i] * (1 - t))
    })

    const tDepth = local('depth', p)
    edges.forEach((edge, i) => {
      const t = quadOut(
        staggered(tDepth, i, edges.length, DRAW_SHAPE.depthStagger, cfg.depthDuration),
      )
      edge.style.strokeDashoffset = String(edgeLength * (1 - t))
    })

    // STAGE 5 — collapse back to the frontal view.
    const tCollapse = cubicInOut(local('collapse', p))
    isoGroup.style.opacity = String(1 - tCollapse)
    isoGroup.style.transform = `translate(${-cfg.isoOffset * tCollapse}px, ${
      cfg.isoOffset * DRAW_SHAPE.collapseYRatio * tCollapse
    }px)`

    // STAGE 6 — the fill.
    //
    // INVARIANT (plan 007 Phase 10): the outline communicates ongoing work;
    // the fill communicates that the application is ready to transition.
    // Nothing but readiness may activate it — not elapsed time, not the
    // autonomous curve, not a timeout. The playhead cannot reach here without
    // readiness because Zone C is gated in playhead.ts.
    const tFill = cubicInOut(clamp01((p - timeline.ceiling) / (1 - timeline.ceiling)))
    fill.style.opacity = String(tFill)
    frontV.style.opacity = String(1 - tFill)
    frontArc.style.opacity = String(1 - tFill)
    dotAlpha *= 1 - Math.min(tFill * 3, 1)
    dot.style.opacity = String(dotAlpha)
  }

  // ── Playhead ──
  // The arithmetic lives in playhead.ts so it can be tested without a DOM.
  // This function only renders what that returns.
  let raf = 0
  let lastNow = 0
  let current = 0
  let stalledFor = 0
  let noticed = false
  let holding = false
  let done = false
  let tracing = false
  const trace: Array<[number, number, number, number]> = []

  const playheadLimits = () => ({
    minimumDuration: DRAW_TIMING.minimumDuration,
    preReadyLimit: timeline.preReadyLimit,
    autonomousTau: DRAW_TIMING.autonomousTau,
    smoothRate: DRAW_TIMING.smoothRate,
    maxDt: DRAW_TIMING.maxDt,
    stallEpsilon: DRAW_TIMING.stallEpsilon,
  })
  const playhead = createPlayhead(playheadLimits())

  const completeListeners = new Set<() => void>()

  function finish() {
    done = true
    // The mark is about to shrink into the crossover; the caption has said all
    // it can and must be gone before the 3D logo blooms at centre.
    caption.classList.remove('is-visible')
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    options.onComplete()
    for (const fn of completeListeners) fn()
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const raw = lastNow ? (now - lastNow) / 1000 : 0
    lastNow = now

    const load = options.getProgress()
    const readiness = options.getReadiness()
    const f = playhead.step(raw, load, readiness)

    current = f.visual
    holding = f.holding
    apply(current)

    // ── Anti-dead-frame (plan 007 Phase 2) ──
    // Deliberately NOT gated on dotAlpha: that was false at exactly the state
    // where the page looked broken. A floor alpha means the pulse works from
    // the first frame, whatever the playhead is doing.
    stalledFor = f.stalled ? stalledFor + Math.min(raw, DRAW_TIMING.maxDt) : 0
    if (options.dotIdle !== false && stalledFor > DRAW_TIMING.stallAfter && !done) {
      const breath = 0.72 + 0.28 * Math.cos(f.elapsed * 4.2)
      const base = Math.max(dotAlpha, DRAW_TIMING.pulseMinAlpha)
      dot.style.opacity = String(base * breath)
    }

    // ── Timeout: diagnostics ONLY (plan 007 Phase 4) ──
    // It does not complete the drawing, does not set readiness, and does not
    // release the sequence into an unready scene. The intro keeps waiting.
    if (!noticed && f.elapsed > DRAW_TIMING.timeoutNotice && readiness !== 'ready') {
      noticed = true
      options.onTimeoutNotice?.()
    }

    // ── Caption ──
    // Derived from the same real state the drawing is, never from a timer: the
    // whole point of the progress playhead is that what the viewer sees is what
    // is actually happening (ARCHITECTURE 20). "Casi listo" therefore means the
    // drawing is genuinely holding at the pre-ready limit waiting on required
    // assets, not that some clock elapsed.
    // Driven by MEASURED load and readiness — never by the drawing's own
    // playhead.
    //
    // Those are different numbers and conflating them is the bug this whole
    // module was rebuilt to avoid (plan 007). With no measured progress the
    // autonomous curve still carries the outline up to the pre-ready limit and
    // holds it there, so the drawing can look nearly finished while nothing has
    // actually downloaded. A caption reading the playhead would announce
    // "Casi listo" over an empty cache — reassuring, and false.
    //
    // So "Casi listo" is spent only on genuine readiness, and the middle state
    // on real bytes.
    setCaption(
      readiness === 'fatal'
        ? CAPTIONS.failed
        : noticed
          ? CAPTIONS.slow
          : readiness === 'ready'
            ? CAPTIONS.almost
            : load >= 0.5
              ? CAPTIONS.preparing
              : CAPTIONS.loading,
    )

    if (tracing) trace.push([f.elapsed, raw, load, current])

    if (f.done) finish()
  }

  let captionText = ''
  function setCaption(next: string) {
    if (next === captionText) return
    captionText = next
    caption.textContent = next
    // Held back until there is something to say — a caption that appears in the
    // same instant as the mark competes with it for the opening beat.
    caption.classList.add('is-visible')
  }

  function start() {
    if (raf) return
    lastNow = 0
    raf = requestAnimationFrame(frame)
  }

  // ── Init ──
  applyIsoOffset()
  measureEdges()
  apply(0)

  if (options.reducedMotion) {
    // No stroke-by-stroke build — but the fill invariant still holds, and it
    // did NOT before: the previous version called apply(1), which showed the
    // FILLED mark at t=0 and only then waited. That announced "ready" before
    // anything was, for exactly the users least able to reinterpret it.
    //
    // Show the completed outline instead, and let readiness bring the fill,
    // still respecting the minimum duration. Same semantics as the animated
    // path, just without the stroke-by-stroke build (plan 007 §12 case 9).
    current = timeline.preReadyLimit
    apply(current)
    const poll = (now: number) => {
      raf = requestAnimationFrame(poll)
      const raw = lastNow ? (now - lastNow) / 1000 : 0
      lastNow = now
      const f = playhead.step(raw, 1, options.getReadiness())
      // Skip straight to the outline; only the ending is animated.
      current = Math.max(timeline.preReadyLimit, f.visual)
      apply(current)
      if (f.done) finish()
    }
    raf = requestAnimationFrame(poll)
  } else {
    start()
  }

  return {
    root,
    svg,
    playhead: () => current,
    isDone: () => done,
    isHolding: () => holding,
    zones: () => ({
      zoneAEnd: timeline.zoneAEnd,
      preReadyLimit: timeline.preReadyLimit,
      ceiling: timeline.ceiling,
    }),
    subscribeComplete(fn) {
      completeListeners.add(fn)
      return () => completeListeners.delete(fn)
    },
    setScale(scale) {
      svg.style.setProperty('--intro-scale', String(scale))
    },
    setWarp(blurPx, stretch) {
      svg.style.filter = blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : ''
      svg.style.setProperty('--intro-warp', String(1 + stretch))
    },
    setVisible(visible) {
      svg.style.visibility = visible ? 'visible' : 'hidden'
      // The caption belongs to the drawing, so a seek that hides one hides both.
      if (!visible) caption.classList.remove('is-visible')
    },
    snapToEnd() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      done = true
      holding = false
      current = 1
      apply(1)
    },
    getConfig: () => ({ ...cfg }),
    setConfig(next) {
      cfg = { ...cfg, ...next }
      svg.style.setProperty('--intro-base', String(cfg.introSize))
      applyIsoOffset()
      measureEdges()
      timeline = layoutStages(cfg)
      // The zone boundaries move with the weights, so the playhead's limits
      // must follow — otherwise Zone C stays gated at the old position and the
      // fill unlocks early or never. Updated in place, never rebuilt: a rebuild
      // would reset `elapsed` and restart the minimum duration on every edit.
      playhead.setLimits(playheadLimits())
      apply(current)
    },
    replay() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      playhead.reset()
      lastNow = 0
      current = 0
      stalledFor = 0
      noticed = false
      holding = false
      done = false
      trace.length = 0
      svg.style.removeProperty('--intro-scale')
      svg.style.removeProperty('--intro-warp')
      svg.style.filter = ''
      svg.style.visibility = 'visible'
      apply(0)
      start()
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      root.remove()
    },
    trace,
    setTrace(on) {
      tracing = on
      if (!on) trace.length = 0
    },
  }
}
