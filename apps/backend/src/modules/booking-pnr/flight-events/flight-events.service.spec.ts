import type { FlightEvent, FlightEventSource } from '../contracts'
import type { FlightEventCatchupService } from './flight-event-catchup.service'
import type { FlightEventHandlerService } from './flight-event-handler.service'
import { FlightEventsService } from './flight-events.service'
import { Logger } from '@nestjs/common'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./flight-event-handler.service', () => ({ FlightEventHandlerService: class {} }))

describe('FlightEventsService durable polling', () => {
  function fixture() {
    const listeners = new Set<(event: FlightEvent) => Promise<void>>()
    const bus: FlightEventSource = {
      subscribe: (handler) => {
        listeners.add(handler)
        return () => {
          listeners.delete(handler)
        }
      },
    }
    const replay = jest
      .fn<Promise<void>, [(handler: (event: FlightEvent) => Promise<void>) => Promise<void>]>()
      .mockResolvedValue(undefined)
    const handle = jest.fn().mockResolvedValue(undefined)
    const service = new FlightEventsService(
      bus,
      { replay } as unknown as FlightEventCatchupService,
      { handle } as unknown as FlightEventHandlerService,
    )
    return { service, replay, handle }
  }
  it('processes an event stored after startup without an in-memory producer notification', async () => {
    const { service, replay, handle } = fixture()
    try {
      await service.onApplicationBootstrap()
      const event: FlightEvent = {
        id: 'new',
        seq: 2n,
        flightId: 'flight',
        type: 'flight.created',
        occurredAt: new Date(),
        oldAircraftId: null,
        newAircraftId: null,
        resolution: null,
        partnerAirline: null,
      }
      replay.mockImplementationOnce(async (handler) => {
        await handler(event)
      })
      await service.poll()
      expect(handle).toHaveBeenCalledWith(event)
    } finally {
      service.onModuleDestroy()
    }
  })
  it('does not overlap durable replays', async () => {
    const { service, replay } = fixture()
    let release!: () => void
    try {
      await service.onApplicationBootstrap()
      replay.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )
      const first = service.poll()
      await service.poll()
      expect(replay).toHaveBeenCalledTimes(2)
      release()
      await first
    } finally {
      service.onModuleDestroy()
    }
  })
  it('retries a failed durable replay on the next poll rather than leaving the dispatcher stopped', async () => {
    const { service, replay } = fixture()
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      await service.onApplicationBootstrap()
      replay.mockRejectedValueOnce(new Error('temporary database interruption'))
      await service.poll()
      await service.poll()
      // Initial replay, failed poll, recovery replay and resumed poll.
      expect(replay).toHaveBeenCalledTimes(4)
    } finally {
      service.onModuleDestroy()
      log.mockRestore()
    }
  })
  it('keeps the application starting when the startup replay fails, and recovers on the next poll', async () => {
    const { service, replay } = fixture()
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      replay.mockRejectedValueOnce(new Error('aircraft seat layout is unavailable'))
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledTimes(1)
      await service.poll()
      // Failed startup replay, then the poll's dispatcher restart and its durable replay.
      expect(replay).toHaveBeenCalledTimes(3)
    } finally {
      service.onModuleDestroy()
      log.mockRestore()
    }
  })
})
