/**
 * The site's sound effects: one short clip per transition or animation cue.
 *
 * ── Decoded, unlike the music ──
 *
 * The music streams because three minutes of PCM would not fit the phone
 * budget. An effect is a second or two, a few hundred KB decoded, and has to
 * start on the sample it is asked for — so each one is fetched and decoded
 * once into an `AudioBuffer` and played through a fresh `AudioBufferSourceNode`.
 *
 * ── It shares the music's output ──
 *
 * The effects bus hangs off the same master gain as the music's
 * (audioOutput.ts), so the header's one toggle, the gesture unlock, the blog
 * and a hidden tab silence both alike. Nothing here creates an AudioContext of
 * its own.
 *
 * ── Late is worse than none ──
 *
 * A cue whose clip is not decoded yet is dropped, not queued: a whoosh that
 * lands after its warp is a bug. Every clip starts decoding the moment the
 * graph exists, whichever call made it (`onSoundContext`).
 *
 * Imports nothing from `experiences/`: the experiences report their moments to
 * App through callbacks, and App names the cue.
 */
import type { HeaderMenuState } from '../../corner-logo/headerMenuTiming'
import { effectsOutput, onSoundContext } from './audioOutput'

/**
 * Every moment that can carry an effect, named for the moment rather than the
 * sound. Each is fired by App.tsx, and `cueFor*` below says exactly when.
 */
export type SoundCue =
  /** The warp has started towards Murcia (`useExperienceTransition`'s `onStart`). */
  | 'warp-to-murcia'
  /** The warp has started towards Earth: the ascent out of the city. */
  | 'warp-to-earth'
  /** The cut, under full cover, in either direction (`onCut`). */
  | 'warp-cut'
  /** A satellite's case panel opens, or another case replaces it. */
  | 'case-open'
  /** The case panel closes. */
  | 'case-close'
  /** The audit section opens. */
  | 'audit-open'
  /** The audit section closes. */
  | 'audit-close'
  /** The phone menu card tilts open. */
  | 'menu-open'
  /** The phone menu card starts its way back. */
  | 'menu-close'
  /** Murcia: the camera flies into a district (the campus or Conócenos). */
  | 'district-enter'
  /** Murcia: the district hands the camera back to the city. */
  | 'district-leave'
  /** Murcia: the approach to the blog display starts. */
  | 'blog-approach'
  /** Murcia: the final vantage point offers its claim. */
  | 'claim-offer'

export interface SoundEffect {
  /** `/audio/sfx/<cue>-<sha8>.mp3`, hand-hashed like the music (CREDITS.md). */
  src: string
  /** 0..1, on top of `EFFECTS_VOLUME`. Defaults to 1. */
  volume?: number
  /** The least time between two starts of this cue. Defaults to
   *  `MIN_INTERVAL_SECONDS`. */
  minIntervalSeconds?: number
}

/**
 * The clips. A cue without an entry is silent, and nothing is fetched for it —
 * the music's `MUSIC_TRACKS` rule. The name carries the first 8 hex of the
 * file's SHA-256, because `/audio/` is served `immutable`. For example:
 *
 *     'warp-to-murcia': { src: '/audio/sfx/warp-to-murcia-1a2b3c4d.mp3' },
 */
export const SOUND_EFFECTS: Readonly<Partial<Record<SoundCue, SoundEffect>>> = {}

/** Enough to swallow a double fire from two paths reaching the same moment,
 *  short of anything a visitor could do on purpose. */
export const MIN_INTERVAL_SECONDS = 0.08
/** Overlapping effects past this many are dropped, not mixed into mud. */
export const MAX_VOICES = 4

/** Whether a cue may start now. Pure, so it is the part under test. */
export function admitSound(
  lastStartedAt: number | undefined,
  now: number,
  minIntervalSeconds: number,
  voices: number,
): boolean {
  if (voices >= MAX_VOICES) return false
  return lastStartedAt === undefined || now - lastStartedAt >= minIntervalSeconds
}

// ── the cues App derives from its own state ──

/** From the selected case before and after; a case replacing another opens. */
export function cueForCase(previous: object | null, next: object | null): SoundCue | null {
  if (next === previous) return null
  return next !== null ? 'case-open' : 'case-close'
}

export function cueForAudit(wasOpen: boolean, isOpen: boolean): SoundCue | null {
  if (wasOpen === isOpen) return null
  return isOpen ? 'audit-open' : 'audit-close'
}

/** The menu reports 'closed' → 'open' → 'closing' → 'closed'; the card moves
 *  on the first two edges, and the last is its arrival home. */
export function cueForMenu(
  previous: HeaderMenuState,
  next: HeaderMenuState,
): SoundCue | null {
  if (next === previous) return null
  if (next === 'open') return 'menu-open'
  if (next === 'closing') return 'menu-close'
  return null
}

export function cueForClaim(wasOffered: boolean, isOffered: boolean): SoundCue | null {
  return isOffered && !wasOffered ? 'claim-offer' : null
}

export function cueForDistrict(wasFocused: boolean, isFocused: boolean): SoundCue | null {
  if (wasFocused === isFocused) return null
  return isFocused ? 'district-enter' : 'district-leave'
}

// ── the buffers ──

type Clip =
  | { status: 'loading' }
  | { status: 'ready'; buffer: AudioBuffer }
  | { status: 'failed' }

const clips = new Map<SoundCue, Clip>()
const lastStartedAt = new Map<SoundCue, number>()
let voices = 0

function load(cue: SoundCue, effect: SoundEffect, ctx: AudioContext): Clip {
  const existing = clips.get(cue)
  if (existing) return existing
  const loading: Clip = { status: 'loading' }
  clips.set(cue, loading)
  fetch(effect.src)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.arrayBuffer()
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      clips.set(cue, { status: 'ready', buffer })
    })
    .catch((error: unknown) => {
      // Not retried: a clip that 404s or will not decode does so every time,
      // and the cue going silent is the whole of the damage.
      clips.set(cue, { status: 'failed' })
      console.warn(`[sound] could not load ${effect.src}`, error)
    })
  return loading
}

// ── the API ──

// Every listed clip, fetched and decoded once, as soon as the graph exists.
// With the toggle off there is no graph, so no effect costs a byte.
onSoundContext((ctx) => {
  for (const [cue, effect] of Object.entries(SOUND_EFFECTS) as [SoundCue, SoundEffect][]) {
    load(cue, effect, ctx)
  }
})

/** Plays a cue now, or drops it: unlisted, silenced, not decoded yet, too soon
 *  after itself, or too many already sounding. */
export function playSound(cue: SoundCue) {
  const effect = SOUND_EFFECTS[cue]
  if (!effect) return
  const output = effectsOutput()
  if (!output) return
  const clip = load(cue, effect, output.ctx)
  if (clip.status !== 'ready') return

  const { ctx, bus } = output
  const now = ctx.currentTime
  const interval = effect.minIntervalSeconds ?? MIN_INTERVAL_SECONDS
  if (!admitSound(lastStartedAt.get(cue), now, interval, voices)) return
  lastStartedAt.set(cue, now)

  const source = ctx.createBufferSource()
  source.buffer = clip.buffer
  const gain = ctx.createGain()
  gain.gain.value = effect.volume ?? 1
  source.connect(gain)
  gain.connect(bus)
  voices++
  source.onended = () => {
    voices--
    source.disconnect()
    gain.disconnect()
  }
  source.start()
}
