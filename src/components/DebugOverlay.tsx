import { RefObject, useEffect, useRef, useState } from 'react'
import { defaultIntroConfig, IntroConfig, Phase, PHASE_ORDER } from '../experiences/earth/config/introConfig'

interface Props {
  config: IntroConfig
  phase: Phase
  onChange: (config: IntroConfig) => void
  onReplay: () => void
  onSeek: (label: string) => void
  onSkip: () => void
  timeline: RefObject<gsap.core.Timeline | null>
}

type Control = {
  key: keyof IntroConfig
  label: string
  min: number
  max: number
  step: number
  // Defaults to seconds — most controls are durations.
  unit?: string
}

const SECTIONS: Array<{ title: string; controls: Control[] }> = [
  {
    // P0 is driven by load progress, not by the clock, so these are RELATIVE
    // WEIGHTS: the draw's total is fixed (3s minimum, or however long loading
    // takes), and raising one stage shortens every other. `fillDuration` is the
    // exception — the fill plays on ready, at that literal duration.
    title: 'P0 draw — weights, not seconds',
    controls: [
      { key: 'introSize', label: 'Intro size', min: 8, max: 80, step: 1, unit: 'vmin' },
      { key: 'dotDuration', label: 'Dot in', min: 0.1, max: 2, step: 0.05, unit: 'w' },
      { key: 'dotMoveDuration', label: 'Dot move', min: 0.1, max: 2, step: 0.05, unit: 'w' },
      { key: 'drawDuration', label: 'V draw', min: 0.4, max: 4, step: 0.1, unit: 'w' },
      { key: 'arcDrawDuration', label: 'Arc draw', min: 0.2, max: 3, step: 0.05, unit: 'w' },
      { key: 'isoOffset', label: 'Isometric offset', min: 8, max: 60, step: 1, unit: 'px' },
      { key: 'isoDrawDuration', label: 'Back outline', min: 0.2, max: 3, step: 0.05, unit: 'w' },
      { key: 'depthDuration', label: 'Depth lines', min: 0.1, max: 2, step: 0.05, unit: 'w' },
      { key: 'collapseDuration', label: 'Collapse', min: 0.1, max: 2, step: 0.05, unit: 'w' },
      { key: 'fillDuration', label: 'Fill (real seconds)', min: 0.2, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'P1 shrink',
    controls: [
      { key: 'shrinkDuration', label: 'Shrink', min: 0.2, max: 3, step: 0.05 },
      { key: 'shrinkTargetSize', label: 'Target size', min: 2, max: 32, step: 0.5, unit: 'vmin' },
    ],
  },
  {
    title: 'P2 warp',
    controls: [
      { key: 'warpDuration', label: 'Warp', min: 0.8, max: 6, step: 0.1 },
      { key: 'normalFov', label: 'Normal FOV', min: 25, max: 70, step: 1, unit: '°' },
      { key: 'maxTravelFov', label: 'Travel FOV', min: 45, max: 120, step: 1, unit: '°' },
      { key: 'accelerationPower', label: 'Accel power', min: 1, max: 4, step: 0.1, unit: '' },
      { key: 'speedPeakWidth', label: 'Speed width', min: 0.1, max: 0.6, step: 0.02, unit: '' },
      { key: 'sceneSwapProgress', label: 'Cut point', min: 0.2, max: 0.8, step: 0.02, unit: '' },
      { key: 'overlayStrength', label: 'Overlay', min: 0, max: 1, step: 0.02, unit: '' },
      { key: 'motionBlurStrength', label: 'Motion blur', min: 0, max: 1, step: 0.02, unit: '' },
      { key: 'afterimageDampMax', label: 'Blur damp max', min: 0, max: 0.98, step: 0.02, unit: '' },
      { key: 'svgWarpBlur', label: 'SVG blur', min: 0, max: 20, step: 0.5, unit: 'px' },
      { key: 'svgWarpStretch', label: 'SVG stretch', min: 0, max: 1.5, step: 0.05, unit: '' },
      { key: 'starCount', label: 'Stars', min: 200, max: 6000, step: 100, unit: '' },
    ],
  },
  {
    title: 'P3 swap',
    controls: [
      { key: 'swapDuration', label: 'Swap', min: 0.2, max: 2, step: 0.05 },
      { key: 'swapCrossover', label: 'Crossover', min: 0.15, max: 0.85, step: 0.05, unit: '' },
      { key: 'swapFlashStrength', label: 'Flash', min: 0, max: 1, step: 0.05, unit: '' },
      { key: 'swapFlashWidth', label: 'Flash width', min: 0.02, max: 0.4, step: 0.01, unit: '' },
    ],
  },
  {
    title: 'P4 corner',
    controls: [
      { key: 'spinPauseBefore', label: 'Spin pause', min: 0, max: 1, step: 0.05 },
      { key: 'spinDuration', label: 'Spin', min: 0.4, max: 4, step: 0.1 },
      { key: 'toCornerDuration', label: 'Fly to corner', min: 0.3, max: 3, step: 0.05 },
      { key: 'cornerFramePadding', label: 'Logo framing', min: 6, max: 48, step: 0.5, unit: '×' },
      { key: 'cornerMarginX', label: 'Corner X', min: 8, max: 160, step: 2, unit: 'px' },
      { key: 'cornerMarginY', label: 'Corner Y', min: 8, max: 160, step: 2, unit: 'px' },
    ],
  },
  {
    title: 'P5 orbits',
    controls: [
      { key: 'orbitsStartOffset', label: 'Start after flight', min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'Space backdrop',
    controls: [
      { key: 'backdropStarCount', label: 'Star count', min: 400, max: 8000, step: 100, unit: '' },
      // Lower bound stays far above the camera's zoomMax (22) — below that the
      // shell stops enclosing the camera and stars appear over the Earth.
      { key: 'backdropRadius', label: 'Shell radius', min: 60, max: 400, step: 5, unit: 'u' },
      { key: 'backdropJitter', label: 'Depth jitter', min: 0, max: 0.5, step: 0.01, unit: '' },
      { key: 'backdropClusterStrength', label: 'Clumping', min: 0, max: 1, step: 0.05, unit: '' },
      { key: 'backdropTwinkle', label: 'Twinkle', min: 0, max: 0.6, step: 0.02, unit: '' },
      // All four are plain uniform writes against an already-loaded texture, so
      // unlike the baked cubemap these replaced, they are free to drag.
      { key: 'skyBrightness', label: 'Sky', min: 0, max: 2, step: 0.05, unit: '' },
      // The depth pair: contrast deepens the darks, brightness sets the level.
      // Raise both together to push the sky back without flattening it.
      { key: 'skyContrast', label: 'Sky contrast', min: 0.6, max: 2.2, step: 0.05, unit: '' },
      { key: 'skyBandWidth', label: 'Band width', min: 0.1, max: 0.8, step: 0.01, unit: '' },
      { key: 'skyBandTilt', label: 'Band tilt', min: -90, max: 90, step: 1, unit: 'deg' },
      { key: 'skyBandYaw', label: 'Band yaw', min: 0, max: 360, step: 2, unit: 'deg' },
    ],
  },
  {
    title: 'Bloom',
    controls: [
      // 0 disables the pass entirely rather than rendering a no-op, so this is
      // the performance escape hatch as well as the look control.
      { key: 'bloomStrength', label: 'Strength', min: 0, max: 1.5, step: 0.05, unit: '' },
      { key: 'bloomRadius', label: 'Radius', min: 0, max: 1, step: 0.05, unit: '' },
      // The one that matters. Below ~0.8 the Earth's day side starts hazing.
      { key: 'bloomThreshold', label: 'Threshold', min: 0, max: 2, step: 0.05, unit: '' },
    ],
  },
]

export function DebugOverlay({
  config,
  phase,
  onChange,
  onReplay,
  onSeek,
  onSkip,
  timeline,
}: Props) {
  // Rendered only on /debug, where the panel is the point — start open. The
  // toggle stays so it can be collapsed to view the scene unobstructed.
  const [open, setOpen] = useState(true)
  const [scrub, setScrub] = useState(0)
  const scrubbing = useRef(false)

  // Mirror timeline progress into the slider while it plays, but never fight
  // the user's drag.
  useEffect(() => {
    if (!open) return
    let id = 0
    const tick = () => {
      id = requestAnimationFrame(tick)
      const tl = timeline.current
      if (tl && !scrubbing.current) setScrub(tl.progress())
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [open, timeline])

  return (
    <div className="debug-overlay">
      <button className="debug-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close debug' : `Debug — ${phase}`}
      </button>
      {open && (
        <div className="debug-panel">
          <div className="debug-section">Timeline — {phase}</div>
          <div className="debug-phases">
            {PHASE_ORDER.map((p) => (
              <button key={p} data-active={p === phase} onClick={() => onSeek(p)}>
                {p}
              </button>
            ))}
          </div>

          <label className="debug-control">
            <span>Scrub: {(scrub * 100).toFixed(0)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrub}
              onPointerDown={() => {
                scrubbing.current = true
                timeline.current?.pause()
              }}
              onPointerUp={() => {
                scrubbing.current = false
              }}
              onChange={(e) => {
                const v = Number(e.target.value)
                setScrub(v)
                timeline.current?.progress(v)
              }}
            />
          </label>

          <div className="debug-actions">
            <button onClick={() => timeline.current?.play()}>Play</button>
            <button onClick={() => timeline.current?.pause()}>Pause</button>
            <button onClick={onSkip}>Skip</button>
          </div>

          {SECTIONS.map(({ title, controls }) => (
            <div key={title}>
              <div className="debug-section">{title}</div>
              {controls.map(({ key, label, min, max, step, unit = 's' }) => (
                <label key={key} className="debug-control">
                  <span>
                    {label}: {config[key]}
                    {unit}
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={config[key]}
                    onChange={(e) => onChange({ ...config, [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          ))}

          <div className="debug-actions">
            <button onClick={onReplay}>Replay</button>
            <button onClick={() => onChange(defaultIntroConfig())}>Reset</button>
          </div>
        </div>
      )}
    </div>
  )
}
