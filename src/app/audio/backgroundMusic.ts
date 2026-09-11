/**
 * The site's background music: one loop per world, crossfaded at the warp.
 *
 * ── Streamed, not decoded ──
 *
 * Each track is an `<audio>` element routed through Web Audio, never a decoded
 * buffer. `decodeAudioData` holds a track as PCM — about 63 MB for three
 * minutes of stereo — and a phone budget this project measured at ~70 MB has
 * no room for two of those. Web Audio is here only for the gains: iOS ignores
 * `element.volume`, so a fade needs a GainNode.
 *
 *     earth  <audio> → source → gain ┐
 *                                    ├→ master gain → destination
 *     murcia <audio> → source → gain ┘
 *
 * The track gains ARE the crossfade; the master gain is everything that silences
 * both at once (the visitor's toggle, the blog, a hidden tab).
 *
 * ── Autoplay is a request, not a guarantee ──
 *
 * Browsers refuse audible playback until the visitor has done something that
 * counts as a gesture, and the intro has nothing to click. So `start()` tries,
 * and on `NotAllowedError` arms a one-shot listener for the first press, tap or
 * key. Wheel and scroll never count, so a trackpad visitor who only scrolls
 * hears nothing until they click (DECISIONS §48).
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
import type { ExperienceId } from '../experience'

/**
 * Hand-hashed like the fonts (DECISIONS §47): the name carries the first 8 hex
 * of the file's SHA-256, because `/audio/` is served `immutable`. Encode recipe
 * and sources in CREDITS.md.
 *
 * A world without an entry is silent: the warp fades the other track out and
 * nothing in.
 */
export const MUSIC_TRACKS: Readonly<Partial<Record<ExperienceId, string>>> = {
  earth: '/audio/earth-0cae7852.mp3',
  // Murcia's track is still to be chosen (CREDITS.md). Until then Murcia is quiet.
  // murcia: '/audio/murcia-<sha8>.mp3',
}

/** The master level at full presence. Background, not foreground. */
export const MUSIC_VOLUME = 0.1
/** A little longer than the 1.6 s warp, so the new world's track settles after
 *  the picture does. */
export const CROSSFADE_SECONDS = 2.4
/** The toggle, the blog and a hidden tab. */
export const SUPPRESS_FADE_SECONDS = 0.8
/** The first entrance of the music at Earth-ready. */
export const START_FADE_SECONDS = 2

export const SOUND_VERSION = 1
export const SOUND_STORAGE_KEY = 'vertigo:sound'

export type SuppressReason = 'blog' | 'hidden'

/** What the header toggle shows. `unavailable` means no Web Audio at all. */
export type MusicStatus = 'on' | 'off' | 'unavailable'

export interface MusicState {
  /** The visitor's preference. */
  enabled: boolean
  /** Earth has reached phase 'site'. */
  started: boolean
  /** The browser refused playback; waiting for a gesture. */
  blocked: boolean
  active: ExperienceId
  suppressed: ReadonlySet<SuppressReason>
}

export interface MusicTargets {
  /** 0 or 1, before `MUSIC_VOLUME`. */
  master: number
  earth: number
  murcia: number
}

const TRACKS: readonly ExperienceId[] = ['earth', 'murcia']

/** The gains the state asks for. Pure, so it is the part under test. */
export function musicTargets(state: MusicState): MusicTargets {
  const audible = state.enabled && state.started && !state.blocked && state.suppressed.size === 0
  return {
    master: audible ? 1 : 0,
    earth: state.active === 'earth' ? 1 : 0,
    murcia: state.active === 'murcia' ? 1 : 0,
  }
}

/** The toggle's reading. A blocked start reads as off: nothing is playing, and a
 *  click on the toggle is exactly the gesture that will start it. */
