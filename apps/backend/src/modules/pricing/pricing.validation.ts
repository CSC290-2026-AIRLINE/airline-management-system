import { ValidationPipe } from '@nestjs/common'

// Applied with @UsePipes on every pricing controller, so DTO validation stays inside this module
// instead of a global pipe in main.ts. Unknown fields are rejected and query strings become numbers.
export const pricingValidationPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
