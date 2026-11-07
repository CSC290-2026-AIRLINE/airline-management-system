import { toCsv } from './bi-csv'

describe('toCsv', () => {
  it('writes a header and one line per row, with CRLF endings', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n')
  })

  it('quotes fields with commas, quotes and line breaks, doubling quotes', () => {
    expect(toCsv(['name'], [['Smith, "Sam"'], ['line\nbreak']])).toBe('name\r\n"Smith, ""Sam"""\r\n"line\nbreak"\r\n')
  })

  it('writes null as an empty field', () => {
    expect(toCsv(['cause'], [[null]])).toBe('cause\r\n\r\n')
  })
})
