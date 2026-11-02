import 'reflect-metadata'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseFilters,
  UsePipes,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common'
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import type { Server } from 'node:http'
import request from 'supertest'
import { F7ExceptionFilter, F7ValidationPipe } from './f7-exception.filter'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { CustomerProfilesController } from './customer-profiles.controller'
import { CustomerAccountProfilesController } from './customer-account-profiles.controller'
import { CustomerIdentityController } from './customer-identity.controller'
import { WatchlistController } from '../watchlist/watchlist.controller'
import { ScreeningController, ScreeningCheckController } from '../screening/screening.controller'

jest.mock('./profile-identity.service', () => ({ ProfileIdentityService: class {} }))

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
class NameDto {
  @IsString() firstName!: string
}
class InputDto {
  @ValidateNested() @Type(() => NameDto) passenger!: NameDto
}
@UseFilters(F7ExceptionFilter)
@Controller('f7-errors')
class ErrorController {
  @Get(':kind') get(@Param('kind') kind: string) {
    const exceptions: Record<string, Error> = {
      validation: new BadRequestException('Invalid date'),
      unauthorized: new UnauthorizedException(),
      forbidden: new ForbiddenException('Security role required'),
      missing: new NotFoundException('Entry not found'),
      conflict: new ConflictException('Reload the entry'),
      unavailable: new ServiceUnavailableException('Private database host'),
      internal: new Error('Private query and credentials'),
      unprocessable: new HttpException({ message: 'Invalid input' }, 422),
    }
    throw exceptions[kind] ?? new Error('Unexpected failure')
  }
  @Post()
  @UsePipes(new F7ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  save(@Body() body: InputDto) {
    return body
  }
}
@Controller('auth-control')
class AuthControlController {
  @Get() get() {
    throw new UnauthorizedException('Legacy auth response')
  }
}

describe('F7 exception envelope and scope', () => {
  let app: INestApplication
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ErrorController, AuthControlController] }).compile()
    app = module.createNestApplication()
    await app.init()
  })
  afterAll(async () => {
    await app.close()
  })
  it.each([
    ['validation', 400, 'VALIDATION_ERROR'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['missing', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['internal', 500, 'INTERNAL_ERROR'],
    ['unavailable', 503, 'INTERNAL_ERROR'],
    ['unprocessable', 422, 'VALIDATION_ERROR'],
  ])('normalizes %s while retaining HTTP %s', async (kind, status, code) => {
    const result = await request(app.getHttpServer() as Server)
      .get('/f7-errors/' + kind)
      .expect(status)
    expect(result.body).toEqual({ error: { code, message: expect.any(String) } })
    expect(JSON.stringify(result.body)).not.toMatch(/Private|credentials|stack/)
  })
  it('returns field paths without DTO targets or values', async () => {
    const result = await request(app.getHttpServer() as Server)
      .post('/f7-errors')
      .send({ passenger: { firstName: 123 } })
      .expect(400)
    expect(result.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { fields: [{ field: 'passenger.firstName', message: 'firstName must be a string' }] },
      },
    })
    expect(JSON.stringify(result.body)).not.toMatch(/123|target|value/)
  })
  it('does not change an unscoped auth response', async () => {
    const result = await request(app.getHttpServer() as Server)
      .get('/auth-control')
      .expect(401)
    expect(result.body).toMatchObject({ statusCode: 401, message: 'Legacy auth response' })
  })
  it.each([
    PassengerProfilesController,
    CustomerProfilesController,
    CustomerAccountProfilesController,
    CustomerIdentityController,
    WatchlistController,
    ScreeningController,
    ScreeningCheckController,
  ])('scopes the filter to %p', (controller) => {
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, controller)).toContain(F7ExceptionFilter)
  })
})
