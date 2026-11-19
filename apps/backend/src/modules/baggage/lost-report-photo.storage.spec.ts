jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }))

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { BAGGAGE_ERROR_CODES } from './common/baggage.errors'
import { LostReportPhotoStorage, LOST_REPORT_PHOTO_MAX_BYTES, verifiedLostReportPhotoType } from './lost-report-photo.storage'

async function makeImage(format: 'jpeg' | 'png'): Promise<Buffer> {
  const image = sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 20, g: 80, b: 140 } } })
  return format === 'jpeg' ? image.jpeg().toBuffer() : image.png().toBuffer()
}

describe('LostReportPhotoStorage', () => {
  const send = jest.fn()
  const configValues: Record<string, string | undefined> = {
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
  }
  const config = { get: jest.fn((key: string) => configValues[key]) } as unknown as ConfigService
  let storage: LostReportPhotoStorage

  beforeEach(() => {
    send.mockReset().mockResolvedValue({})
    storage = new LostReportPhotoStorage({ send } as unknown as S3Client, config)
  })

  it('accepts fully decodable JPEG and PNG images', async () => {
    const jpeg = await makeImage('jpeg')
    const png = await makeImage('png')

    await expect(verifiedLostReportPhotoType({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length })).resolves.toBe('image/jpeg')
    await expect(verifiedLostReportPhotoType({ buffer: png, mimetype: 'image/png', size: png.length })).resolves.toBe('image/png')
  })

  it('rejects signature-only fragments, truncated images, and malformed content', async () => {
    const jpeg = await makeImage('jpeg')
    const png = await makeImage('png')
    const invalidPhotos = [
      { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' },
      { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimetype: 'image/png' },
      { buffer: jpeg.subarray(0, jpeg.length - 4), mimetype: 'image/jpeg' },
      { buffer: png.subarray(0, png.length - 8), mimetype: 'image/png' },
      { buffer: Buffer.from('not an image'), mimetype: 'image/jpeg' },
    ]

    for (const photo of invalidPhotos) {
      await expect(verifiedLostReportPhotoType({ ...photo, size: photo.buffer.length })).rejects.toMatchObject({
        code: BAGGAGE_ERROR_CODES.INVALID_PHOTO,
      })
    }
  })

  it('rejects image data whose decoded format does not match its MIME type', async () => {
    const jpeg = await makeImage('jpeg')
    const png = await makeImage('png')

    await expect(verifiedLostReportPhotoType({ buffer: jpeg, mimetype: 'image/png', size: jpeg.length })).rejects.toMatchObject({
      code: BAGGAGE_ERROR_CODES.INVALID_PHOTO,
    })
    await expect(verifiedLostReportPhotoType({ buffer: png, mimetype: 'image/jpeg', size: png.length })).rejects.toMatchObject({
      code: BAGGAGE_ERROR_CODES.INVALID_PHOTO,
    })
    await expect(verifiedLostReportPhotoType({ buffer: jpeg, mimetype: 'image/webp', size: jpeg.length })).rejects.toMatchObject({
      code: BAGGAGE_ERROR_CODES.INVALID_PHOTO,
    })
  })

  it('enforces the 10 MiB limit and permits a size at the limit', async () => {
    const jpeg = await makeImage('jpeg')
    await expect(verifiedLostReportPhotoType({ buffer: jpeg, mimetype: 'image/jpeg', size: LOST_REPORT_PHOTO_MAX_BYTES })).resolves.toBe(
      'image/jpeg',
    )

    const tooLarge = Buffer.alloc(LOST_REPORT_PHOTO_MAX_BYTES + 1)
    tooLarge.set([0xff, 0xd8, 0xff])
    await expect(verifiedLostReportPhotoType({ buffer: tooLarge, mimetype: 'image/jpeg', size: tooLarge.length })).rejects.toMatchObject({
      code: BAGGAGE_ERROR_CODES.INVALID_PHOTO,
    })
  })

  it('uploads only to the private bucket using a server-derived key and verified content type', async () => {
    const jpeg = await makeImage('jpeg')
    await storage.upload('report-uuid', { buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length })

    const command = send.mock.calls[0][0] as PutObjectCommand
    expect(command.input).toMatchObject({
      Bucket: 'airline-private',
      Key: 'feature10/lost-reports/report-uuid/photo',
      ContentType: 'image/jpeg',
      CacheControl: 'private, no-store',
    })
  })

  it('retrieves verified image content from the private bucket', async () => {
    const body = Readable.from([Buffer.from('image')])
    send.mockResolvedValueOnce({ Body: body, ContentType: 'image/png', ContentLength: 5 })

    await expect(storage.retrieve('report-uuid')).resolves.toEqual({ body, contentType: 'image/png', contentLength: 5 })
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand)
  })

  it('deletes an uploaded object by its server-derived report key', async () => {
    await storage.remove('report-uuid')

    const command = send.mock.calls[0][0] as DeleteObjectCommand
    expect(command.input).toMatchObject({ Bucket: 'airline-private', Key: 'feature10/lost-reports/report-uuid/photo' })
  })

  it('fails closed when private storage settings are unavailable', async () => {
    configValues.S3_ENDPOINT = undefined
    await expect(storage.retrieve('report-uuid')).rejects.toMatchObject({ code: BAGGAGE_ERROR_CODES.PHOTO_STORAGE_UNAVAILABLE })
    expect(send).not.toHaveBeenCalled()
    configValues.S3_ENDPOINT = 'http://localhost:8333'
  })
})
