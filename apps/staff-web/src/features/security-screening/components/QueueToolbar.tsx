import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { filterStatuses } from '../queue-search'
import type { Filter, Sort } from '../types'

const filters: Filter[] = ['Needs review', 'Held', 'Flagged', 'Decided today']
const sorts: Sort[] = ['Nearest departure', 'Waiting longest', 'Strongest match']

export function QueueToolbar({
  filter,
  counts,
  onFilter,
  search,
  onSearch,
  sort,
  onSort,
}: {
  filter: Filter
  counts: Record<Filter, number>
  onFilter: (value: Filter) => void
  search: string
  onSearch: (value: string) => void
  sort: Sort
  onSort: (value: Sort) => void
}) {
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return (
    <div className="sq-toolbar">
      <div className="sq-filters" role="group" aria-label="Queue status">
        {filters.map((item) => (
          <Link
            key={item}
            to="/screening-queue"
            search={(previous) => ({ ...previous, status: filterStatuses[item], review: undefined })}
            resetScroll={false}
            aria-current={filter === item ? 'page' : undefined}
            className={filter === item ? 'sq-filter-active' : ''}
            onClick={() => onFilter(item)}
          >
            {item} · {counts[item]}
          </Link>
        ))}
      </div>
      <div className="sq-search-sort">
        <input
          aria-label="Search passenger or flight"
          placeholder={mobile ? 'Search name or flight' : 'Search passenger or flight'}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <div
          className="sq-sort"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
          }}
        >
          <button
            className="sq-sort-trigger"
            aria-expanded={open}
            aria-controls="sq-sort-options"
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          >
            {sort}
            <span>▾</span>
          </button>
          {open && (
            <div className="sq-sort-options" id="sq-sort-options" role="group" aria-label="Sort queue">
              {sorts.map((item) => (
                <button
                  key={item}
                  aria-pressed={sort === item}
                  onClick={() => {
                    onSort(item)
                    setOpen(false)
                  }}
                >
                  <span>{sort === item ? '✓' : ''}</span>
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
