import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/

// Like ParseUUIDPipe for ids: a malformed :code is a 400, not a 404.
@Injectable()
export class ParseCurrencyCodePipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!CURRENCY_CODE_PATTERN.test(value)) {
      throw new BadRequestException('currency code must be exactly 3 uppercase letters, e.g. USD')
    }
    return value
  }
}
