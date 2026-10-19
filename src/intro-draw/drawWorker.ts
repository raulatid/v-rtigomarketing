// P0 drawn into an OffscreenCanvas, off the main thread (ADR 016 item 3).
//
// The SVG drawing animates on the same thread as the boot's work, so every long
// task froze the stroke the visitor was watching. Here the drawing keeps its own
// frame loop: the main thread posts progress and readiness when they change, and
// a 300 ms stall over there leaves this running on the last values it sent.
//
// Same policy and choreography as the SVG (drawLoop.ts, drawPose.ts), so the two
// cannot drift; only the painting is this file's own. Imports nothing outside
// intro-draw, like the boot entry that starts it.

import { ARC_D, DEPTH_VERTICES, FILL_D, OVERDRAW, VIEWBOX, V_D } from './isotype'
import { DRAW_TIMING, type DrawConfig } from './drawConfig'
import { layoutStages } from './stageLayout'
import { createDrawLoop, playheadLimits, type DrawTick } from './drawLoop'
import { isoOffset, markPose, type MarkPose } from './drawPose'
import { samplePathData } from './pathGeometry'
import type { Readiness } from './playhead'

export type ToDrawWorker =
  | {
      type: 'start'
      canvas: OffscreenCanvas
      /** Backing-store size in device pixels. */
      width: number
      height: number
      config: DrawConfig
      quiet: boolean
      reducedMotion: boolean
      dotIdle: boolean
      load: number
      readiness: Readiness
      hidden: boolean
    }
  | { type: 'inputs'; load: number; readiness: Readiness }
  | { type: 'size'; width: number; height: number }
  | { type: 'hidden'; hidden: boolean }
  | { type: 'config'; config: DrawConfig }
  /** `generation` lets the host drop frames posted before it asked. */
  | { type: 'replay'; generation: number }
  | { type: 'snap'; generation: number }
  | { type: 'unquiet' }

export type FromDrawWorker =
  | { type: 'frame'; generation: number; tick: DrawTick }
  /** The first painted frame, as an epoch time in ms (timeOrigin + now). */
  | { type: 'painted'; at: number }
  /** No 2D context here. The host draws the SVG instead. */
  | { type: 'unsupported' }

// The DOM lib types `self` as a Window; this is the part of a dedicated
// worker's scope the file uses.
interface DrawWorkerScope {
  postMessage(message: FromDrawWorker): void
  onmessage: ((event: MessageEvent<ToDrawWorker>) => void) | null
  requestAnimationFrame?: (callback: (now: number) => void) => number
  cancelAnimationFrame?: (handle: number) => void
}
const scope = self as unknown as DrawWorkerScope

// Not every browser that has OffscreenCanvas has rAF in a worker. A timer at
// the display's usual rate is a worse clock, never a wrong one: the playhead
// spends measured time, not frames.
const requestFrame =
  scope.requestAnimationFrame?.bind(scope) ??
  ((callback: (now: number) => void) => setTimeout(() => callback(performance.now()), 1000 / 60) as unknown as number)
const cancelFrame =
  scope.cancelAnimationFrame?.bind(scope) ?? ((handle: number) => clearTimeout(handle))

const V_PATH = new Path2D(V_D)
const ARC_PATH = new Path2D(ARC_D)
const FILL_PATH = new Path2D(FILL_D)
const paths = { v: samplePathData(V_D), arc: samplePathData(ARC_D) }

// The SVG's stroke classes, in viewBox units.
const STROKE = { front: 2.5, back: 1.75, depth: 1.25 }
const ALPHA = { back: 0.85, depth: 0.6 }

let canvas: OffscreenCanvas
let ctx: OffscreenCanvasRenderingContext2D
// The isometric construction fades as one group in the SVG, so where its
// strokes overlap they must not double up here either: drawn to a layer, then
// composited at the group's opacity.
let layer: OffscreenCanvas
let layerCtx: OffscreenCanvasRenderingContext2D
let cfg: DrawConfig
let timeline: ReturnType<typeof layoutStages>
let loop: ReturnType<typeof createDrawLoop>

let load = 0
let readiness: Readiness = 'starting'
let hidden = false
let resumed = false
let generation = 0
let raf = 0
let lastNow = 0
let current = 0
let pulse: number | null = null
let painted = false

/** A stroke drawn along `fraction` of its length, as the SVG's dash offset does. */
function strokePart(g: OffscreenCanvasRenderingContext2D, path: Path2D, length: number, fraction: number) {
  if (fraction <= 0) return
  // Visible length then a gap at least as long as the path: robust to the
  // flattened length running a hair short of the browser's own.
  g.setLineDash(fraction >= 1 ? [] : [length * fraction, length])
  g.stroke(path)
}

