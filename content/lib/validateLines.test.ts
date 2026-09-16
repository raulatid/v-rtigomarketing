import { expect, it } from 'vitest'
import { Report, text } from './validate'

it('preserves editorial line breaks while sanitising service copy', () => {
  const report = new Report('service')
  expect(text(report, 'body', 'First <b>line</b>.\r\nSecond &amp; final line.', {
    preserveLineBreaks: true,
  })).toBe('First line.\nSecond & final line.')
  expect(report.problems).toEqual([])
  expect(text(report, 'title', 'One\nline')).toBe('One line')
})
