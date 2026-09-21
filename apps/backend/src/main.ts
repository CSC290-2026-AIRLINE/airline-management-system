import cookieParser from 'cookie-parser'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { APP_ORIGINS } from './auth/auth.constants'
import type { EnvConfig } from './config/env.validation'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  })
  const configService = app.get(ConfigService<EnvConfig, true>)

  app.setGlobalPrefix('/api')
  app.use(cookieParser())
  app.enableCors({
    origin: Object.keys(APP_ORIGINS),
    credentials: true,
  })
  await app.listen(configService.get('PORT', { infer: true }))
}

void bootstrap()
