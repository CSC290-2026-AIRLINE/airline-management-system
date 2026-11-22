import { ValidationPipe } from '@nestjs/common'

// Validation for the pricing controllers only. Not registered globally, so other teams' endpoints keep their own rules.
export const pricingValidationPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
