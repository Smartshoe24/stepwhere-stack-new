/**
 * Recharts reads colours as props, not classes, so charts pull tokens through
 * CSS variables. Series follow the chart order: pink, peach, info, ok, unset.
 */
export const chartColors = {
  series: [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
  ],
  axis: 'var(--chart-axis)',
  grid: 'var(--chart-grid)',
  cursor: 'rgb(255 255 255 / 0.04)',
} as const

export const chartAxisProps = {
  stroke: chartColors.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export const chartTooltipProps = {
  cursor: { fill: chartColors.cursor, stroke: 'var(--line)' },
  contentStyle: {
    background: 'var(--night-overlay)',
    border: 'none',
    borderRadius: 8,
    boxShadow: 'var(--shadow-overlay)',
    color: 'var(--ink)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--ink-3)', marginBottom: 4 },
  itemStyle: { color: 'var(--ink)' },
} as const
