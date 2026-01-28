import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import extract from 'extract-zip'
import tmp from 'tmp'
import fs from 'fs'
import path from 'path'
import type { S3Event, TranslationsResponse, Language, Resource, Translation } from './types.js'

const s3OutputBucket = process.env.S3_OUTPUT_BUCKET || 'know-god-assets'
const mobileContentAPI = process.env.MOBILE_CONTENT_API_URL || 'https://mobile-content-api.cru.org'

const s3 = new S3Client({})

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export const handler = async (event: S3Event): Promise<void> => {
  console.log('=== Starting handler ===')
  console.log(`Output bucket: ${s3OutputBucket}`)
  console.log(`Mobile Content API: ${mobileContentAPI}`)

  const s3Key = event.Records[0].s3.object.key
  console.log(`\n[1/7] Parsing S3 key: ${s3Key}`)

  const pathParts = s3Key.split('/')
  const resourceCode = pathParts[1]
  const languageCode = pathParts[2]
  let zipFilename = pathParts[3]

  console.log(`  Resource: ${resourceCode}`)
  console.log(`  Language: ${languageCode}`)
  console.log(`  Zip file: ${zipFilename}`)

  zipFilename = zipFilename.substring(8) // Remove 'version_' prefix
  const versionId = zipFilename.substring(0, zipFilename.length - 4) // Remove '.zip' suffix
  console.log(`  Version ID: ${versionId}`)

  console.log('\n[2/7] Waiting 1.5s for API to save translation...')
  await delay(1500)

  console.log('\n[3/7] Fetching translations from API...')
  const apiUrl = `${mobileContentAPI}/translations?include=resource,language`
  console.log(`  GET ${apiUrl}`)
  const response = await fetch(apiUrl)
  console.log(`  Response status: ${response.status}`)
  const jsonResponse = (await response.json()) as TranslationsResponse
  console.log(`  Found ${jsonResponse.data.length} translations, ${jsonResponse.included.length} included records`)

  console.log('\n[4/7] Finding language and resource...')
  const language = jsonResponse.included.find((record): record is Language => {
    return record.type === 'language' && record.attributes.code === languageCode
  })

  const resource = jsonResponse.included.find((record): record is Resource => {
    return record.type === 'resource' && record.attributes.abbreviation === resourceCode
  })

  if (!language) {
    console.log(`  ERROR: Language '${languageCode}' not found in API response`)
    return
  }
  console.log(`  Language: ${language.attributes.name} (id: ${language.id})`)

  if (!resource) {
    console.log(`  ERROR: Resource '${resourceCode}' not found in API response`)
    return
  }
  console.log(`  Resource: ${resource.attributes.name} (id: ${resource.id})`)

  console.log('\n[5/7] Finding matching translation...')
  console.log(`  Looking for: resource=${resource.id}, language=${language.id}, version=${versionId}`)

  const translation = jsonResponse.data.find((t: Translation) => {
    return (
      t.relationships.resource.data.id === resource.id &&
      t.relationships.language.data.id === language.id &&
      t.attributes.version === Number(versionId)
    )
  })

  if (!translation) {
    console.log(`  ERROR: No translation found matching criteria`)
    console.log(`  Available versions for this resource/language:`)
    const matchingTranslations = jsonResponse.data.filter((t: Translation) => {
      return (
        t.relationships.resource.data.id === resource.id &&
        t.relationships.language.data.id === language.id
      )
    })
    matchingTranslations.forEach(t => {
      console.log(`    - version ${t.attributes.version} (id: ${t.id})`)
    })
    return
  }
  console.log(`  Found translation: ${translation.id} (version ${translation.attributes.version})`)

  console.log('\n[6/7] Downloading translation zip...')
  const downloadUrl = `${mobileContentAPI}/translations/${translation.id}`
  console.log(`  GET ${downloadUrl}`)

  const tmpZip = tmp.fileSync()
  const downloadResponse = await fetch(downloadUrl)
  console.log(`  Response status: ${downloadResponse.status}`)

  if (!downloadResponse.ok || !downloadResponse.body) {
    console.log(`  ERROR: Zip download failed with status ${downloadResponse.status}`)
    return
  }

  const arrayBuffer = await downloadResponse.arrayBuffer()
  const zipSize = (arrayBuffer.byteLength / 1024).toFixed(1)
  console.log(`  Downloaded ${zipSize} KB`)
  fs.writeFileSync(tmpZip.name, Buffer.from(arrayBuffer))
  console.log(`  Saved to: ${tmpZip.name}`)

  console.log('\n[7/7] Extracting and uploading XML files...')
  const tmpExtractDir = tmp.dirSync({ unsafeCleanup: true })
  console.log(`  Extract dir: ${tmpExtractDir.name}`)

  try {
    await extract(tmpZip.name, { dir: tmpExtractDir.name })
  } catch (err) {
    console.log(`  ERROR: Extraction failed:`, err)
    return
  }

  const files = fs.readdirSync(tmpExtractDir.name)
  console.log(`  Extracted ${files.length} files: ${files.join(', ')}`)

  if (!files || files.length === 0) {
    console.log(`  ERROR: Extracted folder is empty`)
    return
  }

  const xmlFiles = files.filter(file => file.includes('.xml'))
  console.log(`  XML files to upload: ${xmlFiles.length}`)

  const uploadPromises: Promise<void>[] = []

  for (const fileName of xmlFiles) {
    const filePath = path.join(tmpExtractDir.name, fileName)

    if (fs.lstatSync(filePath).isDirectory()) {
      console.log(`  Skipping directory: ${fileName}`)
      continue
    }

    const fileContent = fs.readFileSync(filePath)
    const s3Key = path.join(translation.id, fileName)
    console.log(`  Uploading: s3://${s3OutputBucket}/${s3Key} (${(fileContent.length / 1024).toFixed(1)} KB)`)

    uploadPromises.push(
      s3
        .send(
          new PutObjectCommand({
            Bucket: s3OutputBucket,
            Key: s3Key,
            Body: fileContent,
            ACL: 'public-read'
          })
        )
        .then(() => {
          console.log(`  Uploaded: ${fileName}`)
        })
    )
  }

  await Promise.all(uploadPromises)
  console.log(`\n=== Complete: ${translation.id} ===`)
}
