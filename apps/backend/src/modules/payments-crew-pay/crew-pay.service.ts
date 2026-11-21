import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { fromCents, toCents } from './money'
import { PaymentErrorCode, paymentError } from './payments.errors'
import { FinancePostingService, PaymentSettingsService, type Caller, type Tx } from './support.services'
import { FakePayoutProvider } from './payout.provider'
import { hundredthsToDecimal, lineAmountCents, localDate, netByCrew, pairingQuantities, toHundredths } from './crew-pay-math'

type Staff = Extract<Caller, { kind: 'staff' }>

/** Feature 8's report and release times, read from its own settings (defaults from its migration). */
const CREW_SETTING_DEFAULTS = { report_minutes: 60, release_minutes: 0 }
const UNIT = 100 // multiplier 1.00 in hundredths

/**
 * Crew pay and overtime (5c, stretch). The work (who flew how long) belongs to feature 8 and the ledger to the finance
 * group; this service prices it and pays it out on the fake provider. A pairing is priced once its last leg has
 * arrived; a pay run collects the accrued lines up to its period end, is approved by a different staff member, and pays
 * one payout per crew member. Paid lines never change: a correction is an adjustment line in the next run.
 *
 * Feature 8 has no backend yet, so its tables (pairing, pairing_leg, pairing_leg_assignment, crew) are read directly
 * and only read; the in-process service replaces those reads when it lands.
 */
@Injectable()
export class CrewPayService {
  private readonly logger = new Logger(CrewPayService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly settings: PaymentSettingsService,
    private readonly postings: FinancePostingService,
    private readonly audit: AuditService,
    private readonly payouts: FakePayoutProvider,
  ) {}

  /** Pay runs and adjustments are finance work. No finance role is seeded yet, so admins may do it too. */
  assertFinance(staff: Staff) {
    if (!staff.isAdmin && staff.roleCode !== 'finance') {
      throw new ForbiddenException(paymentError(PaymentErrorCode.FINANCE_ONLY, 'Finance or admin role required'))
    }
  }

  // ----- pricing job ----------------------------------------------------------------------------------------------

