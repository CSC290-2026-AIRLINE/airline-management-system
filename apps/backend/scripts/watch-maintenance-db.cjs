const { setTimeout: delay } = require('node:timers/promises')
const { Client } = require('pg')

const query = `
  SELECT a.tail_number AS aircraft,
         m.id AS request_id,
         m.status AS request_status,
         m.planned_start_date::text AS planned_start,
         m.planned_end_date::text AS planned_end,
         m.actual_end_date::text AS completed_on,
         p.id AS status_period_id,
         p.status AS aircraft_status,
         b.period_id AS bi_period_id,
         entry.summary AS latest_audit
  FROM aircraft_maintenance m
  JOIN aircraft a ON a.id = m.aircraft_id
  LEFT JOIN aircraft_status_period p ON p.id = m.status_period_id AND p.deleted_at IS NULL
  LEFT JOIN bi_aircraft_downtime b ON b.period_id = p.id
  LEFT JOIN LATERAL (
    SELECT summary
    FROM audit_log
    WHERE source_feature = '9' AND entity_type = 'aircraft_maintenance' AND entity_id = m.id::text
    ORDER BY seq DESC
    LIMIT 1
  ) entry ON true
  WHERE m.deleted_at IS NULL
  ORDER BY m.created_at DESC, m.id
  LIMIT 10
`

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  const once = process.argv.includes('--once')
  let previous
  await db.connect()
  try {
    await db.query('SET default_transaction_read_only = on')
    if (!once) console.log('Watching the latest 10 maintenance records for changes. Press Ctrl+C to stop.')
    do {
      const { rows } = await db.query(query)
      const snapshot = JSON.stringify(rows)
      if (snapshot !== previous) {
        console.log(new Date().toLocaleTimeString())
        if (rows.length) console.table(rows)
        else console.log('No active maintenance requests or records.')
        previous = snapshot
      }
      if (!once) await delay(2000)
    } while (!once)
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
