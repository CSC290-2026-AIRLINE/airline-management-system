import { PALETTE, escapeXml, formatPercent, renderAreaChart, renderColumnChart, renderMeter, renderRankedBars } from './svg-chart'

describe('escapeXml', () => {
  it('escapes markup characters so labels cannot inject elements', () => {
    expect(escapeXml('<script>"a"&\'b\'</script>')).toBe('&#60;script&#62;&#34;a&#34;&#38;&#39;b&#39;&#60;/script&#62;')
  })
})

describe('renderAreaChart', () => {
  const base = {
    title: 'On-time performance',
    subtitle: 'Per day',
    labels: ['2026-11-01', '2026-11-02', '2026-11-03'],
    format: formatPercent,
    area: true,
  }

  it('renders an accessible SVG card with the title and description', () => {
    const svg = renderAreaChart({ ...base, series: [{ name: 'On-time', color: PALETTE.blue, points: [0.5, 0.75, 1] }] })

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('<title id="chart-title">On-time performance</title>')
    expect(svg).toContain('<desc id="chart-desc">Per day</desc>')
  })

  it('breaks the line and the area at a null day instead of drawing across it', () => {
    const svg = renderAreaChart({ ...base, series: [{ name: 'On-time', color: PALETTE.blue, points: [0.5, null, 1] }] })

    // Two separate runs: two line paths and two area paths, one point each side of the gap.
    expect(svg.match(/fill="none" stroke="#2a78d6"/g)).toHaveLength(2)
    expect(svg.match(/fill-opacity="0.16"/g)).toHaveLength(2)
  })

  it('leaves out the area when the chart is a plain line', () => {
    const svg = renderAreaChart({ ...base, area: false, series: [{ name: 'On-time', color: PALETTE.blue, points: [0.5, 0.75] }] })

    expect(svg).not.toContain('fill-opacity="0.16"')
  })

  it('prints the latest value', () => {
    const svg = renderAreaChart({ ...base, series: [{ name: 'On-time', color: PALETTE.blue, points: [0.5, 0.75] }] })

    expect(svg).toContain('>75%</text>')
  })

  it('shows the headline figure when one is given', () => {
    const svg = renderAreaChart({
      ...base,
      headline: { value: '82%', caption: 'latest period' },
      series: [{ name: 'On-time', color: PALETTE.blue, points: [0.5, 0.82] }],
    })

    expect(svg).toContain('>82%</text>')
    expect(svg).toContain('latest period')
  })

  it('shows an empty state when there is no data', () => {
    const svg = renderAreaChart({ ...base, labels: [], series: [{ name: 'x', color: '#000', points: [] }] })

    expect(svg).toContain('No data for this period')
  })

  it('escapes series names in the legend', () => {
    const svg = renderAreaChart({
      ...base,
      series: [
        { name: '<b>x</b>', color: PALETTE.blue, points: [0.5, 0.6, 0.7] },
        { name: 'y', color: PALETTE.orange, points: [0.4, 0.5, 0.6] },
      ],
    })

    expect(svg).not.toContain('<b>x</b>')
    expect(svg).toContain('&#60;b&#62;x&#60;/b&#62;')
  })
})

describe('renderColumnChart', () => {
  const base = {
    title: 'Load factor',
    subtitle: 'Per day',
    labels: ['2026-11-01', '2026-11-02'],
    format: formatPercent,
    showValues: true,
  }

  it('draws one column per period and prints its value', () => {
    const svg = renderColumnChart({ ...base, series: [{ name: 'Load factor', color: PALETTE.aqua, points: [0.5, 0.8] }] })

    expect(svg.match(/fill="#1baf7a"/g)).toHaveLength(2)
    expect(svg).toContain('>80%</text>')
  })

  it('leaves out a column for a null period', () => {
    const svg = renderColumnChart({ ...base, series: [{ name: 'Load factor', color: PALETTE.aqua, points: [null, 0.8] }] })

    expect(svg.match(/fill="#1baf7a"/g)).toHaveLength(1)
  })

  it('shows the two series side by side with a legend', () => {
    const svg = renderColumnChart({
      ...base,
      showValues: false,
      series: [
        { name: 'Bookings', color: PALETTE.blue, points: [10, 20] },
        { name: 'Cancellations', color: PALETTE.orange, points: [1, 2] },
      ],
    })

    expect(svg.match(/fill="#2a78d6"/g)).toHaveLength(3)
    expect(svg).toContain('Cancellations')
  })

  it('shows an empty state when there is no data', () => {
    const svg = renderColumnChart({ ...base, labels: [], series: [{ name: 'x', color: '#000', points: [] }] })

    expect(svg).toContain('No data for this period')
  })
})

describe('renderRankedBars', () => {
  it('draws each bar with its detail text, in the order given', () => {
    const svg = renderRankedBars({
      title: 'Delay causes',
      subtitle: 'By category',
      color: PALETTE.red,
      bars: [
        { label: 'Weather', value: 300, detail: '300 min · 4 delays' },
        { label: 'Technical', value: 120, detail: '120 min · 2 delays' },
      ],
    })

    expect(svg.indexOf('Weather')).toBeLessThan(svg.indexOf('Technical'))
    expect(svg).toContain('300 min · 4 delays')
  })

  it('shows an empty state when there are no bars', () => {
    const svg = renderRankedBars({ title: 't', subtitle: 's', color: PALETTE.red, bars: [] })

    expect(svg).toContain('No data for this period')
  })
})

describe('renderMeter', () => {
  it('fills each row to its share and prints the percentage', () => {
    const svg = renderMeter({
      title: 'Load factor by cabin',
      subtitle: 'By cabin',
      rows: [{ label: 'Business', fraction: 0.4, color: PALETTE.aqua, detail: '5 of 12 seats' }],
    })

    expect(svg).toContain('40%')
    expect(svg).toContain('5 of 12 seats')
    expect(svg).toContain('fill="#1baf7a"')
  })

  it('says so when a row has nothing to measure, instead of drawing an empty track', () => {
    const svg = renderMeter({
      title: 't',
      subtitle: 's',
      rows: [{ label: 'First', fraction: null, color: PALETTE.yellow, detail: '' }],
    })

    expect(svg).toContain('No departed flights')
    expect(svg).not.toContain('fill="#eda100"')
  })

  it('caps a share at 100% so a bar never runs past its track', () => {
    const svg = renderMeter({
      title: 't',
      subtitle: 's',
      rows: [{ label: 'Economy', fraction: 1.3, color: PALETTE.blue, detail: 'x' }],
    })

    // The track is 296 wide; a fill past 100% would be wider than that.
    expect(svg).toContain('width="296"')
    expect(svg).not.toMatch(/width="3[0-9]{2}\.[0-9]+"/)
  })
})