  /**
   * Prices every pairing whose legs have all arrived and that has no lines yet. One transaction per pairing; the unique
   * index (crew, pairing, line type) makes a rerun create nothing new.
   */
  async pricePendingPairings(): Promise<number> {
    const pairings = await this.db.pairing.findMany({
      where: {
        pairing_leg: { some: {}, none: { flight: { status: { not: 'arrived' } } } },
        payroll_line: { none: { line_type: 'base' } },
      },
      take: 25,
      include: {
        airport: { select: { timezone: true } },
        pairing_leg: {
          include: {
            flight: { select: { dep_at: true, arr_at: true } },
            pairing_leg_assignment: { where: { unassigned_at: null }, select: { crew_id: true, role: true } },
          },
        },
      },
    })
    if (pairings.length === 0) return 0

    const [threshold, multiplier, rates, crewSettings] = await Promise.all([
      this.settings.get('overtime_threshold_hours'),
      this.settings.get('overtime_multiplier'),
      this.db.crew_pay_rate.findMany(),
      this.db.crew_setting.findMany({ where: { key: { in: ['report_minutes', 'release_minutes'] } } }),
    ])
    const setting = (key: keyof typeof CREW_SETTING_DEFAULTS) => {
      const value = Number(crewSettings.find((s) => s.key === key)?.value)
      return Number.isFinite(value) && value >= 0 ? value : CREW_SETTING_DEFAULTS[key]
    }
    const rateFor = new Map(rates.map((r) => [r.crew_role, { hourly: toCents(r.hourly_rate), perDiem: toCents(r.per_diem) }]))

    let priced = 0
    for (const pairing of pairings) {
      const byCrew = new Map<string, { role: string; legs: { depAt: Date; arrAt: Date }[] }>()
      for (const leg of pairing.pairing_leg) {
        for (const a of leg.pairing_leg_assignment) {
          const entry = byCrew.get(a.crew_id) ?? { role: a.role, legs: [] }
          entry.legs.push({ depAt: leg.flight.dep_at, arrAt: leg.flight.arr_at })
          byCrew.set(a.crew_id, entry)
        }
      }
      if (byCrew.size === 0) continue

      const lines = [...byCrew].flatMap(([crewId, work]) => {
        const rate = rateFor.get(work.role)
        if (!rate) {
          this.logger.warn(`No crew_pay_rate for role ${work.role}; pairing ${pairing.code} skipped for that crew member`)
          return []
        }
        const q = pairingQuantities({
          legs: work.legs,
          timeZone: pairing.airport.timezone,
          reportMinutes: setting('report_minutes'),
          releaseMinutes: setting('release_minutes'),
          overtimeThresholdHours: threshold,
        })
        const out = [
          this.pricedLine(crewId, pairing, 'base', q.flightHundredths, rate.hourly, UNIT, q.earnedOn, `${pairing.code} flight hours`),
        ]
        if (q.overtimeHundredths > 0) {
          out.push(
            this.pricedLine(
              crewId,
              pairing,
              'overtime',
              q.overtimeHundredths,
              rate.hourly,
              toHundredths(multiplier),
              q.earnedOn,
              `${pairing.code} overtime`,
            ),
          )
        }
        if (q.overnightHundredths > 0 && rate.perDiem > 0) {
          out.push(
            this.pricedLine(
              crewId,
              pairing,
              'per_diem',
              q.overnightHundredths,
              rate.perDiem,
              UNIT,
              q.earnedOn,
              `${pairing.code} overnights`,
            ),
          )
        }
        return out.filter((l) => l.quantity !== '0.00')
      })

      await this.db.$transaction(async (tx) => {
        const created = await tx.payroll_line.createManyAndReturn({ data: lines, skipDuplicates: true })
        for (const line of created) await this.postAccrued(tx, line)
      })
      priced++
    }
    return priced
  }

  private pricedLine(
    crewId: string,
    pairing: { id: string },
    lineType: 'base' | 'overtime' | 'per_diem',
    quantityHundredths: number,
    rateCents: number,
    multiplierHundredths: number,
    earnedOn: string,
    description: string,
  ) {
    return {
      crew_id: crewId,
      pairing_id: pairing.id,
      line_type: lineType,
      quantity: hundredthsToDecimal(quantityHundredths),
      rate: fromCents(rateCents),
      multiplier: hundredthsToDecimal(multiplierHundredths),
      amount: fromCents(lineAmountCents(quantityHundredths, rateCents, multiplierHundredths)),
      description,
      earned_on: new Date(`${earnedOn}T00:00:00Z`),
    }
  }

  /** Amounts in a posting are positive; a negative adjustment is posted as a deduction. */
  private async postAccrued(tx: Tx, line: { id: string; crew_id: string; pairing_id: string | null; line_type: string; amount: unknown }) {
    const cents = toCents(line.amount as string)
    await this.postings.post(tx, {
      postingKey: `crew_pay_accrued:${line.id}`,
      postingType: 'crew_pay_accrued',
      sourceType: 'payroll_line',
      sourceId: line.id,
      currency: await this.baseCurrency(tx),
      occurredAt: this.clock.now(),
      payload: {
        lines: [{ category: cents < 0 ? `${line.line_type}_deduction` : line.line_type, amount: fromCents(Math.abs(cents)) }],
        crew_id: line.crew_id,
        pairing_id: line.pairing_id,
      },
    })
  }

  private async baseCurrency(client: Pick<Tx, 'pricing_setting'> = this.db) {
    return (await client.pricing_setting.findUnique({ where: { key: 'base_currency' } }))?.value ?? 'USD'
  }

  /** Who is looking, for the page header ("Thit · Finance"). */
  async viewer(staff: Staff) {
    const row = await this.db.staff.findUnique({
      where: { id: staff.staffId },
      select: { first_name: true, last_name: true, role: { select: { name: true } } },
    })
    return { first_name: row?.first_name ?? '', last_name: row?.last_name ?? '', role: row?.role.name ?? staff.roleCode }
  }

