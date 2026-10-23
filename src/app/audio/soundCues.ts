/**
 * This site's sound cues: the moments that can carry an effect, their clips,
 * and how App's state maps onto them. The
 * engine (soundEffects.ts) and the trackers (cueTracker.ts) know none of it.
 *
 * Adding a sound to an animation: name the moment in `SoundCue`, give it a
 * clip in `SOUND_EFFECTS`, and fire it from App.tsx — `playSound` from a
 * callback, or `useSoundCue` with a mapping below when the animation follows
 * a piece of state.
 *
 * Imports nothing from `experiences/`: the experiences report their moments to
 * App through callbacks, and App names the cue.
 */
import type { HeaderMenuState } from '../../corner-logo/headerMenuTiming'
import { edgeCue, type CueFor } from './cueTracker'
import { createSoundEffects, type SoundEffect } from './soundEffects'

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

/**
 * The clips. A cue without an entry is silent, and nothing is fetched for it —
 * the music's `MUSIC_TRACKS` rule. The name carries the first 8 hex of the
 * file's SHA-256, because `/audio/` is served `immutable`. For example:
 *
 *     'warp-to-murcia': { src: '/audio/sfx/warp-to-murcia-1a2b3c4d.mp3' },
 */
export const SOUND_EFFECTS: Readonly<Partial<Record<SoundCue, SoundEffect>>> = {}

export const playSound = createSoundEffects({ effects: SOUND_EFFECTS })

// ── the cues App derives from its own state ──

/** From the selected case before and after; a case replacing another opens. */
export const cueForCase: CueFor<object | null, SoundCue> = (previous, next) => {
  if (next === previous) return null
  return next !== null ? 'case-open' : 'case-close'
}

export const cueForAudit = edgeCue<SoundCue>('audit-open', 'audit-close')

/** The menu reports 'closed' → 'open' → 'closing' → 'closed'; the card moves
 *  on the first two edges, and the last is its arrival home. */
export const cueForMenu: CueFor<HeaderMenuState, SoundCue> = (previous, next) => {
  if (next === previous) return null
  if (next === 'open') return 'menu-open'
  if (next === 'closing') return 'menu-close'
  return null
}

/** Offered once; nothing on its way out. */
export const cueForClaim = edgeCue<SoundCue>('claim-offer')

export const cueForDistrict = edgeCue<SoundCue>('district-enter', 'district-leave')
