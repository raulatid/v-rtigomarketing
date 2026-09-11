import { useEffect, useState } from 'react'
import { setMusicEnabled, subscribeMusic, type MusicStatus } from '../app/audio/backgroundMusic'

/**
 * The header's music control — WCAG 1.4.2's "a way to stop audio that plays by
 * itself". A blocked start reads as off, so the first press here is the gesture
 * that starts it (backgroundMusic.ts skips its own unlock for this button, via
 * `data-sound-toggle`, or the press would start the music and then mute it).
 */
export function SoundToggle() {
  const [status, setStatus] = useState<MusicStatus>('off')
  useEffect(() => subscribeMusic(setStatus), [])

  if (status === 'unavailable') return null
  const on = status === 'on'

  return (
    <button
      type="button"
      className="sound-toggle"
      data-sound-toggle=""
      // A fixed name with the state in `aria-pressed`: a label that also flips
      // would be announced as the opposite of what it says.
      aria-label="Música de fondo"
      aria-pressed={on}
      onClick={() => setMusicEnabled(!on)}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {on ? (
          <>
            <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
            <path d="M18 6.5a8 8 0 0 1 0 11" />
          </>
        ) : (
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        )}
      </svg>
    </button>
  )
}
