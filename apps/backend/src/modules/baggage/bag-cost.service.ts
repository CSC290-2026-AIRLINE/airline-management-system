import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import { BAG_COST_KINDS, MAX_COST_AMOUNT, type BagCost, type BagCostKind, type BagCostSummary } from './common/lost-report.types'
import { UUID_PATTERN, prismaErrorCode } from './common/patterns'

const KIND_LABELS: Record<BagCostKind, string> = {
  forwarding: 'Forwarding',
  delivery: 'Delivery',
  storage: 'Storage',
  other: 'Other',
}

export interface AddBagCostInput {
  staffId: string
  reportId: string
  kind: BagCostKind
  amount: number
  note?: string | null
}

interface CostRow {
  id: string
  report_id: string
  expense_id: string
  kind: string
  created_at: Date
  expense: { amount: { toString(): string }; description: string; incurred_on: Date; created_by: string }
}

const COST_SELECT = {
  id: true,
  report_id: true,
  expense_id: true,
  kind: true,
  created_at: true,
  expense: { select: { amount: true, description: true, incurred_on: true, created_by: true } },
} as const

function toCents(amount: { toString(): string }): number {
  return Math.round(Number(amount.toString()) * 100)
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function toBagCost(row: CostRow): BagCost {
  return {
    id: row.id,
    reportId: row.report_id,
    expenseId: row.expense_id,
    kind: row.kind as BagCostKind,
    amount: formatCents(toCents(row.expense.amount)),
    description: row.expense.description,
    incurredOn: row.expense.incurred_on.toISOString().slice(0, 10),
    createdBy: row.expense.created_by,
    createdAt: row.created_at,
  }
}

function reportNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.REPORT_NOT_FOUND, 'Lost bag report not found')
}

function invalid(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_COST, message)
}

/**
 * Recovery and delivery costs of a lost bag case. Each cost is a Feature 4 expense (category 'other') tied to the case by
 * a bag_cost row, so finance counts it and the amount is stored only once. Removing a cost soft-deletes its expense.
 */
@Injectable()
export class BagCostService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  async add(input: AddBagCostInput): Promise<BagCost> {
    const staffId = input.staffId?.trim()
    const note = input.note?.trim() || null

    if (!staffId || !UUID_PATTERN.test(staffId)) {
      throw invalid('Recording staff member is required')
    }

    if (!BAG_COST_KINDS.some((kind) => kind === input.kind)) {
      throw invalid('Invalid cost kind')
    }

    // Whole cents only, so the amount is stored exactly as entered.
    const cents = Math.round(input.amount * 100)
    if (!Number.isFinite(input.amount) || cents <= 0 || Math.abs(input.amount * 100 - cents) > 1e-6 || input.amount > MAX_COST_AMOUNT) {
      throw invalid('Amount must be more than 0 with at most 2 decimal places')
    }

    const report = await this.findReport(input.reportId)

    if (report.status === 'cancelled') {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATUS, 'A cancelled case cannot have costs')
    }

    // incurred_on decides the finance month, so it follows the simulation clock like other business dates.
    const today = this.clock.now()
    const incurredOn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const description = `${KIND_LABELS[input.kind]} cost for lost bag case ${report.case_number}${note ? `: ${note}` : ''}`
    const now = new Date()

    try {
      const row = await this.db.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            category: 'other',
            description,
            amount: formatCents(cents),
            incurred_on: incurredOn,
            created_by: staffId,
            created_at: now,
            updated_at: now,
          },
          select: { id: true },
        })

        return tx.bag_cost.create({ data: { report_id: report.id, expense_id: expense.id, kind: input.kind }, select: COST_SELECT })
      })

      return toBagCost(row)
    } catch (e) {
      if (prismaErrorCode(e) === 'P2003') {
        throw invalid('Unknown staff member')
      }

      throw e
    }
  }

  /** The case's costs that are not removed, oldest first, with their total. */
  async list(reportId: string): Promise<BagCostSummary> {
    const report = await this.findReport(reportId)

    const rows = await this.db.bag_cost.findMany({
      where: { report_id: report.id, expense: { deleted_at: null } },
      select: COST_SELECT,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    })

    const costs = rows.map(toBagCost)
    const total = rows.reduce((sum, row) => sum + toCents(row.expense.amount), 0)

    return { reportId: report.id, caseNumber: report.case_number, total: formatCents(total), costs }
  }

  /** A cost entered by mistake. Its expense is soft-deleted, so finance stops counting it and the row stays for audit. */
  async remove(reportId: string, costId: string): Promise<void> {
    const cost =
      UUID_PATTERN.test(reportId) && UUID_PATTERN.test(costId)
        ? await this.db.bag_cost.findFirst({
            where: { id: costId, report_id: reportId, expense: { deleted_at: null } },
            select: { expense_id: true },
          })
        : null

    if (!cost) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.COST_NOT_FOUND, 'Cost not found')
    }

    const now = new Date()
    await this.db.expense.update({ where: { id: cost.expense_id }, data: { deleted_at: now, updated_at: now } })
  }

  private async findReport(reportId: string): Promise<{ id: string; case_number: string; status: string }> {
    const report = UUID_PATTERN.test(reportId)
      ? await this.db.lost_bag_report.findUnique({ where: { id: reportId }, select: { id: true, case_number: true, status: true } })
      : null

    if (!report) {
      throw reportNotFound()
    }

    return report
  }
}
