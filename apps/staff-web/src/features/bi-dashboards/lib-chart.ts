import { useLayoutEffect, useState } from 'react'
import type { BiGroup } from './api/bi'

/** Chart height in pixels; every BI line and bar chart uses the same so cards in a row line up. */
export const CHART_HEIGHT = 236

/** The plot area inside a chart of `width` pixels: room on the left for the y-axis labels, below for the x labels. */
export function plotArea(width: number) {
  const left = 52
  const right = width - 12
  const top = 22
  const bottom = 196
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

export type PlotArea = ReturnType<typeof plotArea>

/**
 * Round axis ticks covering `min` to `max`, in steps of 1, 2 or 5 × 10ⁿ, about `count` steps. Gives 0/20/40/60/80/100
 * rather than 0/25/50/75/100 of an odd maximum.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1
  const rough = span / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const residual = rough / magnitude
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude
  const low = Math.floor(min / step + 1e-9) * step
  const high = Math.max(low + step, Math.ceil(max / step - 1e-9) * step)
  return Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => Number((low + i * step).toFixed(10)))
}

/** Show every `n`th x label so labels about `spacing` pixels apart never overlap (52 fits a date like "28 Sep"). */
export function labelEvery(count: number, plotWidth: number, spacing = 52): number {
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / spacing))))
}

/**
 * The width of the element the chart sits in, kept up to date as the window or the card resizes. Charts draw at this
 * width (never below `min`), so their text stays the same size at every screen width instead of shrinking with a
 * scaled viewBox, and nothing is cut off at the card edge.
 */
export function useChartWidth(min: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(480)
  useLayoutEffect(() => {
    if (!element) return
    const measure = () => setWidth(Math.max(min, Math.floor(element.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, min])
  return { ref: setElement, width }
}

/** The x-axis caption for a grouping. */
export function groupLabel(group: BiGroup): string {
  return group === 'week' ? 'Week starting' : group === 'month' ? 'Month' : 'Date'
}
