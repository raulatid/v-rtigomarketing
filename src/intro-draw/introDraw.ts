import { ARC_D, CENTER, DEPTH_VERTICES, FILL_D, OVERDRAW, VIEWBOX, V_D } from './isotype'
import { DEFAULT_DRAW_CONFIG, DRAW_TIMING, DrawConfig } from './drawConfig'
import { layoutStages } from './stageLayout'
import type { Readiness } from './playhead'
import { CaptionKey, createDrawLoop, DrawTick, playheadLimits } from './drawLoop'
import { edgeLength as depthEdgeLength, isoOffset, markPose } from './drawPose'
import type { FromDrawWorker, ToDrawWorker } from './drawWorker'

// P0: the isotype drawn stroke by stroke, a dot riding the tip — and the site's
// loading animation. Standalone by rule: no React, no GSAP, no three, no
// imports outside this directory. It must run in a bare HTML page given only a
// progress callback (DECISIONS.md 26.4, "Code that runs first depends on nothing").
//
// The playhead is a function of load progress, not of wall-clock time. See
// plan 006 §2 — the mapping and its four failure modes are all implemented in
// playhead.ts, and the policy around it in drawLoop.ts.
//
// Drawn in one of two places (ADR 016 item 3). Where the browser can, a worker
// paints it into an OffscreenCanvas, so the boot's long tasks on this thread no
// longer freeze the stroke. Elsewhere — no OffscreenCanvas 2D, no module
// worker, or a worker that fails — it is the SVG it always was, on this thread.
// Both run the same policy and choreography; this file owns the DOM, the
// caption and the handle, whichever is drawing.

const NS = 'http://www.w3.org/2000/svg'

// Site copy is Spanish. These are the only strings this module renders.
//
// Each one corresponds to a real state, so none of them can be reassuring
// about something that is not true: `slow` only appears once the drawing has
// genuinely waited past its notice threshold, and `failed` only when a required
// asset has hard-failed and the sequence will never release.
const CAPTIONS: Record<CaptionKey, string> = {
  loading: 'Cargando experiencia',
  preparing: 'Estamos preparándolo todo',
  almost: 'Casi listo',
  slow: 'Esto está tardando más de lo habitual',
  failed: 'No se pudo cargar la experiencia',
}
const STYLE_ID = 'vertigo-intro-draw-style'

// The canvas carries OVERDRAW on every side, so it is this much larger than the
// SVG's box for the mark inside it to come out the same size.
const CANVAS_SCALE = (VIEWBOX.width + 2 * OVERDRAW) / VIEWBOX.width

