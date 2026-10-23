import { useEffect, useState } from 'react'
import { createCueTracker, type CueFor } from './cueTracker'
import { playSound, type SoundCue } from './soundCues'

/**
 * Plays the cue `cueFor` names when `value` changes (cueTracker.ts). Mounting
 * never sounds; a render late is well inside what an ear can place against the
 * animation it starts. `cueFor` is read once: pass a module-level mapping.
 */
export function useSoundCue<T>(value: T, cueFor: CueFor<T, SoundCue>) {
  const [tracker] = useState(() => createCueTracker(value, cueFor, playSound))
  useEffect(() => tracker.update(value), [tracker, value])
}
