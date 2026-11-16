import { PrismaClient } from '../src/db/generated/prisma'

const prisma = new PrismaClient()

async function main() {
  const reports = await prisma.lost_bag_report.findMany({
    take: 20,
    orderBy: { reported_at: 'desc' },
    include: {
      passenger: { select: { first_name: true, last_name: true } },
      booking_passenger: { 
        include: { 
          booking: { select: { booking_reference: true } }
        }
      },
      customer: { select: { id: true, user_id: true } },
      bag_delivery: { select: { id: true, status: true, delivery_type: true } }
    }
  })
  console.log(JSON.stringify(reports, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
