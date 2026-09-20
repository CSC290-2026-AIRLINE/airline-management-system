import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

@Injectable()
export class DbService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name)

  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('Connected to the database')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
