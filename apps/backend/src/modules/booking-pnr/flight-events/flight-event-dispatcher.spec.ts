import type { FlightEvent, FlightEventBus } from '../contracts'
import { FlightEventDispatcher } from './flight-event-dispatcher'

describe('FlightEventDispatcher', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const event = (seq: bigint): FlightEvent => ({
    id: `event-${seq}`,
    seq,
    flightId: 'flight',
    type: 'flight.created',
    occurredAt: now,
    oldAircraftId: null,
    newAircraftId: null,
    resolution: null,
    partnerAirline: null,
  })
  let listener: ((value: FlightEvent) => Promise<void>) | undefined
  const unsubscribe = jest.fn()
  const bus: FlightEventBus = {
    subscribe: (handler) => {
      listener = handler
      return unsubscribe
    },
    publish: async (value) => listener?.(value),
  }

  beforeEach(() => {
    listener = undefined
    unsubscribe.mockReset()
  })

  it('subscribes before replay and processes buffered live events after replay', async () => {
    let finishReplay!: () => void
    const replay = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishReplay = resolve
        }),
    )
    const handle = jest.fn().mockResolvedValue(undefined)
    const dispatcher = new FlightEventDispatcher(bus, { replay }, handle)
    const starting = dispatcher.start()
    const later = bus.publish(event(3n))
    const earlier = bus.publish(event(2n))
    expect(handle).not.toHaveBeenCalled()
    finishReplay()
    await starting
    await Promise.all([later, earlier])
    expect(handle.mock.calls.map(([item]) => item.seq)).toEqual([2n, 3n])
    dispatcher.stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('stops and rejects buffered events if replay fails', async () => {
    let failReplay!: (error: Error) => void
    const replay = jest.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          failReplay = reject
        }),
    )
    const handle = jest.fn()
    const dispatcher = new FlightEventDispatcher(bus, { replay }, handle)
    const starting = dispatcher.start()
    const published = bus.publish(event(2n))
    const rejectedStart = expect(starting).rejects.toThrow('replay failed')
    const rejectedPublish = expect(published).rejects.toThrow('replay failed')
    failReplay(new Error('replay failed'))
    await Promise.all([rejectedStart, rejectedPublish])
    expect(handle).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('does not process later live events after a handler failure', async () => {
    const handle = jest.fn().mockRejectedValue(new Error('handling failed'))
    const dispatcher = new FlightEventDispatcher(bus, { replay: () => Promise.resolve() }, handle)
    await dispatcher.start()
    await expect(bus.publish(event(1n))).rejects.toThrow('handling failed')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('does not run live handlers at the same time', async () => {
    let finishFirst!: () => void
    const handle = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const dispatcher = new FlightEventDispatcher(bus, { replay: () => Promise.resolve() }, handle)
    await dispatcher.start()
    const first = bus.publish(event(1n))
    const second = bus.publish(event(2n))
    expect(handle).toHaveBeenCalledTimes(1)
    finishFirst()
    await Promise.all([first, second])
    expect(handle.mock.calls.map(([item]) => item.seq)).toEqual([1n, 2n])
    dispatcher.stop()
  })
})
