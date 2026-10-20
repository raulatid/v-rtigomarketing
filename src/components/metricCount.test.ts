import { describe, expect, it } from 'vitest'
import { countsUp, metricAt } from './metricCount'

describe('the metric count-up', () => {
  it('counts the number and keeps its sign and unit', () => {
    expect(metricAt('+38%', 0)).toBe('+0%')
    expect(metricAt('+38%', 0.5)).toBe('+19%')
    expect(metricAt('−27%', 0.5)).toBe('−14%')
    expect(metricAt('412 kws', 0.25)).toBe('103 kws')
  })

  it('keeps the decimals and the decimal mark it was written with', () => {
    expect(metricAt('2,1M', 0.5)).toBe('1,1M')
    expect(metricAt('+2,4M', 0)).toBe('+0,0M')
    expect(metricAt('1.5x', 0.5)).toBe('0.8x')
  })

  it('reads one mark before three digits as grouping, and keeps it', () => {
    expect(metricAt('1.200 €', 0.5)).toBe('600 €')
    expect(metricAt('1.200 €', 0.9)).toBe('1.080 €')
    expect(metricAt('12.500,5', 1 / 5)).toBe('2.500,1')
  })

  it('counts only the first number', () => {
    expect(metricAt('96/100', 0.5)).toBe('48/100')
  })

  it('ends on the value exactly as written', () => {
    for (const value of ['+38%', '2,1M', '1.200 €', '96/100', '9 nuevos']) {
      expect(metricAt(value, 1)).toBe(value)
    }
  })

  it('leaves a value with no number alone', () => {
    expect(countsUp('Top tres')).toBe(false)
    expect(metricAt('Top tres', 0)).toBe('Top tres')
    expect(countsUp('128')).toBe(true)
  })
})
