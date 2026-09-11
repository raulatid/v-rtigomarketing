import { set, unset, type StringInputProps } from 'sanity'

const HEX = /^#[0-9a-fA-F]{6}$/

/** The words beside the picker, and the colour an empty field stands for. */
export interface ColorHexCopy {
  /** Beside the swatch when a colour is set. */
  shown: string
  /** When the field is empty: what the site does instead. */
  empty: string
  /** `#rrggbb` the site uses when the field is empty; the picker starts there. */
  fallback: string
}

/**
 * A colour text field, with a colour picker and a swatch beside it.
 *
 * The stored value is unchanged: a `#rrggbb` string, or nothing. That is what
 * the content build projects and validates, so this is presentation only —
 * `@sanity/color-input` would have stored an object and changed the contract
 * for the sake of a picker.
 *
 * The text box stays, because a brand manual hands over a hex code and pasting
 * it is quicker than hunting for it in a picker. A native `<input type="color">`
 * cannot represent "no colour", which is a meaningful value here (empty = the
 * site's default), so emptiness gets its own words and its own button.
 */
export function colorHexInput(copy: ColorHexCopy) {
  return function ColorHexField(props: StringInputProps) {
    return <ColorHexFieldBody {...props} copy={copy} />
  }
}

/** The case study's brand colour: empty is white. */
export const ColorHexInput = colorHexInput({
  shown: 'Así se verá el color de la marca.',
  empty: 'Sin color: la web usará blanco.',
  fallback: '#ffffff',
})

function ColorHexFieldBody(props: StringInputProps & { copy: ColorHexCopy }) {
  const { value, onChange, readOnly, copy } = props
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
          // A native picker needs SOME colour; the fallback is what the site
          // uses when the field is empty, so it is also the honest starting point.
          value={valid ? value.toLowerCase() : copy.fallback}
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
            <span>{copy.shown}</span>
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
          <span>{copy.empty}</span>
        ) : // Half-typed or mistyped: the field's own validation message already
        // says what is wrong, and the empty message here would contradict it.
        null}
      </div>
    </div>
  )
}
