import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { MONTH_PATTERN } from '../finance.constants'

// Like ParseCurrencyCodePipe: a malformed :month is a 400 before the service runs.
@Injectable()
export class ParseMonthPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!MONTH_PATTERN.test(value)) {
      throw new BadRequestException('month must look like 2026-11')
    }
    return value
  }
}
