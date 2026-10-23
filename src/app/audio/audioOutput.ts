/**
 * The site's sound output: one AudioContext, one master gain, and a bus for
 * each kind of sound. The music (backgroundMusic.ts) and the sound effects
 * (soundEffects.ts) are two consumers of it; neither owns it.
 *
 *     backgroundMusic.ts → music gain   ┐
 *                                        ├→ master gain → destination
 *     soundEffects.ts    → effects gain ┘
 *
 * The master gain is everything that silences all of it at once: the visitor's
 * toggle, a blocked start, the blog, a hidden tab. So the header's one toggle
 * is the one way to stop the sound, and a consumer inherits the gesture unlock
 * and every suppression by hanging off its bus.
 *
 * ── Autoplay is a request, not a guarantee ──
 *
 * Browsers refuse audible playback until the visitor has done something that
 * counts as a gesture, and the intro has nothing to click. So the music tries,
 * and on `NotAllowedError` reports the block here (`reportSoundBlocked`), which
 * arms a one-shot listener for the first press, tap or key. Wheel and scroll
 * never count, so a trackpad visitor who only scrolls hears nothing until they
 * click (DECISIONS §48).
 *
 * ── The fades run on the audio clock ──
 *
 * Not on `transitionProgress`. The warp cannot be reversed once committed, so
 * there is nothing to follow per frame, and a wall-clock ramp stays smooth on a
 * device slow enough to stretch the frame-stepped cinematic.
 *
 * Module-level state shared by signal, the consent.ts shape: the header toggle
 * subscribes and is called back at once with what is already known. Imports
 * nothing from `experiences/` or `graphics/` — SiteHeader's rule.
 */

/** The music's level at full presence. Background, not foreground. */
export const MUSIC_VOLUME = 0.1
/** The effects' level, before each cue's own `volume`. A starting point above
 *  the music, since a cue is a short accent rather than a bed; tune by ear
 *  once the files are in. */
export const EFFECTS_VOLUME = 0.3
/** The toggle, the blog and a hidden tab. */
export const SUPPRESS_FADE_SECONDS = 0.8
/** The first entrance of the sound at Earth-ready. */
export const START_FADE_SECONDS = 2

export const SOUND_VERSION = 1
export const SOUND_STORAGE_KEY = 'vertigo:sound'

export type SuppressReason = 'blog' | 'hidden'

/** What the header toggle shows. `unavailable` means no Web Audio at all. */
export type SoundStatus = 'on' | 'off' | 'unavailable'

export interface SoundState {
  /** The visitor's preference. */
  enabled: boolean
  /** Earth has reached phase 'site'. */
  started: boolean
  /** The browser refused playback; waiting for a gesture. */
  blocked: boolean
  suppressed: ReadonlySet<SuppressReason>
}

/** Whether the master should be open. Pure, so it is the part under test. */
export function soundAudible(state: SoundState): boolean {
  return state.enabled && state.started && !state.blocked && state.suppressed.size === 0
}

/** The toggle's reading. A blocked start reads as off: nothing is playing, and a
 *  click on the toggle is exactly the gesture that will start it. */
export function soundStatus(state: SoundState, supported: boolean): SoundStatus {
  if (!supported) return 'unavailable'
  return state.enabled && !state.blocked ? 'on' : 'off'
}

// ── the preference ──

/** Read tolerantly, the consent.ts argument: anything malformed is "no record". */
export function parseSoundRecord(raw: unknown): boolean | null {
  if (raw === null || typeof raw !== 'object') return null
  const { v, on } = raw as Record<string, unknown>
  if (v !== SOUND_VERSION || typeof on !== 'boolean') return null
  return on
}

function loadEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY)
    // On by default: the product asks for the music to start by itself.
    if (raw === null) return true
    return parseSoundRecord(JSON.parse(raw)) ?? true
  } catch {
    return true
  }
}

function persistEnabled(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ v: SOUND_VERSION, on }))
  } catch {
    // Storage unavailable (Safari private mode, blocked site data): the choice
    // holds for this visit and is forgotten after, which is all that was possible.
  }
}

// ── the graph ──

/** What a consumer plays into. */
export interface SoundBuses {
  ctx: AudioContext
  /** The tracks' bus, fixed at `MUSIC_VOLUME`. */
  music: GainNode
  /** The sound effects' bus, fixed at `EFFECTS_VOLUME`. */
  effects: GainNode
}

interface Graph extends SoundBuses {
  master: GainNode
  masterTarget: number
}

const state: {
  enabled: boolean | undefined
  started: boolean
  blocked: boolean
  suppressed: Set<SuppressReason>
} = {
  enabled: undefined,
  started: false,
  blocked: false,
  suppressed: new Set(),
}

let graph: Graph | null = null
let unlockArmed = false
const listeners = new Set<(status: SoundStatus) => void>()
/** Waiting for the graph; each is called once, the moment it exists. */
const contextListeners = new Set<(ctx: AudioContext) => void>()
const changeListeners = new Set<(masterFade: number) => void>()

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

function snapshot(): SoundState {
  if (state.enabled === undefined) state.enabled = loadEnabled()
  return { ...state, enabled: state.enabled }
}

function notify() {
  const status = soundStatus(snapshot(), supported())
  for (const listener of listeners) listener(status)
}

