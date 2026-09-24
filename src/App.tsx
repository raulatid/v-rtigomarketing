import { createNavigationState } from './app/navigation/continuousState'
import { auditView } from './app/auditView'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { defaultIntroConfig, IntroConfig, Phase, PHASE_ORDER } from './experiences/earth/config/introConfig'
import { createSequenceState } from './experiences/earth/config/sequenceState'
import { LazyScene } from './components/LazyScene'
import { CasePanel } from './components/CasePanel'
import { AuditSection } from './components/AuditSection'
import { ContactSection } from './components/ContactSection'
import { SceneShortcuts } from './components/SceneShortcuts'
import { LegalPanel } from './components/LazyLegalPanel'
import { ConsentBanner } from './components/ConsentBanner'
import { CopyrightMark } from './components/CopyrightMark'
import { SiteMenuLayer, SiteMenuStage } from './components/SiteMenu'
import { SiteHeader } from './components/SiteHeader'
import type { LegalDocId } from './content/site'
import { InteractionHandle } from './experiences/earth/interaction/InteractionLayer'
import { DebugOverlay } from './components/DebugOverlay'
import { CustomCursor } from './components/CustomCursor'
import { NavigationControl } from './components/NavigationControl'
import { EarthHint } from './components/EarthHint'
import { MurciaHint } from './components/MurciaHint'
import { OrbitSystem } from './experiences/earth/orbit/createOrbitSystem'
import { ORBIT_PRESETS, type SatelliteDef } from './experiences/earth/orbit/orbitConfig'
import { useMasterTimeline } from './experiences/earth/timeline/useMasterTimeline'
import type { CornerLogoHandle } from './corner-logo/cornerLogoConfig'
import { useIntroDraw } from './experiences/earth/timeline/useIntroDraw'
import type { CornerLogo } from './corner-logo/createCornerLogo'
import { MENU_MOTION_MS, type HeaderMenuState } from './corner-logo/headerMenuTiming'
import { PROTO_MENU3D } from './app/protoMenu3d'
import type { ExperienceId } from './app/experience'
import type { MurciaExperience } from './experiences/murcia/MurciaExperience'
import { useExperienceTransition } from './app/useExperienceTransition'
import { crossfadeMusic, setMusicSuppressed, startMusic } from './app/audio/backgroundMusic'
import { SoundToggle } from './components/SoundToggle'
import { useSceneNavigation } from './app/navigation/useSceneNavigation'
import { useSceneShortcuts } from './app/useSceneShortcuts'
import { atOrAfter } from './experiences/earth/config/sceneVisibility'
import { DEBUG_TOOLS_ENABLED } from './platform/buildFlags'
import { canSkipTail } from './app/introSkip'
import { clearIntroSeen, markIntroSeen, readIntroSeen } from './app/introSeen'
import { hasConsent, subscribeConsent } from './app/consent'
import { loadProgress } from './loading/progress'
import { useRoute } from './app/useRoute'
import { LazyBlog, prefetchBlog } from './components/LazyBlog'

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
  const navigation = useMemo(() => createNavigationState(), [])
  const earthAttention = useMemo(() => ({ hintAllowed: false }), [])
  const murciaAttention = useMemo(() => ({ hintAllowed: false }), [])

  const overlayRef = useRef<HTMLDivElement>(null)

  // Selection is a discrete event, so React state is the right home for it —
  // unlike hover, which is per-frame and stays in the interaction controller.
  const [selectedCase, setSelectedCase] = useState<SatelliteDef | null>(null)
  const orbitSystemRef = useRef<OrbitSystem | null>(null)
  const interactionRef = useRef<InteractionHandle | null>(null)
  const getCaseLogoBottom = useCallback((id: string) => interactionRef.current?.getLogoBottom(id) ?? null, [])

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

  // Declared before the transition so `onSettled` and `onCut` can reach them, and
  // assigned after — the two are mutually recursive by nature: a commit starts a
  // warp, and the warp is what releases the input lock and clears the zoom.
  const navigationRef = useRef<HTMLDivElement>(null)
  const settleNavigationRef = useRef<() => void>(() => {})
  // The header's Servicios button waits on the same end, to fly into the campus.
  const shortcutsSettledRef = useRef<() => void>(() => {})
  const resetZoomRef = useRef<() => void>(() => {})

  const { transitionTo, transitioning, stepTransition } = useExperienceTransition({
    state: navigation,
    onSwap: setActiveExperience,
    // The REAL end of the warp, not the `transitioning` flag, which lands a
    // render later — long enough for a trackpad momentum tail to be accepted.
    onSettled: () => {
      settleNavigationRef.current()
      shortcutsSettledRef.current()
    },
    // The viewer's zoom belongs to the world they were in. Cleared on the cut's
    // frame, under full cover, alongside every other discontinuity (`adr/014`).
    onCut: () => resetZoomRef.current(),
    // The music crosses over from the commit, ahead of the picture's cut.
    onStart: crossfadeMusic,
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
  // The case panel's doorway into the audit. A counter the section watches,
  // so it keeps owning its own phase; opening it runs the deselect above.
  const [auditRequest, setAuditRequest] = useState(0)
  const handleRequestAudit = useCallback(() => setAuditRequest((n) => n + 1), [])

  // The contact dialog and the legal panels, mirrored here for the same two
  // reasons as auditOpen: the global Escape handler stands down while any of
  // them owns the key, and the navigation predicate below refuses a warp
  // while something has the viewer's attention.
  const [contactOpen, setContactOpen] = useState(false)
  // The phone menu in the header, as the phase the header reports. "Open" to
  // everything below is "not closed": it stays true through the card's way
  // back, so nothing slips in while the scene is still tilted. Escape folds
  // it, and must do only that.
  const [headerMenuState, setHeaderMenuState] = useState<HeaderMenuState>('closed')
  const headerMenuOpen = headerMenuState !== 'closed'
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null)

  // The site header's actions cell, once it exists. The two sections portal
  // their triggers into it (SiteHeader.tsx); state rather than a ref so the
  // portals render the moment the node mounts.
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null)
  // The layer behind the canvas that the phone menu uncovers. The header
  // portals its menu box into it; state for the same reason as the cell.
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null)

  // Belt and braces: `canNavigate` below already refuses a warp while a legal
  // panel is open, so this never fires in practice. The header's chrome lives
  // on both experiences since 2026-09-03 and no longer closes on a swap.
  useEffect(() => {
    if (!earthActive) setLegalDoc(null)
  }, [earthActive])

  // Whether this browser has landed here before (DECISIONS §51). Read once per
  // page: the record is what this browser knew when the page opened. It decides
  // which way IN the intro takes — a returning visitor enters at the crossover,
  // after the loading draw has played in full.
  //
  // The boot entry has usually answered already, because the drawing had to know
  // before it drew; its answer wins, so the drawing and the timeline agree.
  const [introSeenAtBoot] = useState(
    () => window.__vertigoIntro?.returning ?? (hasConsent('preferences') && readIntroSeen()),
  )

  const { phase, timeline } = useMasterTimeline({
    intro,
    config,
    state,
    cornerLogo,
    replayKey,
    drawComplete,
    // The preset count, not the content. The assignment table is derived from
    // the published cases now (orbitAssignmentsFor), so the exact count lives
    // in the scene chunk; importing the content here would cost the entry
    // chunk every case study's prose. This is the UPPER bound the presets
    // allow: with fewer published cases than presets the hold runs one
    // introStagger (0.18s) longer per empty orbit, which is the cheaper
    // error — a reveal that outruns its hold would cut to the site mid-stagger.
    satelliteCount: ORBIT_PRESETS.length,
    returning: introSeenAtBoot,
  })

  // The music waits for Earth to be whole — 'site', where the header's controls
  // arrive — and is quiet while the blog is open (DECISIONS §48). `startMusic`
  // is idempotent, so the debug seek replaying the phases is harmless.
  useEffect(() => {
    if (phase === 'site') startMusic(activeExperience)
  }, [phase, activeExperience])
  useEffect(() => {
    setMusicSuppressed('blog', blogOpen)
  }, [blogOpen])

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
  // The refusals the gesture rail and the Earth hint SHARE, hoisted so the two
  // cannot drift apart. Everything here is React state, which is what lets it be
  // a render-time value; the two terms that are not — the intro phase and the
  // focused district — are read where they are current instead.
  const attentionIsFree =
    // The blog owns the viewport. A gesture accumulating behind it would warp a
    // reader who is four paragraphs into an article.
    !blogOpen &&
    // Never drop the viewer into a world that has not finished building.
    murciaReady &&
    !transitioning &&
    // Something already has the viewer's attention. Close it first.
    !auditOpen &&
    !contactOpen &&
    !legalDoc &&
    // The phone menu, and it stays true for the WHOLE of its close — the header
    // reports the phase, not the panel. While the menu is up the viewport is a
    // tilted card with `pointer-events: none`, so no gesture reaches the
    // canvas anyway; this is what refuses one that was already accumulating,
    // and covers the tail while the card is on its way back.
    !headerMenuOpen &&
    !selectedCase

  // Earth draws its hint in the scene, and it is an IDLE affordance: this says
  // only that it MAY be offered. How long the viewer has been still — the thing
  // that actually puts it on screen — is counted per frame inside the scene,
  // because it is a property of the viewer and not of the sequence.
  //
  // An explicit application-owned permission channel. HintLayer reads it live
  // alongside the intro phase; no per-frame React state update is needed.
  earthAttention.hintAllowed = attentionIsFree && activeExperience === 'earth'
  // Murcia's hint is the same affordance in the other world (2026-09-22); the
  // city adds its own condition — that the viewer is navigating it — inside.
  murciaAttention.hintAllowed = attentionIsFree && activeExperience === 'murcia'
  const [murciaOverviewBlocked, setMurciaOverviewBlocked] = useState(false)
  const {
    navigateTo,
    settle: settleNavigation,
    reset: resetNavigation,
    resetZoom: resetNavigationZoom,
    contextChanged: navigationContextChanged,
  } = useSceneNavigation({
    rootRef: navigationRef,
    getContext: () => ({
      current: activeExperience,
      canNavigate:
        attentionIsFree &&
        // The intro owns the camera until `site`; a rail filling over it would
        // promise something that cannot happen yet. Read HERE rather than with
        // the rest: `getContext` runs per event, so the phase is current, where a
        // render-time read would be stale.
        atOrAfter(state.phase, 'site') &&
        // A focus flight and a warp must never run at once, and this is what
        // makes that combination unreachable rather than merely guarded. Read
        // from a ref, so it also cannot take part in a render-time value.
        !murciaRef.current?.hasFocusedDistrict,
      // The one attention-holder a pinch may release: the district's display is
      // in the world, its close is a small drawn glyph, and on a phone the
      // gesture that means "out" must still mean out. The DOM panels above keep
      // their own closes and stay refused.
      releaseFocus: murciaRef.current?.hasFocusedDistrict
        ? () => murciaRef.current?.releaseFocusedDistrict()
        : null,
    }),
    onCommit: (intent) => transitionTo(intent === 'enter-murcia' ? 'murcia' : 'earth'),
    // The zoom IS the scene feedback. Written straight onto the mutable sequence
    // state, never through React: a wheel produces well over a hundred events a
    // second and each world reads this from its own frame callback.
    onZoom: (depth) => {
      navigation.zoomDepth = depth
    },
    // A horizontal trackpad swipe turns Murcia's camera. The input only sends it
    // while Murcia is current; the experience refuses it while anything else
    // flies the camera.
    onLook: (dx) => murciaRef.current?.lookBy(dx),
  })
  settleNavigationRef.current = settleNavigation
  resetZoomRef.current = resetNavigationZoom

  // Blog and Servicios in the header, from either world (useSceneShortcuts.ts).
  const shortcuts = useSceneShortcuts({
    activeExperience,
    menuState: headerMenuState,
    murciaRef,
    navigateTo,
    openBlogIndex: nav.openBlogIndex,
  })
  shortcutsSettledRef.current = shortcuts.onWarpSettled

  // Mirror focus for the DOM affordance; navigation still checks the live getter
  // at activation, so a district opening between renders cannot admit a warp.
  const handleMurciaAttentionChange = useCallback(() => {
    setMurciaOverviewBlocked(!(murciaRef.current?.isCityOverview ?? false))
    navigationContextChanged()
  }, [navigationContextChanged])

  useEffect(handleMurciaAttentionChange, [handleMurciaAttentionChange, activeExperience, transitioning])

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
    headerMenuOpen,
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
   * Opening the blog from the city, at the END of the display's approach.
   *
   * Guarded here rather than upstream. The CTA is an object in the scene, not a
   * control inside a panel, so nothing refuses a gesture that lands mid-warp the
   * way `canNavigate` does for the panels — and `murciaReady` is checked because
   * a handler should not assume the city exists just because something in it was
   * hit.
   *
   * RETURNS whether it acted, and that is not decoration. By the time this runs
   * the camera is against the panel behind an opaque cover, and a refusal the
   * scene could not see would leave a visitor sealed in front of a blog that was
   * never opened. `blogApproach` reads the false and flies them back out.
   */
  const handleOpenBlog = useCallback(() => {
    if (transitioning || !murciaReady) return false
    nav.openBlogIndex()
    return true
  }, [transitioning, murciaReady, nav])

  /**
   * The approach has started; the blog is wanted in about three seconds.
   *
   * `<LazyBlog>` has no Suspense fallback on purpose, so the gap between the
   * route changing and the blog painting is a gap with nothing in it but the
   * approach's cover. Warming the chunk now is what usually makes that gap zero.
   */
  const handleBlogApproachStart = useCallback(() => {
    prefetchBlog()
  }, [])

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

  /**
   * The blog has mounted, so the approach's cover has nothing left to hide.
   *
   * Passed down the host rather than triggered from a `blogOpen` effect here,
   * because `<LazyBlog>` is lazy with no fallback: an effect keyed on the route
   * would fire while the chunk was still in flight and drop the cover onto a
   * blank frame. The blog saying "I exist" is the only signal that means it.
   */
  const handleBlogMounted = useCallback(() => {
    murciaRef.current?.dismissBlogCover()
  }, [])

  /**
   * Flying back out, on EVERY warm route back to the scene.
   *
   * Keyed on `blogOpen` falling rather than hung off `handleExitBlog`, and that
   * is the difference between one way out and all of them: the blog's control,
   * the browser's Back button and a step back through an article all arrive here
   * as the same state change, and only the first goes through that callback.
   *
   * `useLayoutEffect` because the ordering is load-bearing. React has already
   * mutated the DOM by the time this runs — `.app__scene` is visible again and
   * `frameloop` is back to `always` — but the browser has not painted, and what
   * the canvas is still holding is the last frame it drew: the panel filling the
   * screen. Raising the cover here puts it up in that same commit. In a passive
   * effect it would go up one paint too late, which is exactly one frame of the
   * jump this whole mechanism exists to remove.
   *
   * A no-op for anyone who did not arrive through the display, and unreachable
   * on the cold blog document, which has no scene behind it at all.
   */
  const wasBlogOpen = useRef(blogOpen)
  useLayoutEffect(() => {
    const leaving = wasBlogOpen.current && !blogOpen
    wasBlogOpen.current = blogOpen
    if (leaving) murciaRef.current?.releaseFromBlog()
  }, [blogOpen])

  // The ✕ goes through the interaction controller rather than just clearing
  // state, so the camera returns to overview and the satellite resumes its
  // orbit — closing the panel is a deselect, not a hide.
  const handleClosePanel = useCallback(() => {
    interactionRef.current?.deselect()
    setSelectedCase(null)
  }, [])

  // Escape skips to the end state, as it always has. A press (below) now does
  // too, but only in the scripted tail — see the pointer skip.
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
      // The header's phone menu owns it too: a re-seek to 'site' snaps the
      // parked logo (snapToCorner resets its idle spin), which is a visible
      // jolt for a viewer who only meant to fold a menu.
      if (blogOpen) return
      if (!earthActive) return
      if (
        e.key === 'Escape' &&
        !selectedCase &&
        !auditOpen &&
        !contactOpen &&
        !legalDoc &&
        !headerMenuOpen
      )
        handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip, selectedCase, auditOpen, contactOpen, legalDoc, headerMenuOpen, earthActive, blogOpen])

  // A press skips the intro's scripted tail (plan 025). Only the tail: during
  // the loading draw the timeline does not exist yet and the draw is the
  // loading cover, and at `site` a press is the visitor using the page. Nothing
  // can be open during the tail (every panel and door arrives at `site`), so
  // the only guards are the ones Escape shares: the blog and Murcia own input.
  // Primary button, touch or pen; a right-click is not a request to skip.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (blogOpen || !earthActive) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (canSkipTail(phase)) handleSkip()
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [phase, handleSkip, earthActive, blogOpen])

  // The first landing is what makes the next visit a returning one — whether
  // the tail played out or was skipped — but only with the visitor's consent
  // (DECISIONS §51): the record is storage on their device, so it waits for
  // experience preferences, independently of analytics. Withdrawal removes it.
  // Subscribed from `site`, where the banner
  // asks; `subscribeConsent` calls back at once with a choice already made.
  useEffect(() => {
    if (phase !== 'site') return
    return subscribeConsent((record) => {
      if (record === null) return
      if (record.preferences) markIntroSeen()
      else clearIntroSeen()
    })
  }, [phase])

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
      {/* `data-menu-open` / `data-menu-state` are the phone menu, mirrored from
          the header for the stylesheet: the card's pose is keyed on the state,
          and the rest of the scene's chrome stands down on the boolean — the
          footer, the rail and the consent plate are siblings of the stage and
          would otherwise stay flat over a tilting scene. Hidden rather than
          unmounted, or they replay their entries. */}
      <div
        className="app__scene site-menu-surface"
        data-hidden={String(blogOpen)}
        data-menu-open={headerMenuOpen || undefined}
        data-menu-state={headerMenuState}
        inert={blogOpen}
      >
      {/* The header shell is ALWAYS mounted, even while the intro still owns the
          screen: the 3D logo's flight to the corner measures `.site-header__row`
          to know where the corner is (CornerLogoLayer). It is empty until the
          sections below portal their triggers into it at phase 'site', and the
          burger appears only then too. Transparent over both experiences; the
          bare Contacto text goes ink over Murcia's daylight sky. */}
      <SiteHeader
        layout="scene"
        tone={earthActive ? 'dark' : 'light'}
        hasActions={phase === 'site'}
        leading={phase === 'site' && !earthActive ? (
          <button
            type="button"
            className="scene-home"
            aria-label="Volver a la Tierra"
            title="Volver a la Tierra"
            disabled={!attentionIsFree || murciaOverviewBlocked}
            onClick={() => {
              if (murciaRef.current?.isCityOverview) navigateTo('earth')
            }}
          />
        ) : undefined}
        panelOpen={auditOpen || contactOpen || legalDoc !== null}
        menuHost={menuHost}
        onActionsHost={setHeaderActions}
        onMenuStateChange={setHeaderMenuState}
        extra={phase === 'site' ? <SoundToggle /> : undefined}
      />
      {/* THE PHONE MENU'S LAYER, behind the canvas (z 5 under the stage's 10).
          Empty here: the header portals its menu box into it on a phone, and
          the sections portal their triggers into that. Everything visual about
          it is shared with the blog through siteMenu.css. */}
      <SiteMenuLayer className="app__menu" hostRef={setMenuHost} />
      {/* THE STAGE AND THE CARD. Two wrappers around the canvas and NOTHING
          else, both permanent, both invisible boxes the canvas fills until the
          phone menu opens — then the stage lends its perspective and the card
          slides down, recedes and hinges away, uncovering the layer above.

          The canvas is never remounted by this: the wrappers are unconditional,
          the card is a CSS transform, and R3F measures the canvas by offset
          size (SceneCanvas.tsx), which a transform does not change.

          The stage carries `perspective`, which makes it the containing block
          for every `position: fixed` descendant — the trap `styles.css`
          documents on `.nav`. That is why it wraps only the canvas: the header,
          the rail, the modals and the rest below stay on the viewport.

          `--menu-3d-ms` is written here, from the one constant the header's
          phase timer runs on, so the transition and the phase end together.
          The rest of the composition is the stylesheet's custom properties;
          `?menu3d=1&y=…` overrides them for tuning on a phone. */}
      <SiteMenuStage
        className="app__stage"
        viewportClassName="app__viewport"
        style={{ '--menu-3d-ms': `${MENU_MOTION_MS}ms`, ...PROTO_MENU3D.vars } as CSSProperties}
      >
          <LazyScene
            navigation={navigation}
            attention={earthAttention}
            murciaAttention={murciaAttention}
            auditView={auditView}
            stepTransition={stepTransition}
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
            onMurciaAttentionChange={handleMurciaAttentionChange}
            onOpenBlog={handleOpenBlog}
            onBlogApproachStart={handleBlogApproachStart}
            onContextLost={handleContextLost}
          />
      </SiteMenuStage>

      {/* The intro drawing is NOT rendered by React — intro-draw owns its own
          DOM and has usually been animating since before this component
          mounted. React only relays config edits and replays into it. */}

      <div className="warp-overlay" ref={overlayRef} />

      <CasePanel
        data={earthActive ? selectedCase : null}
        getLogoBottom={getCaseLogoBottom}
        onClose={handleClosePanel}
        onRequestAudit={handleRequestAudit}
      />

      {/* The two doors in the header. Both gate on `phase === 'site'` — chrome
          exists only once the intro has fully landed, satellites revealed
          (DECISIONS §26.16) — and since 2026-09-03 on BOTH experiences: the
          header is one component for the whole site, and a warp cannot start
          while either panel is open (`canNavigate` above). Contacto is mounted
          first because portals append in mount order and it sits to the LEFT
          of the Auditoría box. The quiet sibling carries the phones (DECISIONS
          §30); the audit is the site's one full-attention ask. */}
      {/* The two places, before the two doors: portals append in mount order, so
          on the line they read Blog, Servicios, Contacto, Auditoría, and the
          phone menu reorders them after the doors (siteMenu.css). They reverse
          §26.16's "two doors only" — see its amendment of 2026-09-24. */}
      <SceneShortcuts
        ready={phase === 'site'}
        triggerHost={headerActions}
        disabled={transitioning}
        onBlog={() => shortcuts.request('blog')}
        onServices={() => shortcuts.request('services')}
      />

      <ContactSection
        ready={phase === 'site'}
        triggerHost={headerActions}
        suppressed={auditOpen}
        onOpenChange={setContactOpen}
        onOpenLegal={setLegalDoc}
      />

      <AuditSection
        onOpenChange={handleAuditOpenChange}
        ready={phase === 'site'}
        triggerHost={headerActions}
        onOpenLegal={setLegalDoc}
        openRequest={auditRequest}
      />

      {/* Both experiences since 2026-09-23: the mark is the site's, not the
          Earth scene's. `tone` is the header's prop and the header's reason —
          the ground under it is black here and pale daylight over Murcia. The
          shared `.scene-hint` already reserves its floor above this line on
          both scenes (DECISIONS §41), so nothing new is competing for it. */}
      {phase === 'site' && (
        <CopyrightMark tone={earthActive ? 'dark' : 'light'} />
      )}

      <LegalPanel doc={legalDoc} onClose={() => setLegalDoc(null)} />

      {/* The cookie consent banner, the intro's last stroke. Gated on the same
          phase as the header's doors (DECISIONS §26.16) and on BOTH experiences.
          INSIDE the scene wrapper, not beside it: the blog mounts its own copy
          under its own LegalPanel (BlogRoute), and this one hides with the
          scene. Non-modal — it is in neither `canNavigate` nor the Escape
          handler above, because a scroll or a pinch must still work under it.
          z 48: above the rail and the floor line, under everything that asks
          for attention. */}
      {phase === 'site' && <ConsentBanner onOpenLegal={setLegalDoc} />}

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

      {/* Earth's hint, beside the control it teaches. A sibling of `.nav` and
          never a child of it: that box is `position: fixed` and `styles.css`
          records what happened the last time it gained a property that captured
          a fixed child's frame of reference.

          Mounted for both worlds and never gated on one. `HintLayer` decides
          when it shows by painting `data-visible`, and putting a DOM node's
          lifetime on a per-frame decision would be a different and worse thing
          than toggling one attribute on it. */}
      <EarthHint />
      {/* Murcia's, on the same terms: mounted for both worlds, painted by
          `MurciaHintLayer` only while the city is showing and navigated. */}
      <MurciaHint />

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
          onMounted: handleBlogMounted,
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
