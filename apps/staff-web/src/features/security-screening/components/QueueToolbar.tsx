import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Queue status">
        {filters.map((item) => (
          <Button key={item} asChild size="sm" variant={filter === item ? 'default' : 'outline'} className="rounded-full">
            <Link
              to="/security-screening/screening-queue"
              search={(previous) => ({ ...previous, status: filterStatuses[item], review: undefined })}
              resetScroll={false}
              aria-current={filter === item ? 'page' : undefined}
              onClick={() => onFilter(item)}
            >
              {item} · {counts[item]}
            </Link>
          </Button>
        ))}
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <Input
          type="search"
          aria-label="Search passenger or flight"
          maxLength={100}
          placeholder="Search passenger or flight"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="min-w-44 flex-1 sm:w-64 sm:flex-none"
        />
        <Select value={sort} onValueChange={(value) => onSort(value as Sort)}>
          <SelectTrigger aria-label="Sort queue" className="min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
