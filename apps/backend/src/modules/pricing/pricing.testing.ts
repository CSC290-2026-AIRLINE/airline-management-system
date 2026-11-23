/**
 * Test helpers shared by the pricing service specs. `runTransactionsOn` makes `db.$transaction(fn)` hand the same mock
 * `db` to `fn` as the transaction client, and `mockAudit` is a spy the specs assert on.
 */
export function mockAudit() {
  return { write: jest.fn().mockResolvedValue(undefined) }
}

export function runTransactionsOn(db: object): void {
  Object.assign(db, { $transaction: jest.fn((work: (tx: object) => Promise<unknown>) => work(db)) })
}