export function musicStatus(state: MusicState, supported: boolean): MusicStatus {
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

interface Track {
  el: HTMLAudioElement
  gain: GainNode
  /** The last target ramped to, so an unchanged target never restarts a ramp. */
  target: number
  pauseTimer: number | undefined
}

interface Graph {
  ctx: AudioContext
  master: GainNode
  masterTarget: number
  tracks: Partial<Record<ExperienceId, Track>>
}

const state: {
  enabled: boolean | undefined
  started: boolean
  blocked: boolean
  active: ExperienceId
  suppressed: Set<SuppressReason>
} = {
  enabled: undefined,
  started: false,
  blocked: false,
  active: 'earth',
  suppressed: new Set(),
}

let graph: Graph | null = null
let unlockArmed = false
const listeners = new Set<(status: MusicStatus) => void>()

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

function snapshot(): MusicState {
  if (state.enabled === undefined) state.enabled = loadEnabled()
  return { ...state, enabled: state.enabled }
}

function notify() {
  const status = musicStatus(snapshot(), supported())
  for (const listener of listeners) listener(status)
}

function ensureGraph(): Graph | null {
  if (graph) return graph
  if (!supported()) return null
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  graph = { ctx, master, masterTarget: 0, tracks: {} }
  return graph
}

function ensureTrack(g: Graph, id: ExperienceId): Track | null {
  const existing = g.tracks[id]
  if (existing) return existing
  const src = MUSIC_TRACKS[id]
  if (src === undefined) return null
  const el = new Audio()
  el.loop = true
  // Nothing is fetched until `play()`: the Murcia track costs no bytes to a
  // visitor who never leaves Earth.
  el.preload = 'none'
  el.src = src
  const gain = g.ctx.createGain()
  gain.gain.value = 0
  g.ctx.createMediaElementSource(el).connect(gain)
  gain.connect(g.master)
  const track: Track = { el, gain, target: 0, pauseTimer: undefined }
  g.tracks[id] = track
  return track
}

/**
 * From wherever the gain is NOW to `target`. Starting from the current value is
 * what makes an interrupted fade continue instead of jumping.
 * `cancelAndHoldAtTime` would say it better and Firefox does not have it.
 */
function ramp(ctx: AudioContext, param: AudioParam, target: number, seconds: number) {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  if (seconds <= 0) param.setValueAtTime(target, now)
  else param.linearRampToValueAtTime(target, now + seconds)
}

function play(track: Track) {
  window.clearTimeout(track.pauseTimer)
  track.pauseTimer = undefined
  if (!track.el.paused) return
  track.el.play().catch((error: unknown) => {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError') {
      state.blocked = true
      armUnlock()
      notify()
      // Drops the master back to silence, so the gesture that unlocks it fades
      // the music in rather than starting it at the level the refused ramp reached.
      apply(0, 0)
      return
    }
    // A `pause()` landing while `play()` was pending — the next apply decides.
    if (name === 'AbortError') return
    console.warn('[music] playback failed', error)
  })
}

/** Pauses once the fade has run out, keeping `currentTime`: coming back to a
 *  world resumes its track where it left off. */
function pauseAfter(track: Track, seconds: number) {
  if (track.el.paused || track.pauseTimer !== undefined) return
  track.pauseTimer = window.setTimeout(() => {
    track.pauseTimer = undefined
    if (track.target === 0 || graph?.masterTarget === 0) track.el.pause()
  }, seconds * 1000 + 100)
}

/** Reconciles the graph with the state. The only place that touches audio. */
function apply(trackFade: number, masterFade: number) {
  const current = snapshot()
  const targets = musicTargets(current)
  // No graph until something should sound: nothing is created before the
  // visitor could hear it, and nothing at all while the toggle is off.
  if (!graph && targets.master === 0) return
  const g = ensureGraph()
  if (!g) return

  if (targets.master > 0 && g.ctx.state !== 'running') {
    g.ctx.resume().catch(() => {
      // Resolves on the next gesture where the policy holds it; `play()`'s own
      // rejection below is what reports a block.
    })
  }
  if (g.masterTarget !== targets.master) {
    g.masterTarget = targets.master
    ramp(g.ctx, g.master.gain, targets.master * MUSIC_VOLUME, masterFade)
  }

  for (const id of TRACKS) {
    const target = targets[id]
    if (target === 0 && !g.tracks[id]) continue
    const track = ensureTrack(g, id)
    if (!track) continue
    if (track.target !== target) {
      track.target = target
      ramp(g.ctx, track.gain.gain, target, trackFade)
    }
    if (targets.master > 0 && target > 0) play(track)
    else pauseAfter(track, target === 0 ? trackFade : masterFade)
  }
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
  apply(0, START_FADE_SECONDS)
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
  setMusicSuppressed('hidden', document.hidden)
}

// ── the API ──

/** Earth is ready. Idempotent: the debug seek can replay the intro's phases. */
export function startMusic(experience: ExperienceId) {
  if (state.started) return
  state.started = true
  state.active = experience
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (document.hidden) state.suppressed.add('hidden')
  notify()
  apply(0, START_FADE_SECONDS)
}

/** The warp has committed to `to`. */
export function crossfadeMusic(to: ExperienceId) {
  if (state.active === to) return
  state.active = to
  apply(CROSSFADE_SECONDS, SUPPRESS_FADE_SECONDS)
}

export function setMusicSuppressed(reason: SuppressReason, on: boolean) {
  if (state.suppressed.has(reason) === on) return
  if (on) state.suppressed.add(reason)
  else state.suppressed.delete(reason)
  apply(CROSSFADE_SECONDS, SUPPRESS_FADE_SECONDS)
}

/** The visitor's toggle. Called from a click, so turning it on always may play. */
export function setMusicEnabled(on: boolean) {
  state.enabled = on
  persistEnabled(on)
  if (on) state.blocked = false
  else disarmUnlock()
  notify()
  apply(CROSSFADE_SECONDS, SUPPRESS_FADE_SECONDS)
}

export function readMusicStatus(): MusicStatus {
  return musicStatus(snapshot(), supported())
}

/** Calls back immediately with the current status, then on every change. */
export function subscribeMusic(listener: (status: MusicStatus) => void): () => void {
  listeners.add(listener)
  listener(readMusicStatus())
  return () => {
    listeners.delete(listener)
  }
}