// Fixed layout box, scaled by transform only; changing width/height each frame
// causes layout and rasterization work (docs/reports/006).
const CSS = `
.intro-root{position:fixed;inset:0;z-index:20;display:flex;align-items:center;
  justify-content:center;pointer-events:none;background:transparent}
.intro-mark{
  width:min(calc(var(--intro-base,32) * 1vmin),480px);
  height:min(calc(var(--intro-base,32) * 1vmin),480px);
  overflow:visible;will-change:transform,filter;transform-origin:50% 50%;
  transform:scale(calc(var(--intro-scale,1) * var(--intro-warp,1)))}
.intro-canvas{
  width:min(calc(var(--intro-base,32) * ${CANVAS_SCALE}vmin),${480 * CANVAS_SCALE}px);
  height:min(calc(var(--intro-base,32) * ${CANVAS_SCALE}vmin),${480 * CANVAS_SCALE}px)}
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
      const u = (t < 0 ? 0 : t > 1 ? 1 : t) * samples
      const i = Math.floor(u)
      const j = Math.min(i + 1, samples)
      const f = u - i
      return { x: xs[i] + (xs[j] - xs[i]) * f, y: ys[i] + (ys[j] - ys[i]) * f }
    },
  }
}

/** Every browser feature the worker path needs, checked before committing to it. */
function canDrawOffThread() {
  return (
    typeof Worker === 'function' &&
    typeof OffscreenCanvasRenderingContext2D === 'function' &&
    typeof HTMLCanvasElement === 'function' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype
  )
}

// What a renderer gives the handle. The handle keeps the state the app reads
// (playhead, done, holding, visibility) and the renderer reports into it.
interface DrawEngine {
  readonly mark: SVGSVGElement | HTMLCanvasElement
  replay(): void
  snapToEnd(): void
  /** `cfg` changed; re-lay out and redraw the current position. */
  configure(): void
  unquiet(): void
  destroy(): void
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
   * The first frame the drawing put on screen, as a performance.now() time.
   * Once. Off the main thread that frame is the worker's, and it can land well
   * after this thread's first rAF.
   */
  onFirstFrame?: (startTime: number) => void
  /**
   * Diagnostics only. The intro keeps waiting; it does NOT complete, and this
   * never implies readiness (plan 007 Phase 4).
   */
  onTimeoutNotice?: () => void
  reducedMotion?: boolean
  /**
   * Wait for readiness WITHOUT showing the drawing: the mark stays hidden, and
   * the wait ends the moment the scene is ready, with no minimum duration —
   * there is nothing on screen for a minimum to protect. For a returning
   * visitor, who goes straight to the 3D mark (DECISIONS §51).
   *
   * Not a promise. Past `DRAW_TIMING.quietGrace`, or on a fatal load, the
   * drawing shows itself and everything below applies again, floor included.
   * Readiness still gates the ending either way: quiet changes what is SEEN
   * while waiting, never what is waited for.
   */
  quiet?: boolean
  /**
   * Pulse the leading dot while the playhead is stalled, so a wait never reads
   * as a crash. Works from the first frame — it does not depend on the dot
   * having been drawn yet (plan 007 Phase 2).
   */
  dotIdle?: boolean
}

export interface IntroDrawHandle {
  readonly root: HTMLDivElement
  /**
   * The element the mark is drawn in: a canvas painted by the worker, or the
   * SVG where that is unavailable. `.intro-mark` either way.
   */
  readonly mark: SVGSVGElement | HTMLCanvasElement
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
  /**
   * Whether the mark is on screen. False after a quiet wait that stayed quiet,
   * which is how the timeline knows there is no 2D mark to collapse.
   */
  isVisible(): boolean
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

  // ── What the app reads, whichever renderer is drawing ──
  let current = options.reducedMotion ? timeline.preReadyLimit : 0
  let holding = false
  let done = false
  let tracing = false
  const trace: Array<[number, number, number, number]> = []
  /** Still waiting unseen. Cleared for good the first time the mark is shown. */
  let quiet = options.quiet === true
  let firstFrameSeen = false

  const completeListeners = new Set<() => void>()

  function finish() {
    done = true
    // The mark is about to shrink into the crossover; the caption has said all
    // it can and must be gone before the 3D logo blooms at centre.
    caption.classList.remove('is-visible')
    options.onComplete()
    for (const fn of completeListeners) fn()
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

  function firstFrame(startTime: number) {
    if (firstFrameSeen) return
    firstFrameSeen = true
    options.onFirstFrame?.(startTime)
  }

  /** One frame's outcome, from either renderer. The renderer has already drawn it. */
  function report(tick: DrawTick) {
    current = tick.visual
    holding = tick.holding
    if (tick.revealed) {
      quiet = false
      engine.mark.style.visibility = 'visible'
    }
    if (tick.notice) options.onTimeoutNotice?.()
    if (tick.caption) setCaption(CAPTIONS[tick.caption])
    if (tracing && tick.trace) trace.push(tick.trace)
    if (tick.done) finish()
  }

  function newMark<T extends SVGSVGElement | HTMLCanvasElement>(mark: T): T {
    mark.style.setProperty('--intro-base', String(cfg.introSize))
    if (quiet) mark.style.visibility = 'hidden'
    // Before the caption, which is where the SVG always sat in the root.
    root.insertBefore(mark, caption)
    return mark
  }

  // ── The SVG, on this thread ──
  function createSvgEngine(): DrawEngine {
    const svg = newMark(
      el('svg', {
        class: 'intro-mark intro-svg',
        viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
        preserveAspectRatio: 'xMidYMid meet',
      }),
    )

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

    // ── Geometry, measured once ──
    const vSample = samplePath(frontV)
    const arcSample = samplePath(frontArc)
    const backLengths = [backV, backArc].map((p) => p.getTotalLength())
    const paths = { v: vSample, arc: arcSample }

    function applyIsoOffset() {
      const offset = isoOffset(cfg)
      isoInner.setAttribute('transform', `translate(${offset.x} ${offset.y})`)
      edges.forEach((e, i) => {
        const [x, y] = DEPTH_VERTICES[i]
        e.setAttribute('x2', String(x + offset.x))
        e.setAttribute('y2', String(y + offset.y))
      })
    }

    // Every depth edge is the same diagonal, so one length covers all nine.
    // Written to strokeDasharray here rather than per frame — only the offset
    // changes while drawing.
    let edgeLength = 0
    function measureEdges() {
      edgeLength = depthEdgeLength(cfg)
      for (const edge of edges) edge.style.strokeDasharray = String(edgeLength)
    }

    ;[frontV, frontArc].forEach((p, i) => {
      const len = i === 0 ? vSample.length : arcSample.length
      p.style.strokeDasharray = String(len)
    })
    ;[backV, backArc].forEach((p, i) => {
      p.style.strokeDasharray = String(backLengths[i])
    })

    // ── Rendering one playhead position ──
    let dotAlpha = 0

    function apply(p: number) {
      const pose = markPose(p, cfg, timeline, paths)
      dotAlpha = pose.dot.alpha
      dot.setAttribute('r', String(pose.dot.r))
      dot.setAttribute('cx', String(pose.dot.x))
      dot.setAttribute('cy', String(pose.dot.y))
      frontV.style.strokeDashoffset = String(vSample.length * (1 - pose.v))
      frontArc.style.strokeDashoffset = String(arcSample.length * (1 - pose.arc))
      ;[backV, backArc].forEach((path, i) => {
        path.style.strokeDashoffset = String(backLengths[i] * (1 - pose.back[i]))
      })
      edges.forEach((edge, i) => {
        edge.style.strokeDashoffset = String(edgeLength * (1 - pose.edges[i]))
      })
      isoGroup.style.opacity = String(pose.iso.opacity)
      isoGroup.style.transform = `translate(${pose.iso.x}px, ${pose.iso.y}px)`
      fill.style.opacity = String(pose.fill)
      frontV.style.opacity = String(pose.outlineOpacity)
      frontArc.style.opacity = String(pose.outlineOpacity)
      dot.style.opacity = String(dotAlpha)
    }

    // ── Playhead ──
    let raf = 0
    let lastNow = 0
    const loop = createDrawLoop({
      limits: playheadLimits(timeline.preReadyLimit),
      quiet,
      reducedMotion: options.reducedMotion === true,
      dotIdle: options.dotIdle !== false,
    })

    // The playhead spends REAL seconds now rather than frames, which introduces
    // one hazard the old clamp had been hiding: a backgrounded tab would spend
    // the drawing's three seconds with nobody watching, and the viewer would come
    // back to an intro that had already happened. rAF does not fire while hidden,
    // so the whole away-time would arrive as one enormous delta.
    //
    // So the drawing measures VISIBLE time: the frame that resumes contributes
    // nothing, and the clock picks up where it left off. Same reasoning as the
    // visibilitychange guards on the master timeline and the warp — this module
    // simply cannot borrow theirs, since it has no GSAP and no React.
    let resumed = false
    const onVisibility = () => {
      if (!doc.hidden) resumed = true
    }
    doc.addEventListener('visibilitychange', onVisibility)

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      // `resumed` discards exactly the one delta that spans the hidden window;
      // `lastNow` does the same for the first frame of the run.
      const raw = lastNow && !resumed ? (now - lastNow) / 1000 : 0
      resumed = false
      lastNow = now

      const tick = loop.tick(raw, options.getProgress(), options.getReadiness())
      apply(tick.visual)
      if (tick.pulse !== null) {
        dot.style.opacity = String(Math.max(dotAlpha, DRAW_TIMING.pulseMinAlpha) * tick.pulse)
      }
      if (tick.done) stop()
      firstFrame(now)
      report(tick)
    }

    function start() {
      if (raf) return
      lastNow = 0
      raf = requestAnimationFrame(frame)
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    // ── Init ──
    applyIsoOffset()
    measureEdges()
    // Under reduced motion the completed outline shows from the start, never
    // the filled mark: that would announce "ready" before anything was, for
    // exactly the users least able to reinterpret it.
    apply(options.reducedMotion ? timeline.preReadyLimit : 0)
    start()

    return {
      mark: svg,
      replay() {
        stop()
        loop.reset()
        resumed = false
        apply(0)
        start()
      },
      snapToEnd() {
        stop()
        apply(1)
      },
      configure() {
        applyIsoOffset()
        measureEdges()
        loop.setLimits(playheadLimits(timeline.preReadyLimit))
        apply(current)
      },
      unquiet: () => loop.unquiet(),
      destroy() {
        stop()
        doc.removeEventListener('visibilitychange', onVisibility)
      },
    }
  }

  // ── The canvas, painted by the worker (ADR 016 item 3) ──
  //
  // Returns null when the worker cannot even be constructed, so the SVG takes
  // over before anything was shown. A worker that fails later — its script will
  // not load, or it has no 2D context — hands over to the SVG the same way,
  // which starts its own clock: a fallback, so honest rather than seamless.
  function createCanvasEngine(): DrawEngine | null {
    let worker: Worker
    try {
      worker = new Worker(new URL('./drawWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      return null
    }
    const canvas = newMark(doc.createElement('canvas'))
    canvas.className = 'intro-mark intro-canvas'
    const offscreen = canvas.transferControlToOffscreen()

    const post = (message: ToDrawWorker, transfer: Transferable[] = []) =>
      worker.postMessage(message, transfer)
    // Device pixels for the layout box. clientWidth ignores the shrink and warp
    // transforms, which scale the painted bitmap rather than resize it.
    const backing = () => ({
      width: canvas.clientWidth * (window.devicePixelRatio || 1),
      height: canvas.clientHeight * (window.devicePixelRatio || 1),
    })
    // Only the DrawConfig fields: setConfig is handed the app's whole config.
    const drawConfig = () =>
      Object.fromEntries(
        Object.keys(DEFAULT_DRAW_CONFIG).map((key) => [key, cfg[key as keyof DrawConfig]]),
      ) as unknown as DrawConfig

    // Inputs are posted when they change, read whenever a frame arrives: they
    // only ever change on this thread, so a frame is as often as anything new
    // can exist, and a stall here is a stall in their changing too.
    let load = options.getProgress()
    let readiness = options.getReadiness()
    let generation = 0
    let failed = false

    const onVisibility = () => post({ type: 'hidden', hidden: doc.hidden })
    doc.addEventListener('visibilitychange', onVisibility)
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => post({ type: 'size', ...backing() }))
        : null

    function release() {
      worker.terminate()
      observer?.disconnect()
      doc.removeEventListener('visibilitychange', onVisibility)
    }

    function fallBack(reason: string) {
      if (failed) return
      failed = true
      release()
      canvas.remove()
      if (done) return
      console.warn(`[intro] drawing on the main thread instead: ${reason}`)
      engine = createSvgEngine()
    }

    worker.onmessage = ({ data }: MessageEvent<FromDrawWorker>) => {
      if (failed) return
      if (data.type === 'unsupported') return fallBack('no 2D context in the worker')
      if (data.type === 'painted') return firstFrame(data.at - performance.timeOrigin)
      // Posted before a replay or a seek this thread has since asked for.
      if (data.generation !== generation) return
      const nextLoad = options.getProgress()
      const nextReadiness = options.getReadiness()
      if (nextLoad !== load || nextReadiness !== readiness) {
        load = nextLoad
        readiness = nextReadiness
        post({ type: 'inputs', load, readiness })
      }
      report(data.tick)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      fallBack(event.message || 'the worker failed')
    }
    worker.onmessageerror = () => fallBack('a message from the worker could not be read')

    post(
      {
        type: 'start',
        canvas: offscreen,
        ...backing(),
        config: drawConfig(),
        quiet,
        reducedMotion: options.reducedMotion === true,
        dotIdle: options.dotIdle !== false,
        load,
        readiness,
        hidden: doc.hidden,
      },
      [offscreen],
    )
    observer?.observe(canvas)

    return {
      mark: canvas,
      replay: () => post({ type: 'replay', generation: ++generation }),
      snapToEnd: () => post({ type: 'snap', generation: ++generation }),
      configure: () => post({ type: 'config', config: drawConfig() }),
      unquiet: () => post({ type: 'unquiet' }),
      destroy: release,
    }
  }

  let engine: DrawEngine = (canDrawOffThread() && createCanvasEngine()) || createSvgEngine()

  return {
    root,
    get mark() {
      return engine.mark
    },
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
      engine.mark.style.setProperty('--intro-scale', String(scale))
    },
    setWarp(blurPx, stretch) {
      engine.mark.style.filter = blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : ''
      engine.mark.style.setProperty('--intro-warp', String(1 + stretch))
    },
    isVisible: () => engine.mark.style.visibility !== 'hidden',
    setVisible(visible) {
      // Anyone showing the mark by hand has ended the quiet wait's claim on it.
      if (visible) {
        quiet = false
        engine.unquiet()
      }
      engine.mark.style.visibility = visible ? 'visible' : 'hidden'
      // The caption belongs to the drawing, so a seek that hides one hides both.
      if (!visible) caption.classList.remove('is-visible')
    },
    snapToEnd() {
      done = true
      holding = false
      current = 1
      engine.snapToEnd()
    },
    getConfig: () => ({ ...cfg }),
    setConfig(next) {
      cfg = { ...cfg, ...next }
      engine.mark.style.setProperty('--intro-base', String(cfg.introSize))
      timeline = layoutStages(cfg)
      // The zone boundaries move with the weights, so the playhead's limits
      // must follow — otherwise Zone C stays gated at the old position and the
      // fill unlocks early or never. Updated in place, never rebuilt: a rebuild
      // would reset `elapsed` and restart the minimum duration on every edit.
      engine.configure()
    },
    replay() {
      current = 0
      holding = false
      done = false
      // A replay is asked for by someone who wants to SEE it.
      quiet = false
      trace.length = 0
      const mark = engine.mark
      mark.style.removeProperty('--intro-scale')
      mark.style.removeProperty('--intro-warp')
      mark.style.filter = ''
      mark.style.visibility = 'visible'
      engine.replay()
    },
    destroy() {
      engine.destroy()
      root.remove()
    },
    trace,
    setTrace(on) {
      tracing = on
      if (!on) trace.length = 0
    },
  }
}
