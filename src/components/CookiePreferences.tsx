import { useEffect, useId, useState } from 'react'
import { readConsent, subscribeConsent, writeConsent, type ConsentCategory } from '../app/consent'
import './cookiePreferences.css'
import { COOKIE_COPY as copy } from '../content/site'

type Choices = Record<ConsentCategory, boolean>
const empty: Choices = { preferences: false, analytics: false }

export function CookiePreferences() {
  const [choices, setChoices] = useState<Choices>(() => readConsent() ?? empty)
  const [message, setMessage] = useState('')
  const id = useId()
  useEffect(() => subscribeConsent(record => {
    setChoices(record ?? empty)
    setMessage('')
  }), [])

  const save = (next: Choices) => {
    writeConsent(next)
    setMessage(copy.saved)
  }

  return (
    <div className="cookie-preferences">
      <p className="cookie-preferences__intro">{copy.intro}</p>
      <div className="cookie-preferences__row">
        <div><strong>{copy.necessaryTitle}</strong><p>{copy.necessaryBody}</p></div>
        <span className="cookie-preferences__fixed">{copy.alwaysActive}</span>
      </div>
      {([
        ['preferences', copy.preferencesTitle, copy.preferencesBody],
        ['analytics', copy.analyticsTitle, copy.analyticsBody],
      ] as const).map(([key, title, description]) => (
        <label className="cookie-preferences__row" key={key}>
          {/* Named by the title and described by the rest: an aria-label of the
              title alone used to silence the description (F14 of the
              2026-11-18 accessibility audit). */}
          <span><strong id={`${id}-${key}`}>{title}</strong><span className="cookie-preferences__description" id={`${id}-${key}-description`}>{description}</span></span>
          <input type="checkbox" role="switch" aria-labelledby={`${id}-${key}`} aria-describedby={`${id}-${key}-description`} checked={choices[key]} onChange={e => {
            setChoices(previous => ({ ...previous, [key]: e.target.checked }))
            setMessage(copy.unsaved)
          }} />
        </label>
      ))}
      <div className="cookie-preferences__actions">
        <button type="button" onClick={() => save(empty)}>{copy.rejectAll}</button>
        <button type="button" onClick={() => save({ preferences: true, analytics: true })}>{copy.acceptAll}</button>
        <button type="button" className="cookie-preferences__save" onClick={() => save(choices)}>{copy.save}</button>
      </div>
      <p className="cookie-preferences__status" role="status">{message}</p>
    </div>
  )
}
