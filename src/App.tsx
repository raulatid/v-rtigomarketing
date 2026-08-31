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
import { NavigationControl } from './components/NavigationControl'
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
import { useRoute } from './app/useRoute'
import { LazyBlog } from './components/LazyBlog'

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

  // Which page the URL names. The blog is a route, not a panel: it has its own
  // URL, its own history entries and its own document when opened cold
  // (`adr/013`).
  //
  // `<LazyScene>` below is NOT conditional on this and must never become so.
  // Unmounting it would destroy the GL context, dispose the composer, tear down
  // the city and release the shared Draco/KTX2 pools — the exact rebuild ADR 003
  // exists to prevent. The blog suspends the scene; it never replaces it.
  const nav = useRoute()
  const blogOpen = nav.route.name !== 'site'

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

  const { transitionTo, transitioning, scrub } = useExperienceTransition({
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
    rootRef: navigationRef,
    getContext: () => ({
      current: activeExperience,
      canNavigate:
        // The blog owns the viewport. A gesture accumulating behind it would
        // warp a reader who is four paragraphs into an article.
        !blogOpen &&
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
    // The scene IS the progress indicator now. The gesture drives the departing
    // half of the real warp, reversibly, and the cinematic picks up from
    // wherever it left the camera (`scrub` in useExperienceTransition).
    onProgress: scrub,
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
    blogOpen,
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

  /**
   * Opening the blog from the city.
   *
   * Guarded here rather than upstream. The CTA is a BUILDING in the scene, not a
   * control inside a panel, so nothing refuses a tap that lands mid-warp the way
   * `canNavigate` does for the panels — and `murciaReady` is checked because a
   * handler should not assume the city exists just because a mesh in it was hit.
   */
  const handleOpenBlog = useCallback(() => {
    if (transitioning || !murciaReady) return
    nav.openBlogIndex()
  }, [transitioning, murciaReady, nav])

  /**
   * Leaving the blog, warm.
   *
   * `history.back()` and nothing else: it changes the URL, the popstate listener
   * in `useRoute` parses it, and the scene un-suspends from that one path.
   * Setting the route here as well would drive the same transition twice, once
   * from a URL that had not changed yet.
   *
   * The fallback covers a blog reached without a push — which cannot happen in
   * this host today, since `index.html` only ever gets here through
   * `openBlogIndex`, but a silent no-op would strand the reader if it ever did.
   */
  const handleExitBlog = useCallback(() => {
    if (!nav.exitToSceneByHistory()) window.location.assign('/')
  }, [nav])

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
      // The blog owns Escape while it is open, and skipping an intro from
      // behind a reading page would be meaningless anyway.
      if (blogOpen) return
      if (!earthActive) return
      if (e.key === 'Escape' && !selectedCase && !auditOpen && !contactOpen && !legalDoc)
        handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip, selectedCase, auditOpen, contactOpen, legalDoc, earthActive, blogOpen])

  return (
    <div className="app">
      {/* THE SCENE WRAPPER, and every word of this is load-bearing.

          PERMANENTLY PRESENT. Never rendered conditionally, never keyed. A
          wrapper that appears and disappears remounts its subtree, and
          remounting this subtree is the rebuild ADR 003 exists to prevent.

          HIDDEN WITH `visibility`, never `display: none`. R3F measures its inner
          container with a ResizeObserver; a collapsed box measures 0x0, which
          flows into gl.setSize(0, 0) — the drawing buffer is reallocated and the
          frozen frame destroyed — then composer.setSize(0, 0), which rebuilds
          five bloom mip targets, then MurciaLayer's setViewport with aspect 0,
          into the ground-footprint maths check:footprint exists to protect.
          `visibility` removes painting and hit-testing and leaves every layout
          box exactly where it was, so nothing measures and nothing resizes.

          WRAPS MORE THAN THE CANVAS. `.murcia-ui` is already inside
          `.scene-canvas` and needs nothing, but the warp overlay, the footer,
          the navigation rail and the audit/contact triggers are siblings of
          <LazyScene> and would otherwise paint over a reading page.

          `inert` is the accessibility half: without it the browser blurs
          whatever was focused in here to <body> and the reader loses their
          place, and a screen reader can still walk a scene nobody can see. */}
      <div className="app__scene" data-hidden={String(blogOpen)} inert={blogOpen}>
      <LazyScene
        suspended={blogOpen}
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
        onOpenBlog={handleOpenBlog}
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
        onOpenLegal={setLegalDoc}
      />

      {/* The quiet sibling of the audit CTA and the site's floor line, which
          now carries the brand mark alone: the phones moved into this dialog
          and the legal links into the audit panel (DECISIONS §30). Both gate
          on the same expression as the audit trigger — chrome exists only once
          the intro has landed, and only over Earth (DECISIONS §26.16). */}
      <ContactSection
        ready={phase === 'site' && earthActive}
        active={earthActive}
        suppressed={auditOpen}
        onOpenChange={setContactOpen}
        onOpenLegal={setLegalDoc}
      />

      {phase === 'site' && earthActive && <SiteFooter />}

      <LegalPanel doc={legalDoc} onClose={() => setLegalDoc(null)} />

      {/* Mounted for both experiences, and never gated on one: unmounting it
          strips the `cursor: none` rule it installs, which hands the viewer the
          native arrow back mid-session. The two experiences cannot fight over
          the cursor because neither writes it directly — each owns a cursor
          manager whose arbitrated result arrives here through cursorSignal.

          DISABLED — not unmounted — on the blog, which is the one place the
          paragraph above does not apply. `styles.css` sets
          `cursor: none !important` on every element while the custom cursor is
          running, so a 680px column of serif prose would have no I-beam and no
          visible text-selection affordance. The white ring is drawn for a dark
          canvas and cannot become a caret. Data-nulled through `enabled` rather
          than unmounted, matching CasePanel and LegalPanel, so the listeners and
          the rAF are torn down and rebuilt by the component's own effect. */}
      <CustomCursor enabled={!blogOpen} />

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
      <NavigationControl ref={navigationRef} />

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

      </div>

      {/* A sibling of the scene wrapper, never a child: it must stay visible
          and interactive while everything above is hidden and inert. */}
      <LazyBlog
        route={nav.route}
        host={{
          exitToScene: handleExitBlog,
          openPost: nav.openPost,
          returnToIndex: nav.returnToIndex,
          replaceTopic: nav.replaceTopic,
          rememberScroll: nav.rememberScroll,
          storedScrollTop: nav.storedScrollTop,
        }}
      />

      {/* Route-gated as well as build-gated: a viewer who opened the blog from
          /debug would otherwise get a 210-line tuning console at z 100 on top of
          an article. */}
      {DEBUG_MODE && !blogOpen && (
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
