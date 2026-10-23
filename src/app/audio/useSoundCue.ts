import { useEffect, useRef } from 'react'
import { playSound, type SoundCue } from './soundEffects'

/**
 * Plays the cue `cueFor` names when `value` changes. The first render compares
 * the value with itself, so mounting never sounds; a render late is well inside
 * what an ear can place against the animation it starts.
 */
export function useSoundCue<T>(value: T, cueFor: (previous: T, next: T) => SoundCue | null) {
  const previous = useRef(value)
  useEffect(() => {
    const cue = cueFor(previous.current, value)
    previous.current = value
    if (cue) playSound(cue)
  }, [value, cueFor])
}
