import { escapeXml, formatPercent, renderBarChart, renderLineChart } from './svg-chart'

describe('escapeXml', () => {
  it('escapes markup characters so labels cannot inject elements', () => {
    expect(escapeXml('<script>"a"&\'b\'</script>')).toBe('&#60;script&#62;&#34;a&#34;&#38;&#39;b&#39;&#60;/script&#62;')
  })
})

describe('renderLineChart', () => {
  const base = {
    title: 'On-time performance',
    subtitle: 'Per day',
    labels: ['2026-11-01', '2026-11-02', '2026-11-03'],
    format: formatPercent,
  }

  it('renders an accessible SVG card with the title and description', () => {
    const svg = renderLineChart({ ...base, series: [{ name: 'On-time %', color: '#14213d', points: [0.5, 0.75, 1] }] })

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('<title id="chart-title">On-time performance</title>')
    expect(svg).toContain('<desc id="chart-desc">Per day</desc>')
  })

  it('breaks the line at a null day instead of drawing across it', () => {
    const svg = renderLineChart({ ...base, series: [{ name: 'On-time %', color: '#14213d', points: [0.5, null, 1] }] })

    const path = /<path d="([^"]+)"/.exec(svg)?.[1] ?? ''
    expect(path.match(/M/g)).toHaveLength(2)
    expect(path.match(/L/g)).toBeNull()
  })

  it('highlights the latest value in gold', () => {
    const svg = renderLineChart({ ...base, series: [{ name: 'On-time %', color: '#14213d', points: [0.5, 0.75] }] })

    expect(svg).toContain('fill="#f2a800"')
    expect(svg).toContain('>75%</text>')
  })

  it('shows an empty state when there is no data', () => {
    const svg = renderLineChart({ ...base, labels: [], series: [{ name: 'x', color: '#000', points: [] }] })

    expect(svg).toContain('No data for this period')
  })

  it('escapes series names in the legend', () => {
    const svg = renderLineChart({ ...base, series: [{ name: '<b>x</b>', color: '#000', points: [0.5, 0.6, 0.7] }] })

    expect(svg).not.toContain('<b>x</b>')
    expect(svg).toContain('&#60;b&#62;x&#60;/b&#62;')
  })
})

describe('renderBarChart', () => {
  it('highlights only the largest bar in gold', () => {
    const svg = renderBarChart({
      title: 'Revenue per seat by route',
      subtitle: 'Per route',
      bars: [
        { label: 'BKK – HKG', value: 120 },
        { label: 'BKK – NRT', value: 340 },
      ],
      format: (v) => v.toFixed(2),
    })

    expect(svg.match(/fill="#f2a800"/g)).toHaveLength(1)
    expect(svg).toContain('340.00')
  })

  it('shows an empty state when there are no bars', () => {
    const svg = renderBarChart({ title: 't', subtitle: 's', bars: [], format: String })

    expect(svg).toContain('No data for this period')
  })
})
