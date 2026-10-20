// The count-up of a case metric, as text: `+2,4M` at progress 0.5 is `+1,2M`.
//
// A metric value is free editorial text (`+38%`, `412 kws`, `96/100`), not a
// number, so the count works on the string. Only the FIRST number counts — in
// `96/100` the denominator is the scale, not the result — and everything around
// it stays put. A value with no number has nothing to count and is returned as
// is at every progress.
//
// The number keeps its own notation: as many decimals as it was written with,
// and the same decimal and grouping marks. One mark followed by exactly three
// digits groups thousands (`1.200`); followed by any other count it is the
// decimal mark (`2,1M`). With both marks, the last one written is the decimal.

const NUMBER = /\d+(?:[.,]\d+)*/

interface Notation {
  target: number
  decimals: number
  decimal: string
  group: string | null
}

function readNotation(token: string): Notation {
  const marks = token.match(/[.,]/g) ?? []
  const kinds = new Set(marks)
  let decimal: string | null = null
  if (kinds.size === 2) decimal = marks[marks.length - 1]
  else if (marks.length === 1 && token.length - token.indexOf(marks[0]) - 1 !== 3) decimal = marks[0]
  const group = marks.find((mark) => mark !== decimal) ?? null
  const [whole, fraction = ''] = decimal ? token.split(decimal) : [token]
  const digits = whole.replaceAll(group ?? '', '')
  return {
    target: Number(fraction ? `${digits}.${fraction}` : digits),
    decimals: fraction.length,
    decimal: decimal ?? ',',
    group,
  }
}

function write(value: number, { decimals, decimal, group }: Notation): string {
  const [whole, fraction] = value.toFixed(decimals).split('.')
  const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole
  return fraction ? `${grouped}${decimal}${fraction}` : grouped
}

/** Whether the value has a number to count. */
export function countsUp(value: string): boolean {
  return NUMBER.test(value)
}

/** The value as shown at `progress` (0 to 1, already eased) of its count. */
export function metricAt(value: string, progress: number): string {
  const match = value.match(NUMBER)
  if (!match || match.index === undefined) return value
  if (progress >= 1) return value
  const notation = readNotation(match[0])
  const shown = write(notation.target * Math.max(0, progress), notation)
  return value.slice(0, match.index) + shown + value.slice(match.index + match[0].length)
}
