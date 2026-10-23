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
 *                                    ├→ music bus (audioOutput.ts)
 *     murcia <audio> → source → gain ┘
 *
 * The track gains ARE the crossfade. Everything that silences the music —
 * the visitor's toggle, a blocked start, the blog, a hidden tab — is the
 * output's master gain, which this module only follows (`onSoundChange`).
 * The music's one extra duty there is the autoplay probe: its `play()` is
 * what finds out the browser wants a gesture, and it reports that.
 *
 * Imports nothing from `experiences/` or `graphics/` — SiteHeader's rule.
 */
import type { ExperienceId } from '../experience'
import {
  SUPPRESS_FADE_SECONDS,
  isSoundAudible,
  onSoundChange,
  ramp,
  reportSoundBlocked,
  soundBuses,
  type SoundBuses,
} from './audioOutput'

/**
 * Hand-hashed like the fonts (DECISIONS §47): the name carries the first 8 hex
 * of the file's SHA-256, because `/audio/` is served `immutable`. Encode recipe
 * and sources in CREDITS.md.
 *
 * A world without an entry is silent: the warp fades the other track out and
 * nothing in.
 */
export const MUSIC_TRACKS: Readonly<Partial<Record<ExperienceId, string>>> = {
  earth: '/audio/earth-461bb41b.mp3',
  murcia: '/audio/murcia-dc24effe.mp3',
}

/** A little longer than the 1.6 s warp, so the new world's track settles after
 *  the picture does. */
export const CROSSFADE_SECONDS = 2.4

export interface MusicTargets {
  earth: number
  murcia: number
}

const TRACKS: readonly ExperienceId[] = ['earth', 'murcia']

/** Each track's gain for the world being shown. Pure, so it is the part under
 *  test. Whether anything is heard at all is the output's master. */
export function musicTargets(active: ExperienceId): MusicTargets {
  return {
    earth: active === 'earth' ? 1 : 0,
    murcia: active === 'murcia' ? 1 : 0,
  }
}

// ── the tracks ──

interface Track {
  el: HTMLAudioElement
  gain: GainNode
  /** The last target ramped to, so an unchanged target never restarts a ramp. */
  target: number
  pauseTimer: number | undefined
}

const state: { started: boolean; active: ExperienceId } = { started: false, active: 'earth' }
const tracks: Partial<Record<ExperienceId, Track>> = {}

function ensureTrack(buses: SoundBuses, id: ExperienceId): Track | null {
  const existing = tracks[id]
  if (existing) return existing
  const src = MUSIC_TRACKS[id]
  if (src === undefined) return null
  const el = new Audio()
  el.loop = true
  // Nothing is fetched until `play()`: the Murcia track costs no bytes to a
  // visitor who never leaves Earth.
  el.preload = 'none'
  el.src = src
  const gain = buses.ctx.createGain()
  gain.gain.value = 0
  buses.ctx.createMediaElementSource(el).connect(gain)
  gain.connect(buses.music)
  const track: Track = { el, gain, target: 0, pauseTimer: undefined }
  tracks[id] = track
  return track
}

function play(track: Track) {
  window.clearTimeout(track.pauseTimer)
  track.pauseTimer = undefined
  if (!track.el.paused) return
  track.el.play().catch((error: unknown) => {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError') {
      reportSoundBlocked()
      return
    }
    // A `pause()` landing while `play()` was pending — the next reconcile decides.
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
    if (track.target === 0 || !isSoundAudible()) track.el.pause()
  }, seconds * 1000 + 100)
}

/**
 * Reconciles the tracks with the world and the output. The only place that
 * touches them. A track made here starts at its target at once: the master's
 * own fade is its entrance.
 */
function reconcile(trackFade: number, masterFade: number) {
  const buses = soundBuses()
  if (!buses) return
  const audible = isSoundAudible()
  const targets = musicTargets(state.active)

  for (const id of TRACKS) {
    const target = targets[id]
    if (target === 0 && !tracks[id]) continue
    const track = ensureTrack(buses, id)
    if (!track) continue
    if (track.target !== target) {
      track.target = target
      ramp(buses.ctx, track.gain.gain, target, trackFade)
    }
    if (audible && target > 0) play(track)
    else pauseAfter(track, target === 0 ? trackFade : masterFade)
  }
}

onSoundChange((masterFade) => reconcile(0, masterFade))

// ── the API ──

/** Earth is ready: the world whose track plays first. Idempotent, like
 *  `startSound`, which is what opens the output. */
export function startMusic(experience: ExperienceId) {
  if (state.started) return
  state.started = true
  state.active = experience
  reconcile(0, 0)
}

/** The warp has committed to `to`. */
export function crossfadeMusic(to: ExperienceId) {
  if (state.active === to) return
  state.active = to
  reconcile(CROSSFADE_SECONDS, SUPPRESS_FADE_SECONDS)
}
