#!/usr/bin/env node

/**
 * S3 Upload Script - Setup
 *
 * This script uploads all files in the /seed directory to a specified S3 bucket
 * using AWS SDK v3.
 *
 * Usage: node scripts/setup.js <bucket-name>
 *
 * Environment variables required:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (optional, defaults to 'us-east-1')
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')
const fs = require('fs').promises
const path = require('path')
const { readOutputs } = require('./utils/read-outputs')

// Configuration
const SEED_DIRECTORY = path.join(__dirname, '..', 'seed')
const DEFAULT_REGION = 'us-east-1'

/**
 * Initialize S3 client with configuration
 */
function createS3Client(region = DEFAULT_REGION) {
  const config = {
    region: process.env.AWS_REGION || region,
  }

  // Add credentials if provided via environment variables
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
    
    // Add session token if provided (required for SSO/temporary credentials)
    if (process.env.AWS_SESSION_TOKEN) {
      config.credentials.sessionToken = process.env.AWS_SESSION_TOKEN
    }
  }

  return new S3Client(config)
}

/**
 * Get all files from the seed directory
 */
async function getFilesFromDirectory(directory) {
  try {
    const files = await fs.readdir(directory)
    const filePaths = []

    for (const file of files) {
      const filePath = path.join(directory, file)
      const stats = await fs.stat(filePath)

      if (stats.isFile()) {
        filePaths.push({
          localPath: filePath,
          fileName: file,
          size: stats.size,
        })
      }
    }

    return filePaths
  } catch (error) {
    throw new Error(`Failed to read directory ${directory}: ${error.message}`)
  }
}

/**
 * Upload a single file to S3
 */
async function uploadFileToS3(s3Client, bucketName, file) {
  try {
    console.log(`📤 Uploading ${file.fileName} (${formatBytes(file.size)})...`)

    const fileContent = await fs.readFile(file.localPath)

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: file.fileName,
      Body: fileContent,
      ContentType: getContentType(file.fileName),
      Metadata: {
        'upload-date': new Date().toISOString(),
        'original-size': file.size.toString(),
      },
    })

    const response = await s3Client.send(command)

    console.log(`✅ Successfully uploaded ${file.fileName}`)
    return {
      fileName: file.fileName,
      success: true,
      etag: response.ETag,
      size: file.size,
    }
  } catch (error) {
    console.error(`❌ Failed to upload ${file.fileName}: ${error.message}`)
    return {
      fileName: file.fileName,
      success: false,
      error: error.message,
      size: file.size,
    }
  }
}

/**
 * Check if bucket exists and is accessible
 */
async function checkBucketAccess(s3Client, bucketName) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1,
    })

    await s3Client.send(command)
    return true
  } catch (error) {
    if (error.name === 'NoSuchBucket') {
      throw new Error(`Bucket '${bucketName}' does not exist`)
    } else if (error.name === 'AccessDenied') {
      throw new Error(`Access denied to bucket '${bucketName}'. Check your AWS credentials and permissions.`)
    } else {
      throw new Error(`Cannot access bucket '${bucketName}': ${error.message}`)
    }
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  const contentTypes = {
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.xml': 'application/xml',
  }

  return contentTypes[ext] || 'application/octet-stream'
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Main upload function
 */
async function uploadToS3(bucketName, outputs) {
  console.log('🚀 S3 Upload Script Starting...')
  console.log(`📁 Source directory: ${SEED_DIRECTORY}`)
  console.log(`🪣 Target bucket: ${bucketName}`)
  console.log(`🌍 Region: ${process.env.AWS_REGION || DEFAULT_REGION}`)
  console.log('')

  try {
    // Initialize S3 client
    const s3Client = createS3Client(outputs.Region)

    // Check bucket access
    console.log('🔍 Checking bucket access...')
    await checkBucketAccess(s3Client, bucketName)
    console.log('✅ Bucket is accessible')
    console.log('')

    // Get files from seed directory
    console.log('📂 Scanning seed directory...')
    const files = await getFilesFromDirectory(SEED_DIRECTORY)

    if (files.length === 0) {
      console.log('⚠️  No files found in seed directory')
      return
    }

    console.log(`📋 Found ${files.length} files to upload:`)
    files.forEach((file) => {
      console.log(`   - ${file.fileName} (${formatBytes(file.size)})`)
    })
    console.log('')

    // Upload files
    console.log('📤 Starting uploads...')
    const results = []

    for (const file of files) {
      const result = await uploadFileToS3(s3Client, bucketName, file)
      results.push(result)
    }

    // Print summary
    console.log('')
    console.log('📊 Upload Summary:')
    console.log('==================')

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)


    if (successful.length > 0) {
      const totalSize = successful.reduce((sum, r) => sum + r.size, 0)
      console.log(`✅ Successful uploads: ${successful.length}`)
      console.log(`📈 Total uploaded: ${formatBytes(totalSize)}`)
      console.log('')
      console.log('Successfully uploaded files:')
      successful.forEach((r) => {
        console.log(`   ✅ ${r.fileName} - ETag: ${r.etag}`)
      })
    }

    if (failed.length > 0) {
      console.log('')
      console.log('❌ Failed uploads:')
      failed.forEach((r) => {
        console.log(`   ❌ ${r.fileName} - Error: ${r.error}`)
      })
    }

    console.log('')
    console.log(
      failed.length === 0 ? '🎉 All files uploaded successfully!' : '⚠️  Some uploads failed. Check the errors above.',
    )

    // Exit with appropriate code
    process.exit(failed.length === 0 ? 0 : 1)
  } catch (error) {
    console.error('💥 Script failed:', error.message)
    console.error('')
    console.error('Common solutions:')
    console.error('1. Check your AWS credentials are set correctly')
    console.error('2. Verify the bucket name exists and you have access')
    console.error('3. Ensure AWS_REGION is set if using a non-default region')
    console.error('4. Check that the seed directory contains files')

    process.exit(1)
  }
}

/**
 * Script entry point
 */
async function main() {
  const outputs = await readOutputs()
  // Check command line arguments
  const bucketName = process.argv[2] || outputs.BucketName

  if (!bucketName) {
    console.error('❌ Error: Bucket name is required')
    console.error('')
    console.error('Usage: node scripts/setup.js <bucket-name>')
    console.error('')
    console.error('Example: node scripts/setup.js my-s3-bucket')
    console.error('')
    console.error('Required environment variables:')
    console.error('- AWS_ACCESS_KEY_ID')
    console.error('- AWS_SECRET_ACCESS_KEY')
    console.error('- AWS_REGION (optional, defaults to us-east-1)')

    process.exit(1)
  }

  // Validate bucket name format (basic check)
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName) && bucketName.length > 3) {
    console.error('❌ Error: Invalid bucket name format')
    console.error('Bucket names must be 3-63 characters long and contain only lowercase letters, numbers, and hyphens')
    process.exit(1)
  }

  await uploadToS3(bucketName, outputs)
}

// Run the script if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error)
    process.exit(1)
  })
}

module.exports = {
  uploadToS3,
  createS3Client,
  getFilesFromDirectory,
  uploadFileToS3,
}
