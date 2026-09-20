import path from 'node:path'
import cookieParser from 'cookie-parser'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  // .env is optional (e.g. env vars provided by the shell/CI)
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  })
  app.setGlobalPrefix('/api')
  app.use(cookieParser())
  app.enableCors({
    origin: ['http://localhost:5151', 'http://localhost:6161'],
    credentials: true,
  })
  await app.listen(process.env.PORT ?? 8080)
}

void bootstrap()
