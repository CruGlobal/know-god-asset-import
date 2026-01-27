#!/usr/bin/env npx tsx

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const BUCKET = process.env.S3_BUCKET_NAME || 'cru-mobilecontentapi-prod'
const PREFIX = 'GodTools/'

async function main() {
  const s3 = new S3Client({})

  console.log(`Checking S3 bucket: ${BUCKET}`)
  console.log(`Prefix: ${PREFIX}\n`)

  try {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        MaxKeys: 20
      })
    )

    if (!response.Contents || response.Contents.length === 0) {
      console.log('No objects found.')
      return
    }

    console.log(`Found ${response.KeyCount} objects (showing up to 20):\n`)

    for (const obj of response.Contents) {
      const size = obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : 'N/A'
      const modified = obj.LastModified?.toISOString() || 'N/A'
      console.log(`  ${obj.Key}`)
      console.log(`    Size: ${size}, Modified: ${modified}\n`)
    }

    if (response.IsTruncated) {
      console.log('... (more objects exist)')
    }
  } catch (error) {
    console.error('Error accessing S3:', error)
    process.exit(1)
  }
}

main()
