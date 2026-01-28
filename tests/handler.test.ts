import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { S3Event } from 'aws-lambda'

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({})
  })),
  PutObjectCommand: vi.fn()
}))

// Mock extract-zip
vi.mock('extract-zip', () => ({
  default: vi.fn()
}))

// Mock tmp
vi.mock('tmp', () => ({
  default: {
    fileSync: vi.fn(() => ({ name: '/tmp/test.zip' })),
    dirSync: vi.fn(() => ({ name: '/tmp/extract' }))
  }
}))

// Mock fs
vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('<xml>test</xml>')),
    readdirSync: vi.fn(() => ['file1.xml', 'file2.xml', 'readme.txt']),
    lstatSync: vi.fn(() => ({ isDirectory: () => false }))
  }
}))

describe('handler', () => {
  const mockTranslationsResponse = {
    data: [
      {
        id: 'trans-123',
        type: 'translation',
        attributes: { version: 5 },
        relationships: {
          resource: { data: { id: 'res-1', type: 'resource' } },
          language: { data: { id: 'lang-1', type: 'language' } }
        }
      }
    ],
    included: [
      { id: 'lang-1', type: 'language', attributes: { code: 'en', name: 'English' } },
      { id: 'res-1', type: 'resource', attributes: { abbreviation: 'kgp', name: 'Knowing God Personally' } }
    ]
  }

  const createS3Event = (key: string): S3Event => ({
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: 'us-east-1',
        eventTime: '2024-01-01T00:00:00.000Z',
        eventName: 'ObjectCreated:Put',
        userIdentity: { principalId: 'test' },
        requestParameters: { sourceIPAddress: '127.0.0.1' },
        responseElements: {
          'x-amz-request-id': 'test',
          'x-amz-id-2': 'test'
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: 'test',
          bucket: {
            name: 'cru-mobilecontentapi-prod',
            ownerIdentity: { principalId: 'test' },
            arn: 'arn:aws:s3:::cru-mobilecontentapi-prod'
          },
          object: {
            key,
            size: 1000,
            eTag: 'test',
            sequencer: 'test'
          }
        }
      }
    ]
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should parse S3 key correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
      })

    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith('  Resource: kgp')
    expect(consoleSpy).toHaveBeenCalledWith('  Language: en')
    expect(consoleSpy).toHaveBeenCalledWith('  Version ID: 5')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('=== Complete: trans-123 ==='))

    consoleSpy.mockRestore()
  })

  it('should handle translation not found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const emptyResponse = {
      data: [],
      included: [
        { id: 'lang-1', type: 'language', attributes: { code: 'en', name: 'English' } },
        { id: 'res-1', type: 'resource', attributes: { abbreviation: 'kgp', name: 'Knowing God Personally' } }
      ]
    }

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve(emptyResponse)
    })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_999.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith('  ERROR: No translation found matching criteria')

    consoleSpy.mockRestore()
  })

  it('should handle language not found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const responseWithoutLanguage = {
      data: [],
      included: [
        { id: 'res-1', type: 'resource', attributes: { abbreviation: 'kgp', name: 'Knowing God Personally' } }
      ]
    }

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve(responseWithoutLanguage)
    })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/xx/version_1.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith("  ERROR: Language 'xx' not found in API response")

    consoleSpy.mockRestore()
  })

  it('should filter to only XML files', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = await import('fs')

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
      })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    // readFileSync should only be called for XML files (2 times, not 3)
    expect(fs.default.readFileSync).toHaveBeenCalledTimes(2)
    expect(consoleSpy).toHaveBeenCalledWith('  XML files to upload: 2')

    consoleSpy.mockRestore()
  })

  it('should handle zip download error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        body: null
      })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith('  ERROR: Zip download failed with status 404')

    consoleSpy.mockRestore()
  })

  it('should handle zip extraction error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const extract = await import('extract-zip')
    vi.mocked(extract.default).mockRejectedValueOnce(new Error('Extraction failed'))

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
      })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith('  ERROR: Extraction failed:', expect.any(Error))

    consoleSpy.mockRestore()
  })

  it('should handle empty extract directory', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = await import('fs')
    vi.mocked(fs.default.readdirSync).mockReturnValueOnce([])

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
      })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    expect(consoleSpy).toHaveBeenCalledWith('  ERROR: Extracted folder is empty')

    consoleSpy.mockRestore()
  })

  it('should skip directories when uploading', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = await import('fs')

    vi.mocked(fs.default.lstatSync)
      .mockReturnValueOnce({ isDirectory: () => true } as any)
      .mockReturnValueOnce({ isDirectory: () => false } as any)

    vi.mocked(fs.default.readdirSync).mockReturnValueOnce(['subdir.xml', 'file.xml'] as any)

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(mockTranslationsResponse)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
      })

    vi.resetModules()
    const { handler } = await import('../src/index.js')

    const event = createS3Event('GodTools/kgp/en/version_5.zip')
    const handlerPromise = handler(event)

    await vi.advanceTimersByTimeAsync(1500)
    await handlerPromise

    // readFileSync should only be called once (for file.xml, not subdir.xml)
    expect(fs.default.readFileSync).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith('  Skipping directory: subdir.xml')

    consoleSpy.mockRestore()
  })
})
