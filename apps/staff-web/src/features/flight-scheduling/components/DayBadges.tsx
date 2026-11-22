const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// One letter per weekday, filled for the days a pattern flies. `days` are ISO numbers, 1 = Monday ... 7 = Sunday.
export function DayBadges({ days }: { days: number[] }) {
  return (
    <span className="fs-days">
      {LETTERS.map((letter, i) => (
        <span key={NAMES[i]} className={`fs-day-badge${days.includes(i + 1) ? '' : ' fs-day-off'}`} title={NAMES[i]}>
          {letter}
        </span>
      ))}
    </span>
  )
}
