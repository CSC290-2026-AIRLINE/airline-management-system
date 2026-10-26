import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { LandedFlight } from './flight-landing.source'
import { SimulationClockService } from './simulation-clock.service'
import { TurnaroundService } from './turnaround.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('TurnaroundService', () => {
  let db: {
    aircraft: { findFirst: jest.Mock }
    airport: { findUnique: jest.Mock }
    flight: { findFirst: jest.Mock }
    aircraft_turnaround: { create: jest.Mock; findFirst: jest.Mock }
    aircraft_turnaround_task: { findFirst: jest.Mock; update: jest.Mock }
  }
  let service: TurnaroundService
  let landings: { listLanded: jest.Mock }

  const task = (overrides: Record<string, unknown> = {}) => ({
    id: 'k1',
    task_type: 'refuel',
    status: 'completed',
    started_at: new Date('2026-01-01T10:00:00.000Z'),
    completed_at: new Date('2026-01-01T10:30:00.000Z'),
    ...overrides,
  })

  beforeEach(() => {
    db = {
      aircraft: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
      airport: { findUnique: jest.fn().mockResolvedValue({ iata_code: 'BKK' }) },
      flight: { findFirst: jest.fn().mockResolvedValue({ id: 'f1', aircraft_id: 'a1' }) },
      aircraft_turnaround: { create: jest.fn(), findFirst: jest.fn() },
      aircraft_turnaround_task: { findFirst: jest.fn(), update: jest.fn() },
    }
    landings = { listLanded: jest.fn().mockResolvedValue([]) }
    service = new TurnaroundService(db as unknown as DbService, landings, new SimulationClockService())
  })

  it('opens a turnaround with the four standard tasks', async () => {
    db.aircraft_turnaround.create.mockResolvedValue({
      id: 't1',
      aircraft_id: 'a1',
      flight_id: 'f1',
      airport_code: 'BKK',
      arrived_at: new Date('2026-01-01T09:00:00.000Z'),
      aircraft_turnaround_task: [
        task({ id: 'k1', task_type: 'refuel', status: 'pending' }),
        task({ id: 'k2', task_type: 'cleaning', status: 'pending' }),
        task({ id: 'k3', task_type: 'catering', status: 'pending' }),
        task({ id: 'k4', task_type: 'inspection', status: 'pending' }),
      ],
    })

    const turnaround = await service.create('a1', {
      flight_id: 'f1',
      airport_code: 'bkk',
      arrived_at: '2026-01-01T09:00:00.000Z',
    })

    expect(db.aircraft_turnaround.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          airport_code: 'BKK',
          aircraft_turnaround_task: { create: expect.arrayContaining([{ task_type: 'refuel', status: 'pending' }]) },
        }),
      }),
    )
    expect(turnaround.tasks).toHaveLength(4)
    expect(turnaround.is_ready).toBe(false)
  })

  const stored = () => ({
    id: 't1',
    aircraft_id: 'a1',
    flight_id: 'f1',
    airport_code: 'BKK',
    arrived_at: new Date('2026-01-01T09:00:00.000Z'),
    aircraft_turnaround_task: [task({ id: 'k1', status: 'in_progress', completed_at: null })],
  })
  const input = { flight_id: 'f1', airport_code: 'BKK', arrived_at: '2026-01-01T09:00:00.000Z' }

  it('returns the turnaround that already exists for the flight instead of opening a second one', async () => {
    db.aircraft_turnaround.findFirst.mockResolvedValue(stored())

    const turnaround = await service.create('a1', input)

    expect(turnaround.id).toBe('t1')
    expect(turnaround.tasks[0].status).toBe('in_progress')
    expect(db.aircraft_turnaround.create).not.toHaveBeenCalled()
  })

  it('returns the turnaround of the winner when two requests for one flight race', async () => {
    db.aircraft_turnaround.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(stored())
    db.aircraft_turnaround.create.mockRejectedValue({ code: 'P2002' })

    const turnaround = await service.create('a1', input)

    expect(turnaround.id).toBe('t1')
  })

  it('still reports a conflict when the unique violation has no turnaround behind it', async () => {
    db.aircraft_turnaround.findFirst.mockResolvedValue(null)
    db.aircraft_turnaround.create.mockRejectedValue({ code: 'P2002' })

    await expect(service.create('a1', input)).rejects.toBeInstanceOf(ConflictException)
  })

  it('reports an unknown flight', async () => {
    db.flight.findFirst.mockResolvedValue(null)

    await expect(
      service.create('a1', { flight_id: 'f9', airport_code: 'BKK', arrived_at: '2026-01-01T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses a flight that another aircraft operates', async () => {
    db.flight.findFirst.mockResolvedValue({ id: 'f1', aircraft_id: 'a2' })

    await expect(
      service.create('a1', { flight_id: 'f1', airport_code: 'BKK', arrived_at: '2026-01-01T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(db.aircraft_turnaround.create).not.toHaveBeenCalled()
  })

  it('refuses a task type that is listed twice instead of blaming the flight', async () => {
    await expect(
      service.create('a1', {
        flight_id: 'f1',
        airport_code: 'BKK',
        arrived_at: '2026-01-01T09:00:00.000Z',
        tasks: [{ task_type: 'refuel' }, { task_type: 'refuel' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(db.aircraft_turnaround.create).not.toHaveBeenCalled()
  })

  it('derives readiness from the tasks, counting a skipped task as finished', async () => {
    db.aircraft_turnaround.findFirst.mockResolvedValue({
      id: 't1',
      aircraft_id: 'a1',
      flight_id: 'f1',
      airport_code: 'BKK',
      arrived_at: new Date('2026-01-01T09:00:00.000Z'),
      aircraft_turnaround_task: [
        task({ id: 'k1', status: 'completed' }),
        task({ id: 'k2', status: 'skipped', completed_at: new Date('2026-01-01T10:45:00.000Z') }),
      ],
    })

    const turnaround = await service.getLatest('a1')

    expect(turnaround?.is_ready).toBe(true)
    expect(turnaround?.ready_at).toBe('2026-01-01T10:45:00.000Z')
  })

  it('stamps a completed task with the completion time', async () => {
    db.aircraft_turnaround_task.findFirst.mockResolvedValue(task({ status: 'in_progress', completed_at: null }))
    db.aircraft_turnaround_task.update.mockResolvedValue(task({ status: 'completed' }))

    await service.updateTask('t1', 'k1', { status: 'completed' })

    expect(db.aircraft_turnaround_task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed', completed_at: expect.any(Date) }) }),
    )
  })

  it('clears both times when a task goes back to pending', async () => {
    db.aircraft_turnaround_task.findFirst.mockResolvedValue(task({ status: 'skipped' }))
    db.aircraft_turnaround_task.update.mockResolvedValue(task({ status: 'pending', started_at: null, completed_at: null }))

    await service.updateTask('t1', 'k1', { status: 'pending' })

    expect(db.aircraft_turnaround_task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'pending', started_at: null, completed_at: null } }),
    )
  })

  it('clears the completion time but keeps the start time when a completed task is reopened', async () => {
    db.aircraft_turnaround_task.findFirst.mockResolvedValue(task({ status: 'completed' }))
    db.aircraft_turnaround_task.update.mockResolvedValue(task({ status: 'in_progress', completed_at: null }))

    await service.updateTask('t1', 'k1', { status: 'in_progress' })

    expect(db.aircraft_turnaround_task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'in_progress', completed_at: null } }),
    )
  })

  it('gives a task that is completed again a fresh completion time', async () => {
    db.aircraft_turnaround_task.findFirst.mockResolvedValue(task({ status: 'pending', started_at: null, completed_at: null }))
    db.aircraft_turnaround_task.update.mockResolvedValue(task({ status: 'completed' }))

    await service.updateTask('t1', 'k1', { status: 'completed' })

    const data = db.aircraft_turnaround_task.update.mock.calls[0][0].data
    expect(data.completed_at).toBeInstanceOf(Date)
  })

  it('refuses a task that belongs to another turnaround', async () => {
    db.aircraft_turnaround_task.findFirst.mockResolvedValue(null)

    await expect(service.updateTask('t1', 'k9', { status: 'completed' })).rejects.toBeInstanceOf(NotFoundException)
  })

  describe('the job of the simulation clock', () => {
    const landed = (flightId: string): LandedFlight => ({
      flight_id: flightId,
      aircraft_id: 'a1',
      airport_code: 'BKK',
      arrived_at: new Date('2026-01-01T09:00:00.000Z'),
    })

    it('starts a turnaround for every landed flight and answers how many it went through', async () => {
      landings.listLanded.mockResolvedValue([landed('f1'), landed('f2')])
      db.flight.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, aircraft_id: 'a1' }))
      db.aircraft_turnaround.create.mockResolvedValue({
        id: 't1',
        aircraft_id: 'a1',
        flight_id: 'f1',
        airport_code: 'BKK',
        arrived_at: new Date('2026-01-01T09:00:00.000Z'),
        aircraft_turnaround_task: [],
      })

      await expect(service.startForLandedFlights()).resolves.toBe(2)
      expect(db.aircraft_turnaround.create).toHaveBeenCalledTimes(2)
    })

    it('starts nothing while no flight source reports a landing, as with the mock', async () => {
      await expect(service.startForLandedFlights()).resolves.toBe(0)
      expect(db.aircraft_turnaround.create).not.toHaveBeenCalled()
    })
  })
})
