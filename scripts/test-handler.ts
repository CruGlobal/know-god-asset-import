#!/usr/bin/env npx tsx

import type { S3Event } from 'aws-lambda'

// Use a real S3 key from the bucket
const testKey = process.argv[2] || 'GodTools/kgp/en/version_1.zip'

const event: S3Event = {
  Records: [
    {
      eventVersion: '2.1',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-1',
      eventTime: new Date().toISOString(),
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
          key: testKey,
          size: 1000,
          eTag: 'test',
          sequencer: 'test'
        }
      }
    }
  ]
}

async function main() {
  console.log('=== Testing Lambda Handler ===\n')
  console.log(`S3 Key: ${testKey}\n`)

  // Dynamic import to ensure environment is set up
  const { handler } = await import('../src/index.js')

  try {
    await handler(event)
    console.log('\n=== Handler completed successfully ===')
  } catch (error) {
    console.error('\n=== Handler failed ===')
    console.error(error)
    process.exit(1)
  }
}

main()
