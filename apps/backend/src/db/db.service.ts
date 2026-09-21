import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import type { EnvConfig } from '@backend/config/env.validation'
import { PrismaClient } from './generated/prisma/client'

@Injectable()
export class DbService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name)

  constructor(configService: ConfigService<EnvConfig, true>) {
    super({ adapter: new PrismaPg({ connectionString: configService.get('DATABASE_URL', { infer: true }) }) })
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('Connected to the database')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
