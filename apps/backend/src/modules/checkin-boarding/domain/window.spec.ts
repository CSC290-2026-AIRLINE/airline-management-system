import { computeWindow, DEFAULT_WINDOW_SETTINGS, isWindowOpen } from './window'

const DEP = new Date('2026-11-11T03:25:00.000Z')

describe('computeWindow', () => {
  it('computes opens, closes and boarding from departure', () => {
    expect(computeWindow(DEP, DEFAULT_WINDOW_SETTINGS)).toEqual({
      opensAt: new Date('2026-11-10T03:25:00.000Z'),
      closesAt: new Date('2026-11-11T02:25:00.000Z'),
      boardingAt: new Date('2026-11-11T02:45:00.000Z'),
    })
  })

  it('a delay moves the window with no stored state', () => {
    expect(computeWindow(new Date(DEP.getTime() + 3600_000), DEFAULT_WINDOW_SETTINGS).closesAt).toEqual(
      new Date('2026-11-11T03:25:00.000Z'),
    )
  })
})

describe('isWindowOpen', () => {
  it('isWindowOpen boundaries', () => {
    const w = computeWindow(DEP, DEFAULT_WINDOW_SETTINGS)
    expect(isWindowOpen(w.opensAt, w)).toBe(true)
    expect(isWindowOpen(new Date(w.opensAt.getTime() - 1), w)).toBe(false)
    expect(isWindowOpen(w.closesAt, w)).toBe(false)
    expect(isWindowOpen(new Date(w.closesAt.getTime() - 1), w)).toBe(true)
  })
})
