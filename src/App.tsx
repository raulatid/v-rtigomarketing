import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultIntroConfig, IntroConfig, Phase, PHASE_ORDER } from './experiences/earth/config/introConfig'
import { createSequenceState } from './experiences/earth/config/sequenceState'
import { LazyScene } from './components/LazyScene'
import { CasePanel } from './components/CasePanel'
import { AuditSection } from './components/AuditSection'
import { ContactSection } from './components/ContactSection'
import { LegalPanel } from './components/LegalPanel'
import { SiteFooter } from './components/SiteFooter'
import type { LegalDocId } from './content/site'
import { InteractionHandle } from './experiences/earth/interaction/InteractionLayer'
import { DebugOverlay } from './components/DebugOverlay'
import { CustomCursor } from './components/CustomCursor'
import { NavigationRail } from './components/NavigationRail'
import { OrbitSystem } from './experiences/earth/orbit/createOrbitSystem'
import type { SatelliteDef } from './experiences/earth/orbit/orbitConfig'
import { orbitAssignments } from './experiences/earth/orbit/orbitAssignments'
import { useMasterTimeline, CornerLogoHandle } from './experiences/earth/timeline/useMasterTimeline'
import { useIntroDraw } from './experiences/earth/timeline/useIntroDraw'
import type { CornerLogo } from './corner-logo/createCornerLogo'
import type { ExperienceId } from './app/experience'
import type { MurciaExperience } from './experiences/murcia/MurciaExperience'
import { useExperienceTransition } from './app/useExperienceTransition'
import { useSceneNavigation } from './app/navigation/useSceneNavigation'
import { atOrAfter } from './experiences/earth/config/sceneVisibility'
import { DEBUG_TOOLS_ENABLED } from './app/buildFlags'
import { loadProgress } from './loading/progress'

