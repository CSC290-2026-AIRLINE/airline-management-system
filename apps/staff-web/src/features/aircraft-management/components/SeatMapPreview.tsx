import { Fragment } from 'react'
import { cabinMapSummary, middleAisleAfter, rowTypeOf } from '../cabin'
import type { CabinLayout } from '../types'

interface SeatMapPreviewProps {
  cabins: CabinLayout[]
  /** Toggles the blocked state of one seat. */
  onToggleSeat?: (cabinIndex: number, seat: string) => void
  /** Cycles a whole row: exit row, then extra legroom, then normal. */
  onCycleRow?: (cabinIndex: number, row: number) => void
}

export function SeatMapPreview({ cabins, onToggleSeat, onCycleRow }: SeatMapPreviewProps) {
  return (
    <div className="f9-seatmap">
      <h3 className="f9-card__title">Seat map preview</h3>

      <div className="f9-seatmap__legend">
        <div className="f9-seatmap__legendrow">
          <span className="f9-seatmap__legendlabel">Seat</span>
          <span className="f9-seatmap__legendentry">
            <i className="f9-seatmini" aria-hidden="true">
              A
            </i>
            = Available Seat
          </span>
          <span className="f9-seatmap__legendentry">
            <i className="f9-seatmini f9-seatmini--blocked" aria-hidden="true">
              D
            </i>
            = Blocked Seat
          </span>
        </div>
        <div className="f9-seatmap__legendrow">
          <span className="f9-seatmap__legendlabel">Row Type</span>
          <span className="f9-seatmap__legendentry">
            <i className="f9-seatmini f9-seatmini--exit" aria-hidden="true">
              12
            </i>
            = Exit Row
          </span>
          <span className="f9-seatmap__legendentry">
            <i className="f9-seatmini f9-seatmini--legroom" aria-hidden="true">
              4
            </i>
            = Extra Legroom
          </span>
          <span className="f9-seatmap__legendentry">7 = Normal Row</span>
        </div>
      </div>

      <p className="f9-note">
        Click a seat to toggle blocked (blocked seats are not sellable). Click a row number to mark the whole row: exit row, then extra
        legroom, then normal.
      </p>

      <div className="f9-seatmap__body">
        <p className="f9-seatmap__end">FRONT</p>

        <div className="f9-seatmap__rows">
          {cabins.map((cabin, cabinIndex) => {
            const aisleAfter = cabin.aisle_after ?? []
            const blocked = new Set(cabin.blocked_seats ?? [])
            const skipped = new Set(cabin.skip_rows ?? [])
            const numberAfter = middleAisleAfter(cabin.columns, aisleAfter)
            const rows: number[] = []
            for (let row = cabin.first_row; row <= cabin.last_row; row += 1) {
              if (!skipped.has(row)) {
                rows.push(row)
              }
            }

            return (
              <section
                key={`${cabin.cabin_class}-${cabin.first_row}`}
                className={cabin.columns.length <= 4 ? 'f9-seatmap__cabinblock f9-seatmap__cabinblock--wide' : 'f9-seatmap__cabinblock'}
              >
                <p className="f9-seatmap__cabin">{cabinMapSummary(cabin)}</p>

                <div className="f9-seatmap__row f9-seatmap__row--head">
                  {cabin.columns.map((column) => (
                    <Fragment key={column}>
                      <span className="f9-seatmap__colhead">{column}</span>
                      {aisleAfter.includes(column) && <span className="f9-seatmap__aisle" aria-hidden="true" />}
                    </Fragment>
                  ))}
                </div>

                {rows.map((row) => {
                  const rowType = rowTypeOf(cabin, row)
                  const rowClasses = ['f9-seatmap__rownum']
                  if (rowType === 'exit') {
                    rowClasses.push('f9-seatmap__rownum--exit')
                  }
                  if (rowType === 'extra_legroom') {
                    rowClasses.push('f9-seatmap__rownum--legroom')
                  }

                  return (
                    <div className="f9-seatmap__row" key={row}>
                      {cabin.columns.map((column) => {
                        const seat = `${row}${column}`
                        const seatClasses = ['f9-seat']
                        if (blocked.has(seat)) {
                          seatClasses.push('f9-seat--blocked')
                        }

                        return (
                          <Fragment key={column}>
                            <button
                              type="button"
                              className={seatClasses.join(' ')}
                              aria-pressed={blocked.has(seat)}
                              onClick={() => onToggleSeat?.(cabinIndex, seat)}
                            >
                              {column}
                            </button>
                            {aisleAfter.includes(column) &&
                              (column === numberAfter ? (
                                <button
                                  type="button"
                                  className={rowClasses.join(' ')}
                                  title="Cycle this row: exit row, extra legroom, normal row"
                                  onClick={() => onCycleRow?.(cabinIndex, row)}
                                >
                                  {row}
                                </button>
                              ) : (
                                <span className="f9-seatmap__aisle" aria-hidden="true" />
                              ))}
                          </Fragment>
                        )
                      })}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        <p className="f9-seatmap__end f9-seatmap__end--rear">REAR</p>
      </div>
    </div>
  )
}
