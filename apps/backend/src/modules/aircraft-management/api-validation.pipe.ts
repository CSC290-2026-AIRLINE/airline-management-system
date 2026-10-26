import { ValidationPipe } from '@nestjs/common'

/**
 * Boundary validation for this module: unknown properties are rejected instead of silently dropped,
 * so a typo in a payload surfaces as a 400 rather than as a silently ignored field.
 */
export class ApiValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    })
  }
}
