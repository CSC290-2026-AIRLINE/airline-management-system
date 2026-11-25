import { ValidationPipe } from '@nestjs/common'

// Validation for the payments controllers only. Not registered globally, so other teams' endpoints keep their own rules.
export const paymentsValidationPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
