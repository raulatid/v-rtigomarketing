import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultIntroConfig, IntroConfig, Phase, PHASE_ORDER } from './introConfig'
import { createSequenceState } from './sequenceState'
import { LazyScene } from './components/LazyScene'
import { CasePanel } from './components/CasePanel'
import { AuditSection } from './components/AuditSection'
import { InteractionHandle } from './components/InteractionLayer'
import { DebugOverlay } from './components/DebugOverlay'
import { CustomCursor } from './components/CustomCursor'
import { OrbitSystem } from './orbit-system/createOrbitSystem'
import { SatelliteDef } from './orbit-system/orbitConfig'
import { useMasterTimeline, CornerLogoHandle } from './hooks/useMasterTimeline'
import { useIntroDraw } from './hooks/useIntroDraw'
import type { CornerLogo } from './corner-logo/createCornerLogo'
import type { ExperienceId } from './app/experience'
import type { MurciaExperience } from './experiences/murcia/MurciaExperience'

// The debug panel lives on its own path (/debug) so the main site can be
// reviewed clean; open http://localhost:5173/debug during development to tune.
// Read once — navigating between the two is a full page load anyway.
const DEBUG_MODE = window.location.pathname.replace(/\/+$/, '') === '/debug'

export default function App() {
  const [config, setConfig] = useState<IntroConfig>(defaultIntroConfig)
  const [replayKey, setReplayKey] = useState(0)

  // Mutated in place by the timeline and read by the render loop — never a
  // React render per frame (plan 002 §1.2).
  const state = useMemo(() => createSequenceState(), [])

  const overlayRef = useRef<HTMLDivElement>(null)

  // Selection is a discrete event, so React state is the right home for it —
  // unlike hover, which is per-frame and stays in the interaction controller.
  const [selectedCase, setSelectedCase] = useState<SatelliteDef | null>(null)
  const orbitSystemRef = useRef<OrbitSystem | null>(null)
  const interactionRef = useRef<InteractionHandle | null>(null)

  // P0. Adopts the drawing boot.ts already started, so React mounting does not
  // restart it — see hooks/useIntroDraw.ts.
  const { intro, complete: drawComplete } = useIntroDraw(config, replayKey)

  const handleLoadFailed = useCallback(() => {
    // A scale-through-zero crossover hides nothing if the model never arrives.
    // Leave the 2D mark on screen rather than collapsing it into an empty frame.
    console.warn('[app] corner logo unavailable — holding the 2D isotype')
  }, [])

  // The logo instance is built inside the Canvas by CornerLogoLayer — it needs
  // the shared renderer (ADR 002). App owns the refs because replay and seek
  // drive reset()/snapToCorner() from here.
  const logoRef = useRef<CornerLogo | null>(null)
  const cornerLogo = useRef<CornerLogoHandle | null>(null)

  // Which experience is showing. Both stay mounted; this only decides which one
  // renders and consumes input (ADR 003). P6 gives this a setter — until then
  // Earth is the only experience, so the value never changes and every gate
  // added in P3 is behaviour-preserving.
  const [activeExperience] = useState<ExperienceId>('earth')

  // Murcia stays mounted alongside Earth; P6 gives the transition its setter.
  const murciaRef = useRef<MurciaExperience | null>(null)

  const { phase, timeline } = useMasterTimeline({
    intro,
    config,
    state,
    cornerLogo,
    replayKey,
    drawComplete,
  })

  const handleReplay = useCallback(() => {
    logoRef.current?.reset()
    setReplayKey((k) => k + 1)
  }, [logoRef])

  // GSAP's seek() suppresses callbacks by default, which would skip every
  // setPhase() and the crossover's substitution. Pass suppressEvents=false and
  // reconcile the imperative state (SVG visibility, logo pose) by hand, since
  // tweens rewind but direct style writes do not.
  const handleSeek = useCallback(
    (label: string) => {
      const draw = intro.current
      const target = PHASE_ORDER.indexOf(label as Phase)

      // 'draw' is no longer a segment of the master timeline — it is the
      // progress-driven module. Seeking to it means replaying that, which then
      // hands back to the timeline at `shrink` exactly as a cold load does.
      if (label === 'draw') {
        logoRef.current?.reset()
        state.swapOverlay = 0
        state.orbitsStarted = false
        setReplayKey((k) => k + 1)
        return
      }

      const tl = timeline.current
      if (!tl) return

      const afterSwap = target >= PHASE_ORDER.indexOf('corner')

      // Seeking into or past the orbit phase must set the flag the reveal gates
      // on, since the timeline's own .call() only fires when played through.
      state.orbitsStarted = target >= PHASE_ORDER.indexOf('orbits')

      if (afterSwap) {
        logoRef.current?.snapToCorner()
        draw?.setVisible(false)
      } else {
        logoRef.current?.reset()
        // Tweens rewind but the draw's imperative writes do not, so restore the
        // finished mark by hand — same reconciliation the old SVG needed.
        draw?.snapToEnd()
        draw?.setVisible(true)
        draw?.setScale(1)
        draw?.setWarp(0, 0)
        state.swapOverlay = 0
      }

      tl.seek(label, false)
      tl.play()
    },
    [timeline, logoRef, intro, state],
  )

  const handleSkip = useCallback(() => handleSeek('site'), [handleSeek])

  const handleDeselectCase = useCallback(() => setSelectedCase(null), [])

  // Mirrors the audit section's open state so the global Escape handler can
  // stand down while the section owns that key. Opening the audit also clears
  // any focused satellite — its close-up composition assumes the full viewport,
  // and two overlapping panels would compete for the remaining strip.
  const [auditOpen, setAuditOpen] = useState(false)
  const handleAuditOpenChange = useCallback((open: boolean) => {
    setAuditOpen(open)
    if (open) {
      interactionRef.current?.deselect()
      setSelectedCase(null)
    }
  }, [])

  // The ✕ goes through the interaction controller rather than just clearing
  // state, so the camera returns to overview and the satellite resumes its
  // orbit — closing the panel is a deselect, not a hide.
  const handleClosePanel = useCallback(() => {
    interactionRef.current?.deselect()
    setSelectedCase(null)
  }, [])

  // Escape or a click anywhere skips to the end state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes an open case panel before it means "skip the intro" —
      // a viewer dismissing a panel does not expect that to restart anything.
      // The interaction controller handles that case; this only sees the rest.
      // Same for an open audit section, which owns Escape while visible.
      if (e.key === 'Escape' && !selectedCase && !auditOpen) handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip, selectedCase, auditOpen])

  return (
    <div className="app">
      <LazyScene
        config={config}
        state={state}
        overlayEl={overlayRef}
        orbitSystemRef={orbitSystemRef}
        interactionRef={interactionRef}
        logoRef={logoRef}
        cornerLogoHandleRef={cornerLogo}
        activeExperience={activeExperience}
        murciaRef={murciaRef}
        onSelectCase={setSelectedCase}
        onDeselectCase={handleDeselectCase}
        onLogoLoadFailed={handleLoadFailed}
      />

      {/* The intro drawing is NOT rendered by React — intro-draw owns its own
          DOM and has usually been animating since before this component
          mounted. React only relays config edits and replays into it. */}

      <div className="warp-overlay" ref={overlayRef} />

      <CasePanel data={selectedCase} onClose={handleClosePanel} />

      {/* The trigger only exists once the intro has fully landed — satellites
          revealed and the timeline at 'site'. Before that the scene offers no
          interaction chrome at all. */}
      <AuditSection onOpenChange={handleAuditOpenChange} ready={phase === 'site'} />

      <CustomCursor />

      {DEBUG_MODE && (
        <DebugOverlay
          config={config}
          phase={phase}
          onChange={setConfig}
          onReplay={handleReplay}
          onSeek={handleSeek}
          onSkip={handleSkip}
          timeline={timeline}
        />
      )}
    </div>
  )
}