function ensureGraph(): Graph | null {
  if (graph) return graph
  if (!supported()) return null
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  const music = ctx.createGain()
  music.gain.value = MUSIC_VOLUME
  music.connect(master)
  const effects = ctx.createGain()
  effects.gain.value = EFFECTS_VOLUME
  effects.connect(master)
  graph = { ctx, master, masterTarget: 0, music, effects }
  for (const listener of contextListeners) listener(ctx)
  contextListeners.clear()
  return graph
}

/**
 * From wherever the gain is NOW to `target`. Starting from the current value is
 * what makes an interrupted fade continue instead of jumping.
 * `cancelAndHoldAtTime` would say it better and Firefox does not have it.
 */
export function ramp(ctx: AudioContext, param: AudioParam, target: number, seconds: number) {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  if (seconds <= 0) param.setValueAtTime(target, now)
  else param.linearRampToValueAtTime(target, now + seconds)
}

/** Reconciles the master with the state, then lets each consumer follow. */
function apply(masterFade: number) {
  const audible = soundAudible(snapshot())
  // No graph until something should sound: nothing is created before the
  // visitor could hear it, and nothing at all while the toggle is off.
  if (!graph && !audible) return
  const g = ensureGraph()
  if (!g) return

  if (audible && g.ctx.state !== 'running') {
    g.ctx.resume().catch(() => {
      // Resolves on the next gesture where the policy holds it; the music's
      // own `play()` rejection is what reports a block.
    })
  }
  const target = audible ? 1 : 0
  if (g.masterTarget !== target) {
    g.masterTarget = target
    ramp(g.ctx, g.master.gain, target, masterFade)
  }
  for (const listener of changeListeners) listener(masterFade)
}

// ── the gesture fallback ──

const UNLOCK_EVENTS = ['pointerup', 'touchend', 'keydown'] as const

function onUnlockGesture(event: Event) {
  // The toggle's own press is left to the toggle, which reads a blocked start as
  // "off" and turns it on — handled here too, it would start and then mute.
  if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return
  disarmUnlock()
  state.blocked = false
  notify()
  // Synchronously inside the handler: that is what makes it a gesture.
  apply(START_FADE_SECONDS)
}

function armUnlock() {
  if (unlockArmed) return
  unlockArmed = true
  for (const type of UNLOCK_EVENTS) {
    window.addEventListener(type, onUnlockGesture, { capture: true, passive: true })
  }
}

function disarmUnlock() {
  if (!unlockArmed) return
  unlockArmed = false
  for (const type of UNLOCK_EVENTS) {
    window.removeEventListener(type, onUnlockGesture, { capture: true })
  }
}

function onVisibilityChange() {
  setSoundSuppressed('hidden', document.hidden)
}

// ── the API ──

/** Earth is ready. Idempotent: the debug seek can replay the intro's phases. */
export function startSound() {
  if (state.started) return
  state.started = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (document.hidden) state.suppressed.add('hidden')
  notify()
  apply(START_FADE_SECONDS)
}

export function setSoundSuppressed(reason: SuppressReason, on: boolean) {
  if (state.suppressed.has(reason) === on) return
  if (on) state.suppressed.add(reason)
  else state.suppressed.delete(reason)
  apply(SUPPRESS_FADE_SECONDS)
}

/** The visitor's toggle. Called from a click, so turning it on always may play. */
export function setSoundEnabled(on: boolean) {
  state.enabled = on
  persistEnabled(on)
  if (on) state.blocked = false
  else disarmUnlock()
  notify()
  apply(SUPPRESS_FADE_SECONDS)
}

/**
 * A consumer's playback was refused for want of a gesture. Drops the master
 * back to silence, so the gesture that unlocks it fades the sound in rather
 * than starting it at the level the refused ramp reached.
 */
export function reportSoundBlocked() {
  state.blocked = true
  armUnlock()
  notify()
  apply(0)
}

/** Whether the master is open, or opening. */
export function isSoundAudible(): boolean {
  return graph?.masterTarget === 1
}

/** The buses, once the graph exists; null means nothing would sound anyway. */
export function soundBuses(): SoundBuses | null {
  return graph
}

/**
 * Called after every change to the master, with the fade it is taking, so a
 * consumer can start or pause what plays into its bus.
 */
export function onSoundChange(listener: (masterFade: number) => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

/**
 * Calls back with the context the effects decode against: at once if the graph
 * exists, otherwise the moment it is made. That is the first moment anything
 * should sound — Earth-ready, the toggle turned on, a hidden tab shown — so a
 * listener learns it here rather than guessing which call created it. Never
 * while the toggle is off, and never on a cold `/blog`.
 */
export function onSoundContext(listener: (ctx: AudioContext) => void): () => void {
  if (graph) {
    listener(graph.ctx)
    return () => {}
  }
  contextListeners.add(listener)
  return () => {
    contextListeners.delete(listener)
  }
}

/**
 * Where an effect may play right now, or null while the sound is silenced:
 * toggle off, start blocked, blog open, tab hidden, or a context the browser
 * has not let run. An effect asked for in silence is dropped, never queued.
 */
export function effectsOutput(): { ctx: AudioContext; bus: GainNode } | null {
  if (!graph || graph.masterTarget === 0 || graph.ctx.state !== 'running') return null
  return { ctx: graph.ctx, bus: graph.effects }
}

export function readSoundStatus(): SoundStatus {
  return soundStatus(snapshot(), supported())
}

/** Calls back immediately with the current status, then on every change. */
export function subscribeSound(listener: (status: SoundStatus) => void): () => void {
  listeners.add(listener)
  listener(readSoundStatus())
  return () => {
    listeners.delete(listener)
  }
}
