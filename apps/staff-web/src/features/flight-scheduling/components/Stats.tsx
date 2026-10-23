import type { ReactNode } from 'react'

// A row of big numbers with a label each, such as "4 flights in view"; two columns of cards on a phone.
export function Stats({ items }: { items: { value: ReactNode; label: ReactNode }[] }) {
  return (
    <dl className="fs-summary">
      {items.map((item, i) => (
        <div key={i}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}
