import { set, unset, type StringInputProps } from 'sanity'

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * The brand-colour text field, with a colour picker and a swatch beside it.
 *
 * The stored value is unchanged: a `#rrggbb` string, or nothing. That is what
 * `caseStudies.collection.ts` projects and validates, so this is presentation
 * only — `@sanity/color-input` would have stored an object and changed the
 * contract for the sake of a picker.
 *
 * The text box stays, because a brand manual hands over a hex code and pasting
 * it is quicker than hunting for it in a picker. A native `<input type="color">`
 * cannot represent "no colour", which is a meaningful value here (empty =
 * white), so emptiness gets its own words and its own button.
 */
export function ColorHexInput(props: StringInputProps) {
  const { value, onChange, readOnly } = props
  const valid = typeof value === 'string' && HEX.test(value)
  const empty = typeof value !== 'string' || value === ''

  return (
    <div>
      {props.renderDefault(props)}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.5rem',
          fontSize: '0.8125rem',
          color: 'var(--card-muted-fg-color, #6e7683)',
        }}
      >
        <input
          type="color"
          aria-label="Elegir el color"
          disabled={readOnly}
          // A native picker needs SOME colour; white is what the site uses
          // when the field is empty, so it is also the honest starting point.
          value={valid ? value.toLowerCase() : '#ffffff'}
          onChange={(event) => onChange(set(event.currentTarget.value))}
          style={{
            width: '2.5rem',
            height: '2rem',
            padding: 0,
            border: '1px solid var(--card-border-color, #d0d4da)',
            borderRadius: '4px',
            background: 'none',
            cursor: readOnly ? 'default' : 'pointer',
          }}
        />
        {valid ? (
          <>
            <span>Así se verá el color de la marca.</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(unset())}
                style={{
                  marginLeft: 'auto',
                  padding: '0.25rem 0.5rem',
                  font: 'inherit',
                  color: 'var(--card-fg-color, #1f2329)',
                  background: 'none',
                  border: '1px solid var(--card-border-color, #d0d4da)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Quitar color
              </button>
            )}
          </>
        ) : empty ? (
          <span>Sin color: la web usará blanco.</span>
        ) : // Half-typed or mistyped: the field's own validation message already
        // says what is wrong, and "sin color" here would contradict it.
        null}
      </div>
    </div>
  )
}