// The debug panel lives on its own path (/debug) so the main site can be
// reviewed clean; open http://localhost:5173/debug during development to tune.
// Read once — navigating between the two is a full page load anyway.
//
// AND never in production. `vercel.json` rewrites /debug to the app, so without
// the build-time flag this 210-line tuning console was a live, unlisted page on
// the public marketing site. Preview deployments keep it, which is where it is
// actually wanted: real hardware, real network, nobody watching.
//
// The flag is a compile-time literal, so in a production build this is `false &&
// ...` and the whole DebugOverlay import is dropped by the minifier — which the
// app entry chunk needs, sitting at 94% of its hard budget.
const DEBUG_MODE =
  DEBUG_TOOLS_ENABLED && window.location.pathname.replace(/\/+$/, '') === '/debug'

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

  // The WebGL context went away. Application-level fatal state (ARCHITECTURE
  // §23), which is why it is held here rather than inside the pipeline that
  // detected it.
  //
  // Two surfaces are needed, not one, because the timing decides which is on
  // screen. Before handover the drawing is still running its own loop and reads
  // readiness every frame, so `markFatal` reaches the visitor through the
  // Spanish caption it already owns. After handover that loop has stopped, and
  // marking fatal would latch a state nothing repaints — so the notice below is
  // the only thing that would be seen. Doing both costs one boolean and covers
  // the whole session.
  const [contextLost, setContextLost] = useState(false)

  const handleContextLost = useCallback((reason: string) => {
    console.error(`[app] ${reason}`)
    loadProgress.markFatal('chunk:scene', reason)
    setContextLost(true)
  }, [])

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
  // renders and consumes input (ADR 003).
  const [activeExperience, setActiveExperience] = useState<ExperienceId>('earth')
  const earthActive = activeExperience === 'earth'

  // Murcia stays mounted alongside Earth — the transition swaps which scene
  // renders, it never builds or tears one down (ADR 003).
  const murciaRef = useRef<MurciaExperience | null>(null)
  const [murciaReady, setMurciaReady] = useState(false)
  const handleMurciaReady = useCallback(() => setMurciaReady(true), [])

  // Declared before the transition so `onSettled` can reach it, and assigned
  // after — the two are mutually recursive by nature: a commit starts a warp, and
  // the warp ending is what releases the input lock.
  const navigationRef = useRef<HTMLDivElement>(null)
  const settleNavigationRef = useRef<() => void>(() => {})

  const { transitionTo, transitioning } = useExperienceTransition({
    state,
    onSwap: setActiveExperience,
    // The REAL end of the warp, not the `transitioning` flag, which lands a
    // render later — long enough for a trackpad momentum tail to be accepted.
    onSettled: () => settleNavigationRef.current(),
  })

  // Mirrors the audit section's open state so the global Escape handler can
  // stand down while the section owns that key, and so the destination guard
  // below can see it. Opening the audit also clears any focused satellite — its
  // close-up composition assumes the full viewport, and two overlapping panels
  // would compete for the remaining strip.
  //
  // Read by the navigation suppression predicate below: the globe offers no way
  // out while this panel is open.
  const [auditOpen, setAuditOpen] = useState(false)
  const handleAuditOpenChange = useCallback((open: boolean) => {
    setAuditOpen(open)
    if (open) {
      interactionRef.current?.deselect()
      setSelectedCase(null)
    }
  }, [])

  // The contact dialog and the legal panels, mirrored here for the same two
  // reasons as auditOpen: the global Escape handler stands down while any of
  // them owns the key, and the navigation predicate below refuses a warp
  // while something has the viewer's attention.
  const [contactOpen, setContactOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null)

  // A legal panel left open across a warp would be a Murcia overlay nobody
  // asked for; the contact dialog closes itself through its active prop.
  useEffect(() => {
    if (!earthActive) setLegalDoc(null)
  }, [earthActive])

  const { phase, timeline } = useMasterTimeline({
    intro,
    config,
    state,
    cornerLogo,
    replayKey,
    drawComplete,
    // The assignment table, not the content: how many orbits the scene reveals
    // is a composition decision, and every entry is guaranteed to resolve (an
    // unresolvable one fails the build — see resolveOrbitCases). Importing the
    // table here costs a few dozen bytes; importing the content would cost the
    // entry chunk every case study's prose.
    satelliteCount: orbitAssignments.length,
  })

  // Gesture navigation. The gesture is the way in AND the way out now: the Spain
  // marker no longer navigates and the return button is gone (`adr/009`).
  //
  // `getContext` is called at every event and again at the commit, never sampled
  // once when a gesture begins: a district can open between the last event of a
  // gesture and the frame that commits it.
  //
  // The two that MUST be live are read live — `state.phase` off the mutable sequence
  // state, and `hasFocusedDistrict` straight off the Murcia instance. The rest are
  // React state and therefore a render behind, which is tolerable only because none
  // of them is the input lock: that is the navigation machine's own `locked` phase,
  // entered synchronously on the committing event. `!transitioning` here is a second
  // guard, not the one doing the work.
  const {
    settle: settleNavigation,
    reset: resetNavigation,
    contextChanged: navigationContextChanged,
  } = useSceneNavigation({
    railRef: navigationRef,
    getContext: () => ({
      current: activeExperience,
      canNavigate:
        // Never drop the viewer into a world that has not finished building.
        murciaReady &&
        !transitioning &&
        // The intro owns the camera until `site`; a rail filling over it would
        // promise something that cannot happen yet.
        atOrAfter(state.phase, 'site') &&
        // Something already has the viewer's attention. Close it first — a focus
        // flight and a warp must never run at once, and this is what makes that
        // combination unreachable rather than merely guarded.
        !auditOpen &&
        !contactOpen &&
        !legalDoc &&
        !selectedCase &&
        !murciaRef.current?.hasFocusedDistrict,
    }),
    onCommit: (intent) => transitionTo(intent === 'enter-murcia' ? 'murcia' : 'earth'),
  })
  settleNavigationRef.current = settleNavigation

  // Seeking moves the intro phase, backwards included, and a gesture accumulated
  // against the old phase would survive into one where navigation is refused.
  useEffect(() => {
    resetNavigation()
  }, [phase, resetNavigation])

  // The rail derives its visual state from `canNavigate`, and the navigation
  // input's frame loop only runs mid-gesture — so every React-visible input of
  // that context must NOTIFY on change, or an idle rail keeps advertising a
  // navigation the context refuses (it used to sit fully visible behind every
  // open panel). The imperative input — a Murcia district engaging — notifies
  // through onMurciaAttentionChange below; the intro phase is covered by the
  // reset above.
  useEffect(() => {
    navigationContextChanged()
  }, [
    auditOpen,
    contactOpen,
    legalDoc,
    selectedCase,
    murciaReady,
    transitioning,
    navigationContextChanged,
  ])

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
      // Murcia owns Escape while it is showing — its districts close on it.
      // Skipping an intro the viewer has already finished would also be
      // meaningless there.
      if (!earthActive) return
      if (e.key === 'Escape' && !selectedCase && !auditOpen && !contactOpen && !legalDoc)
        handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip, selectedCase, auditOpen, contactOpen, legalDoc, earthActive])

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
        onMurciaReady={handleMurciaReady}
        onMurciaAttentionChange={navigationContextChanged}
        onContextLost={handleContextLost}
      />

      {/* The intro drawing is NOT rendered by React — intro-draw owns its own
          DOM and has usually been animating since before this component
          mounted. React only relays config edits and replays into it. */}

      <div className="warp-overlay" ref={overlayRef} />

      <CasePanel data={earthActive ? selectedCase : null} onClose={handleClosePanel} />

      {/* The trigger only exists once the intro has fully landed — satellites
          revealed and the timeline at 'site'. Before that the scene offers no
          interaction chrome at all. */}
      <AuditSection
        onOpenChange={handleAuditOpenChange}
        ready={phase === 'site' && earthActive}
        active={earthActive}
      />

      {/* The quiet sibling of the audit CTA and the site's floor line. Both
          gate on the same expression as the audit trigger — chrome exists only
          once the intro has landed, and only over Earth (DECISIONS §26.16). */}
      <ContactSection
        ready={phase === 'site' && earthActive}
        active={earthActive}
        suppressed={auditOpen}
        onOpenChange={setContactOpen}
        onOpenLegal={setLegalDoc}
      />

      {phase === 'site' && earthActive && <SiteFooter onOpenLegal={setLegalDoc} />}

      <LegalPanel doc={legalDoc} onClose={() => setLegalDoc(null)} />

      {/* Mounted for both experiences, and never gated on one: unmounting it
          strips the `cursor: none` rule it installs, which hands the viewer the
          native arrow back mid-session. The two experiences cannot fight over
          the cursor because neither writes it directly — each owns a cursor
          manager whose arbitrated result arrives here through cursorSignal. */}
      <CustomCursor />

      {/* BOTH directions are this one control now (`adr/009`). The Spain marker
          is still on the globe and still the warp's aim target, but it no longer
          navigates; the return button is deleted.

          It reverses DECISIONS §15, which ruled scroll out because an accidental
          one would warp the viewer to another world. That objection is answered by
          the accumulator rather than dismissed: a single event cannot navigate, and
          an abandoned gesture decays back to nothing.

          Mounted for both experiences and never gated on one. Unmounting it would
          tear down the wheel listener with it, and that listener is the only thing
          stopping the page scrolling behind the canvas. */}
      <NavigationRail ref={navigationRef} label="Navegar entre la Tierra y Murcia" />

      {/* The context is gone and nothing will draw again. Spanish, like every
          other visitor-facing string (DECISIONS §11), and it offers the only
          action that actually works — see contextLoss.ts on why this is a
          notice rather than a recovery. */}
      {contextLost && (
        <div className="context-lost" role="alert">
          <h2 className="context-lost__title">Se ha interrumpido la experiencia</h2>
          <p className="context-lost__body">
            El navegador ha liberado los recursos gráficos, normalmente por falta de memoria.
            Recarga la página para continuar.
          </p>
          <button
            type="button"
            className="context-lost__action"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      )}

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