function paintIso(g: OffscreenCanvasRenderingContext2D, pose: MarkPose, alpha: number) {
  const offset = isoOffset(cfg)
  g.save()
  g.translate(pose.iso.x, pose.iso.y)

  g.save()
  g.translate(offset.x, offset.y)
  g.lineWidth = STROKE.back
  g.globalAlpha = ALPHA.back * alpha
  strokePart(g, V_PATH, paths.v.length, pose.back[0])
  strokePart(g, ARC_PATH, paths.arc.length, pose.back[1])
  g.restore()

  g.setLineDash([])
  g.lineWidth = STROKE.depth
  g.globalAlpha = ALPHA.depth * alpha
  g.beginPath()
  DEPTH_VERTICES.forEach(([x, y], i) => {
    const t = pose.edges[i]
    if (t <= 0) return
    g.moveTo(x, y)
    g.lineTo(x + offset.x * t, y + offset.y * t)
  })
  g.stroke()
  g.restore()
}

function prepare(g: OffscreenCanvasRenderingContext2D, target: OffscreenCanvas) {
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, target.width, target.height)
  const s = target.width / (VIEWBOX.width + 2 * OVERDRAW)
  g.setTransform(s, 0, 0, s, OVERDRAW * s, OVERDRAW * s)
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineCap = 'round'
  g.lineJoin = 'round'
}

function paint() {
  const pose = markPose(current, cfg, timeline, paths)
  prepare(ctx, canvas)

  if (pose.iso.opacity > 0) {
    if (pose.iso.opacity >= 1) {
      paintIso(ctx, pose, 1)
    } else {
      prepare(layerCtx, layer)
      paintIso(layerCtx, pose, 1)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = pose.iso.opacity
      ctx.drawImage(layer, 0, 0)
      ctx.restore()
    }
  }

  ctx.lineWidth = STROKE.front
  ctx.globalAlpha = pose.outlineOpacity
  strokePart(ctx, V_PATH, paths.v.length, pose.v)
  strokePart(ctx, ARC_PATH, paths.arc.length, pose.arc)

  if (pose.fill > 0) {
    ctx.globalAlpha = pose.fill
    ctx.fill(FILL_PATH)
  }

  const dotAlpha = pulse === null ? pose.dot.alpha : Math.max(pose.dot.alpha, DRAW_TIMING.pulseMinAlpha) * pulse
  if (dotAlpha > 0) {
    ctx.globalAlpha = dotAlpha
    ctx.beginPath()
    ctx.arc(pose.dot.x, pose.dot.y, pose.dot.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  if (!painted) {
    painted = true
    scope.postMessage({ type: 'painted', at: performance.timeOrigin + performance.now() })
  }
}

function frame(now: number) {
  raf = requestFrame(frame)
  // Visible time only, as introDraw's SVG loop measures it: nothing is spent
  // while the tab is hidden, and the frame that resumes contributes nothing.
  if (hidden) {
    lastNow = now
    return
  }
  const raw = lastNow && !resumed ? (now - lastNow) / 1000 : 0
  resumed = false
  lastNow = now

  const tick = loop.tick(raw, load, readiness)
  current = tick.visual
  pulse = tick.pulse
  paint()
  if (tick.done) stop()
  scope.postMessage({ type: 'frame', generation, tick })
}

function start() {
  if (raf) return
  lastNow = 0
  raf = requestFrame(frame)
}

function stop() {
  if (raf) cancelFrame(raf)
  raf = 0
}

function resize(width: number, height: number) {
  canvas.width = layer.width = Math.max(1, Math.round(width))
  canvas.height = layer.height = Math.max(1, Math.round(height))
}

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case 'start': {
      canvas = data.canvas
      const context = canvas.getContext('2d')
      layer = new OffscreenCanvas(1, 1)
      const layerContext = layer.getContext('2d')
      if (!context || !layerContext) {
        scope.postMessage({ type: 'unsupported' })
        return
      }
      ctx = context
      layerCtx = layerContext
      cfg = data.config
      timeline = layoutStages(cfg)
      loop = createDrawLoop({
        limits: playheadLimits(timeline.preReadyLimit),
        quiet: data.quiet,
        reducedMotion: data.reducedMotion,
        dotIdle: data.dotIdle,
      })
      load = data.load
      readiness = data.readiness
      hidden = data.hidden
      resize(data.width, data.height)
      current = data.reducedMotion ? timeline.preReadyLimit : 0
      paint()
      start()
      break
    }
    case 'inputs':
      load = data.load
      readiness = data.readiness
      break
    case 'size':
      resize(data.width, data.height)
      paint()
      break
    case 'hidden':
      if (hidden && !data.hidden) resumed = true
      hidden = data.hidden
      break
    case 'config':
      cfg = data.config
      timeline = layoutStages(cfg)
      // The zone boundaries move with the weights, so the playhead's limits
      // must follow — otherwise Zone C stays gated at the old position and the
      // fill unlocks early or never.
      loop.setLimits(playheadLimits(timeline.preReadyLimit))
      paint()
      break
    case 'replay':
      stop()
      generation = data.generation
      loop.reset()
      resumed = false
      current = 0
      pulse = null
      paint()
      start()
      break
    case 'snap':
      stop()
      generation = data.generation
      current = 1
      pulse = null
      paint()
      break
    case 'unquiet':
      loop.unquiet()
      break
  }
}