  // ----- pay runs -------------------------------------------------------------------------------------------------

  /** GET /staff/pay-runs: the runs with their totals, the accrued lines not yet in a run, and the crew list. */
  async overview(staff: Staff) {
    const [runs, accrued, crew, currency] = await Promise.all([
      this.db.pay_run.findMany({
        orderBy: { created_at: 'desc' },
        take: 100,
        include: {
          staff_pay_run_created_by_staff_idTostaff: { select: { first_name: true, last_name: true } },
          staff_pay_run_approved_by_staff_idTostaff: { select: { first_name: true, last_name: true } },
          payroll_line: { select: { amount: true, crew_id: true, line_type: true } },
        },
      }),
      this.db.payroll_line.findMany({
        where: { status: 'accrued' },
        orderBy: { earned_on: 'asc' },
        include: { crew: { select: { first_name: true, last_name: true, role: true } }, pairing: { select: { code: true } } },
      }),
      this.db.crew.findMany({
        where: { deleted_at: null },
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
        select: { id: true, first_name: true, last_name: true, role: true, employee_number: true },
        take: 500,
      }),
      this.baseCurrency(),
    ])
    return {
      currency,
      viewer: await this.viewer(staff),
      runs: runs.map(
        ({ payroll_line, staff_pay_run_created_by_staff_idTostaff: by, staff_pay_run_approved_by_staff_idTostaff: ok, ...run }) => ({
          ...run,
          created_by: `${by.first_name} ${by.last_name}`,
          approved_by: ok ? `${ok.first_name} ${ok.last_name}` : null,
          line_count: payroll_line.length,
          crew_count: new Set(payroll_line.map((l) => l.crew_id)).size,
          total: fromCents(payroll_line.reduce((s, l) => s + toCents(l.amount), 0)),
        }),
      ),
      accrued: {
        total: fromCents(accrued.reduce((s, l) => s + toCents(l.amount), 0)),
        lines: accrued,
      },
      crew,
    }
  }

