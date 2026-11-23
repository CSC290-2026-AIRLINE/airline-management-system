import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import sharp from 'sharp'
import type { Readable } from 'node:stream'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'

export const LOST_REPORT_PHOTO_S3_CLIENT = Symbol('LOST_REPORT_PHOTO_S3_CLIENT')
export const LOST_REPORT_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const LOST_REPORT_PHOTO_BUCKET = 'airline-private'

export interface UploadedLostReportPhoto {
  buffer: Buffer
  mimetype: string
  size: number
}

export interface LostReportPhotoObject {
  body: Readable
  contentType: 'image/jpeg' | 'image/png'
  contentLength?: number
}

export interface ReportPhotoStorage {
  upload(reportId: string, photo: UploadedLostReportPhoto): Promise<void>
  remove(reportId: string): Promise<void>
  retrieve(reportId: string): Promise<LostReportPhotoObject>
}

function invalidPhoto(): BaggageError {
  return new BaggageError(BAGGAGE_ERROR_CODES.INVALID_PHOTO, 'Choose a valid JPG or PNG image no larger than 10 MB')
}

function hasCompletePngChunks(buffer: Buffer): boolean {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) return false

  let offset = pngSignature.length
  let hasHeader = false
  let hasImageData = false

  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset)
    const chunkEnd = offset + 12 + dataLength
    if (chunkEnd > buffer.length) return false

    const chunkType = buffer.toString('ascii', offset + 4, offset + 8)
    if (!hasHeader) {
      if (chunkType !== 'IHDR' || dataLength !== 13) return false
      hasHeader = true
    }
    if (chunkType === 'IDAT') hasImageData = true
    if (chunkType === 'IEND') return dataLength === 0 && hasHeader && hasImageData && chunkEnd === buffer.length

    offset = chunkEnd
  }

  return false
}

export async function verifiedLostReportPhotoType(photo: UploadedLostReportPhoto): Promise<'image/jpeg' | 'image/png'> {
  if (!photo?.buffer?.length || photo.size > LOST_REPORT_PHOTO_MAX_BYTES || photo.buffer.length > LOST_REPORT_PHOTO_MAX_BYTES) {
    throw invalidPhoto()
  }

  const expectedFormat = photo.mimetype === 'image/jpeg' ? 'jpeg' : photo.mimetype === 'image/png' ? 'png' : null
  if (!expectedFormat) throw invalidPhoto()

  try {
    if (expectedFormat === 'png' && !hasCompletePngChunks(photo.buffer)) throw invalidPhoto()

    const decoder = sharp(photo.buffer, { failOn: 'warning' })
    const metadata = await decoder.metadata()
    if (metadata.format !== expectedFormat) throw invalidPhoto()

    // Metadata reads only the image header. Pixel statistics force a full decode,
    // rejecting files with a valid prefix but truncated or malformed image data.
    await decoder.stats()
  } catch (error) {
    if (error instanceof BaggageError) throw error
    throw invalidPhoto()
  }

  return expectedFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
}

@Injectable()
export class LostReportPhotoStorage {
  constructor(
    @Inject(LOST_REPORT_PHOTO_S3_CLIENT) private readonly client: S3Client,
    private readonly config: ConfigService,
  ) {}

  async upload(reportId: string, photo: UploadedLostReportPhoto): Promise<void> {
    const contentType = await verifiedLostReportPhotoType(photo)
    this.ensureConfigured()

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: LOST_REPORT_PHOTO_BUCKET,
          Key: this.objectKey(reportId),
          Body: photo.buffer,
          ContentLength: photo.buffer.length,
          ContentType: contentType,
          CacheControl: 'private, no-store',
        }),
      )
    } catch {
      throw this.storageUnavailable()
    }
  }

  async remove(reportId: string): Promise<void> {
    this.ensureConfigured()

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: LOST_REPORT_PHOTO_BUCKET,
          Key: this.objectKey(reportId),
        }),
      )
    } catch {
      throw this.storageUnavailable()
    }
  }

  async retrieve(reportId: string): Promise<LostReportPhotoObject> {
    this.ensureConfigured()

    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: LOST_REPORT_PHOTO_BUCKET,
          Key: this.objectKey(reportId),
        }),
      )
      const contentType = result.ContentType
      if ((contentType !== 'image/jpeg' && contentType !== 'image/png') || !result.Body || !('pipe' in result.Body)) {
        throw new BaggageError(BAGGAGE_ERROR_CODES.PHOTO_NOT_FOUND, 'Lost baggage photo not found')
      }

      return {
        body: result.Body,
        contentType,
        contentLength: result.ContentLength,
      }
    } catch (error) {
      if (error instanceof BaggageError) throw error
      const statusCode =
        typeof error === 'object' && error !== null && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined
      const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
      if (statusCode === 404 || name === 'NoSuchKey' || name === 'NotFound') {
        throw new BaggageError(BAGGAGE_ERROR_CODES.PHOTO_NOT_FOUND, 'Lost baggage photo not found')
      }
      throw this.storageUnavailable()
    }
  }

  private objectKey(reportId: string): string {
    return `feature10/lost-reports/${reportId}/photo`
  }

  private ensureConfigured(): void {
    const endpoint = this.config.get<string>('S3_ENDPOINT')
    const accessKey = this.config.get<string>('S3_ACCESS_KEY')
    const secretKey = this.config.get<string>('S3_SECRET_KEY')
    if (!endpoint || !accessKey || !secretKey) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.PHOTO_STORAGE_UNAVAILABLE, 'Lost baggage photo storage is unavailable')
    }
  }

  private storageUnavailable(): BaggageError {
    return new BaggageError(BAGGAGE_ERROR_CODES.PHOTO_STORAGE_UNAVAILABLE, 'Lost baggage photo storage is unavailable')
  }
}