  /** POST /staff/pay-runs: a draft run with every accrued line earned up to period_end. */
  async createRun(staff: Staff, periodStart: string, periodEnd: string) {
    this.assertFinance(staff)
    if (periodEnd < periodStart) {
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, 'The period ends before it starts'))
    }
    return this.db.$transaction(async (tx) => {
      const run = await tx.pay_run.create({
        data: {
          period_start: new Date(`${periodStart}T00:00:00Z`),
          period_end: new Date(`${periodEnd}T00:00:00Z`),
          created_by_staff_id: staff.staffId,
        },
      })
      const moved = await tx.payroll_line.updateMany({
        where: { status: 'accrued', earned_on: { lte: run.period_end } },
        data: { status: 'in_run', pay_run_id: run.id },
      })
      if (moved.count === 0) {
        const earliest = await tx.payroll_line.findFirst({
          where: { status: 'accrued' },
          orderBy: { earned_on: 'asc' },
          select: { earned_on: true },
        })
        const hint = earliest
          ? ` The earliest unpaid pay was earned on ${earliest.earned_on.toISOString().slice(0, 10)}; choose a period end on or after it.`
          : ' All earned pay is already in a run.'
        throw new UnprocessableEntityException(
          paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, `No unpaid pay was earned on or before ${periodEnd}.${hint}`),
        )
      }
      return run
    })
  }

  /** GET /staff/pay-runs/:id: lines grouped by crew member, totals, the rule values used, and who may approve. */
  async getRun(staff: Staff, id: string) {
    const run = await this.db.pay_run.findUnique({
      where: { id },
      include: {
        staff_pay_run_created_by_staff_idTostaff: { select: { id: true, first_name: true, last_name: true } },
        staff_pay_run_approved_by_staff_idTostaff: { select: { first_name: true, last_name: true } },
        audit_log: { select: { id: true, occurred_at: true, reason: true } },
        payout: true,
        payroll_line: {
          orderBy: [{ earned_on: 'asc' }, { line_type: 'asc' }],
          include: {
            crew: { select: { id: true, first_name: true, last_name: true, role: true, employee_number: true } },
            pairing: { select: { code: true } },
          },
        },
      },
    })
    if (!run) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Pay run not found'))

    const [limit, threshold, multiplier, rates, currency] = await Promise.all([
      this.settings.get('pay_run_override_limit'),
      this.settings.get('overtime_threshold_hours'),
      this.settings.get('overtime_multiplier'),
      this.db.crew_pay_rate.findMany({ orderBy: { crew_role: 'asc' } }),
      this.baseCurrency(),
    ])
    const totalCents = run.payroll_line.reduce((s, l) => s + toCents(l.amount), 0)
    const hasAdjustment = run.payroll_line.some((l) => l.line_type === 'adjustment')
    const groups = new Map<
      string,
      { crew: (typeof run.payroll_line)[number]['crew']; lines: typeof run.payroll_line; totals: Record<string, number> }
    >()
    for (const line of run.payroll_line) {
      const group = groups.get(line.crew_id) ?? { crew: line.crew, lines: [], totals: {} }
      group.lines.push(line)
      group.totals[line.line_type] = (group.totals[line.line_type] ?? 0) + toCents(line.amount)
      groups.set(line.crew_id, group)
    }
    const {
      staff_pay_run_created_by_staff_idTostaff: by,
      staff_pay_run_approved_by_staff_idTostaff: ok,
      payroll_line: _lines,
      ...rest
    } = run
    void _lines
    return {
      ...rest,
      currency,
      created_by: { id: by.id, name: `${by.first_name} ${by.last_name}` },
      approved_by: ok ? `${ok.first_name} ${ok.last_name}` : null,
      total: fromCents(totalCents),
      has_adjustment: hasAdjustment,
      needs_admin: totalCents > Math.round(limit * 100) || hasAdjustment,
      is_creator: by.id === staff.staffId,
      rules: {
        overtime_threshold_hours: threshold,
        overtime_multiplier: multiplier,
        pay_run_override_limit: fromCents(Math.round(limit * 100)),
        rates,
      },
      crew: [...groups.values()].map((g) => ({
        crew: g.crew,
        lines: g.lines.map(({ crew: _crew, ...line }) => {
          void _crew
          return line
        }),
        totals: Object.fromEntries(Object.entries(g.totals).map(([k, v]) => [k, fromCents(v)])),
        net: fromCents(Object.values(g.totals).reduce((s, v) => s + v, 0)),
      })),
    }
  }

  /**
   * POST /staff/pay-runs/:id/approve: by a different staff member than the creator. A run above
   * pay_run_override_limit, or with an adjustment, needs an admin and an audit_log entry in the same transaction.
   */
  async approve(staff: Staff, id: string, note?: string) {
    this.assertFinance(staff)
    const limit = await this.settings.get('pay_run_override_limit')
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pay_run WHERE id = ${id}::uuid FOR UPDATE`
      const run = await tx.pay_run.findUnique({ where: { id }, include: { payroll_line: { select: { amount: true, line_type: true } } } })
      if (!run) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Pay run not found'))
      if (run.status !== 'draft') {
        throw new ConflictException(paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, `A ${run.status} run cannot be approved`))
      }
      if (run.created_by_staff_id === staff.staffId) {
        throw new ForbiddenException(
          paymentError(PaymentErrorCode.PAY_RUN_SELF_APPROVAL, 'A pay run must be approved by someone other than its creator'),
        )
      }
      const totalCents = run.payroll_line.reduce((s, l) => s + toCents(l.amount), 0)
      const hasAdjustment = run.payroll_line.some((l) => l.line_type === 'adjustment')
      const needsAdmin = totalCents > Math.round(limit * 100) || hasAdjustment
      let auditLogId: string | null = null
      if (needsAdmin) {
        if (!staff.isAdmin) {
          throw new ForbiddenException(
            paymentError(
              PaymentErrorCode.ADMIN_ONLY,
              'This run is above the override limit or contains an adjustment, so an admin must approve it',
            ),
          )
        }
        if (!note?.trim()) {
          throw new UnprocessableEntityException(
            paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, 'A reason is required for this approval'),
          )
        }
        const entry = await this.audit.write(
          {
            actor: { type: 'staff', id: staff.userId, role: staff.roleCode },
            sourceFeature: '5',
            action: 'status_change',
            entityType: 'pay_run',
            entityId: id,
            summary: `Approved pay run of ${fromCents(totalCents)}${hasAdjustment ? ' with adjustments' : ''}`,
            reason: note,
            before: { status: 'draft' },
            after: { status: 'approved' },
          },
          tx,
        )
        auditLogId = entry.id
      }
      return tx.pay_run.update({
        where: { id },
        data: { status: 'approved', approved_by_staff_id: staff.staffId, audit_log_id: auditLogId, updated_at: new Date() },
      })
    })
  }

  /**
   * POST /staff/pay-runs/:id/pay: one payout per crew member (the sum of their lines) on the fake provider. A payout
   * that succeeds makes that person's lines paid; one that fails is stored as failed with its reason, its lines stay in
   * the run, and it shows on Payment Exceptions for a retry. A non-positive net is not paid: its lines go back to
   * accrued and carry to the next run.
   */
  async pay(staff: Staff, id: string) {
    this.assertFinance(staff)
    const now = this.clock.now()
    const currency = await this.baseCurrency()
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pay_run WHERE id = ${id}::uuid FOR UPDATE`
      const run = await tx.pay_run.findUnique({
        where: { id },
        include: { payroll_line: { include: { crew: { select: { email: true } } } } },
      })
      if (!run) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Pay run not found'))
      if (run.status !== 'approved') {
        throw new ConflictException(
          paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, `Only an approved run can be paid (this one is ${run.status})`),
        )
      }

      const net = netByCrew(run.payroll_line.map((l) => ({ crewId: l.crew_id, amountCents: toCents(l.amount) })))
      const positive = [...net].filter(([, cents]) => cents > 0).map(([crewId]) => crewId)
      const carriedCrew = [...net].filter(([, cents]) => cents <= 0).map(([crewId]) => crewId)
      const destination = (crewId: string) => run.payroll_line.find((l) => l.crew_id === crewId)?.crew.email ?? null

      const paidCrew: string[] = []
      for (const crewId of positive) {
        const amountCents = net.get(crewId) ?? 0
        const result = this.payouts.send({ crewId, destination: destination(crewId), amountCents, currency })
        await tx.payout.create({
          data: {
            pay_run_id: id,
            crew_id: crewId,
            amount: fromCents(amountCents),
            ...(result.ok
              ? { status: 'paid', reference: result.reference, paid_at: now }
              : { status: 'failed', failure_reason: result.reason.slice(0, 500) }),
          },
        })
        if (result.ok) paidCrew.push(crewId)
      }
      if (paidCrew.length > 0) {
        await tx.payroll_line.updateMany({ where: { pay_run_id: id, crew_id: { in: paidCrew } }, data: { status: 'paid' } })
      }
      if (carriedCrew.length > 0) {
        await tx.payroll_line.updateMany({
          where: { pay_run_id: id, crew_id: { in: carriedCrew } },
          data: { status: 'accrued', pay_run_id: null },
        })
      }

      await this.postings.post(tx, {
        postingKey: `crew_pay_paid:${id}`,
        postingType: 'crew_pay_paid',
        sourceType: 'pay_run',
        sourceId: id,
        currency,
        occurredAt: now,
        payload: {
          lines: categoryTotals(run.payroll_line.filter((l) => paidCrew.includes(l.crew_id))),
          payouts: paidCrew.length,
          failed_payouts: positive.length - paidCrew.length,
          total: fromCents(paidCrew.reduce((s, c) => s + (net.get(c) ?? 0), 0)),
          carried_forward_crew: carriedCrew.length,
        },
      })
      return tx.pay_run.update({ where: { id }, data: { status: 'paid', paid_at: now, updated_at: new Date() } })
    })
  }

  /**
   * POST /staff/payouts/:id/retry: sends a failed payout again. On success the person's lines in that run become paid
   * and the money is posted as crew_pay_paid for this payout.
   */
  async retryPayout(staff: Staff, payoutId: string) {
    this.assertFinance(staff)
    const now = this.clock.now()
    const currency = await this.baseCurrency()
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payout WHERE id = ${payoutId}::uuid FOR UPDATE`
      const payout = await tx.payout.findUnique({ where: { id: payoutId }, include: { crew: { select: { email: true } } } })
      if (!payout) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Payout not found'))
      if (payout.status !== 'failed') {
        throw new ConflictException(
          paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, `Only a failed payout can be retried (this one is ${payout.status})`),
        )
      }
      const amountCents = toCents(payout.amount)
      const result = this.payouts.send({ crewId: payout.crew_id, destination: payout.crew.email, amountCents, currency })
      if (!result.ok) {
        return tx.payout.update({ where: { id: payoutId }, data: { failure_reason: result.reason.slice(0, 500) } })
      }
      const lines = await tx.payroll_line.findMany({ where: { pay_run_id: payout.pay_run_id, crew_id: payout.crew_id, status: 'in_run' } })
      await tx.payroll_line.updateMany({
        where: { id: { in: lines.map((l) => l.id) } },
        data: { status: 'paid' },
      })
      await this.postings.post(tx, {
        postingKey: `crew_pay_paid:payout:${payoutId}`,
        postingType: 'crew_pay_paid',
        sourceType: 'pay_run',
        sourceId: payout.pay_run_id,
        currency,
        occurredAt: now,
        payload: { lines: categoryTotals(lines), payouts: 1, total: fromCents(amountCents), retry_of_payout: payoutId },
      })
      return tx.payout.update({
        where: { id: payoutId },
        data: { status: 'paid', reference: result.reference, paid_at: now, failure_reason: null },
      })
    })
  }

  /** Failed crew payouts, for the Payment Exceptions page. */
  failedPayouts() {
    return this.db.payout.findMany({
      where: { status: 'failed' },
      orderBy: { created_at: 'asc' },
      include: {
        crew: { select: { first_name: true, last_name: true, role: true, employee_number: true } },
        pay_run: { select: { id: true, period_start: true, period_end: true } },
      },
    })
  }

  /** POST /staff/pay-runs/:id/cancel: a draft only; its lines go back to accrued. Approved or paid runs are locked. */
  async cancel(staff: Staff, id: string) {
    this.assertFinance(staff)
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pay_run WHERE id = ${id}::uuid FOR UPDATE`
      const run = await tx.pay_run.findUnique({ where: { id } })
      if (!run) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Pay run not found'))
      if (run.status !== 'draft') {
        throw new ConflictException(paymentError(PaymentErrorCode.PAYROLL_LINE_LOCKED, `The lines of a ${run.status} run are locked`))
      }
      await tx.payroll_line.updateMany({ where: { pay_run_id: id }, data: { status: 'accrued', pay_run_id: null } })
      return tx.pay_run.update({ where: { id }, data: { status: 'cancelled', updated_at: new Date() } })
    })
  }

  /** POST /staff/payroll-lines/adjustments: a positive or negative correction that joins the next run. */
  async addAdjustment(
    staff: Staff,
    input: { crewId: string; amountCents: number; description: string; earnedOn?: string; pairingId?: string; payRunId?: string },
  ) {
    this.assertFinance(staff)
    if (input.amountCents === 0) {
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.PAY_RUN_NOT_APPROVABLE, 'An adjustment cannot be zero'))
    }
    const crew = await this.db.crew.findFirst({
      where: { id: input.crewId, deleted_at: null },
      include: { airport: { select: { timezone: true } } },
    })
    if (!crew) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Crew member not found'))
    const earnedOn = input.earnedOn ?? localDate(this.clock.now(), crew.airport.timezone)
    return this.db.$transaction(async (tx) => {
      // Added while a draft run is open, it joins that run (which then needs an admin approval); otherwise the next one.
      if (input.payRunId) {
        await tx.$queryRaw`SELECT id FROM pay_run WHERE id = ${input.payRunId}::uuid FOR UPDATE`
        const run = await tx.pay_run.findUnique({ where: { id: input.payRunId }, select: { status: true } })
        if (!run) throw new NotFoundException(paymentError(PaymentErrorCode.PAY_RUN_NOT_FOUND, 'Pay run not found'))
        if (run.status !== 'draft') {
          throw new ConflictException(paymentError(PaymentErrorCode.PAYROLL_LINE_LOCKED, `The lines of a ${run.status} run are locked`))
        }
      }
      const line = await tx.payroll_line.create({
        data: {
          crew_id: crew.id,
          pairing_id: input.pairingId ?? null,
          line_type: 'adjustment',
          amount: fromCents(input.amountCents),
          description: input.description.trim(),
          earned_on: new Date(`${earnedOn}T00:00:00Z`),
          ...(input.payRunId && { status: 'in_run', pay_run_id: input.payRunId }),
        },
      })
      await this.postAccrued(tx, line)
      return line
    })
  }

  // ----- my pay ---------------------------------------------------------------------------------------------------

  /** GET /crew/me/pay: the caller's own lines and pay runs. Never another person's amounts. */
  async myPay(staff: Staff) {
    const crew = await this.db.crew.findFirst({
      where: { staff_id: staff.staffId, deleted_at: null },
      select: { id: true, first_name: true, last_name: true, role: true, employee_number: true, base_airport: true },
    })
    if (!crew) {
      throw new NotFoundException(
        paymentError(PaymentErrorCode.CREW_NOT_LINKED, 'Your sign-in is not linked to a crew member yet (feature 8)'),
      )
    }
    const [lines, payouts, currency] = await Promise.all([
      this.db.payroll_line.findMany({
        where: { crew_id: crew.id, status: { not: 'cancelled' } },
        orderBy: [{ earned_on: 'desc' }, { line_type: 'asc' }],
        take: 300,
        include: {
          pairing: {
            select: {
              code: true,
              pairing_leg: {
                select: {
                  flight: { select: { flight_number: true, dep_at: true, route: { select: { origin: true, destination: true } } } },
                },
              },
            },
          },
          pay_run: { select: { period_start: true, period_end: true, status: true } },
        },
      }),
      this.db.payout.findMany({
        where: { crew_id: crew.id },
        orderBy: { created_at: 'desc' },
        include: { pay_run: { select: { id: true, period_start: true, period_end: true, status: true, paid_at: true } } },
      }),
      this.baseCurrency(),
    ])
    const sum = (status: string) => fromCents(lines.filter((l) => l.status === status).reduce((s, l) => s + toCents(l.amount), 0))
    const overtime = fromCents(lines.filter((l) => l.line_type === 'overtime').reduce((s, l) => s + toCents(l.amount), 0))
    return {
      crew,
      currency,
      viewer: await this.viewer(staff),
      totals: { accrued: sum('accrued'), in_run: sum('in_run'), paid: sum('paid'), overtime },
      lines,
      payouts,
    }
  }
}

/** Paid lines summed by category; a negative line is a deduction, so every posted amount stays positive. */
function categoryTotals(lines: { line_type: string; amount: unknown }[]) {
  const byCategory = new Map<string, number>()
  for (const line of lines) {
    const cents = toCents(line.amount as string)
    const category = cents < 0 ? `${line.line_type}_deduction` : line.line_type
    byCategory.set(category, (byCategory.get(category) ?? 0) + Math.abs(cents))
  }
  return [...byCategory].map(([category, cents]) => ({ category, amount: fromCents(cents) }))
}
