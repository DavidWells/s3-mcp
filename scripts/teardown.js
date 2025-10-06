#!/usr/bin/env node

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { readOutputs } = require('./utils/read-outputs')

const STACK_NAME = 's3-mcp-infrastructure'

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    region: 'us-east-1',
    force: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--region':
        options.region = args[i + 1]
        i++ // Skip next argument as it's the value
        break
      case '--force':
      case '-f':
        options.force = true
        break
      case '--help':
      case '-h':
        console.log(`
Usage: node teardown.js [options]

Options:
  --region <region>                    AWS region (default: us-east-1)
  --force, -f                          Skip confirmation prompts
  --help, -h                           Show this help message

Environment Variables:
  AWS_DEFAULT_REGION                   AWS region (overridden by --region)
        `)
        process.exit(0)
        break
    }
  }

  return options
}

function log(message) {
  console.log(`[TEARDOWN] ${message}`)
}

function execCommand(command, description) {
  log(description)
  try {
    const result = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    })
    return result
  } catch (error) {
    console.error(`Error: ${error.message}`)
    if (error.stdout) console.log('STDOUT:', error.stdout)
    if (error.stderr) console.error('STDERR:', error.stderr)
    process.exit(1)
  }
}

function execCommandSafe(command, description) {
  log(description)
  try {
    const result = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    })
    return { success: true, result }
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    }
  }
}

function checkAWSCLI() {
  try {
    execSync('aws --version', { stdio: 'pipe' })
    log('AWS CLI is installed and available')
  } catch (error) {
    console.error('Error: AWS CLI is not installed or not available in PATH')
    console.error('Please install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html')
    process.exit(1)
  }
}

function checkAWSCredentials() {
  try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' })
    log('AWS credentials are configured')
  } catch (error) {
    console.error('Error: AWS credentials are not configured')
    console.error('Please configure AWS credentials using: aws configure')
    process.exit(1)
  }
}

function stackExists(stackName, region) {
  try {
    execSync(`aws cloudformation describe-stacks --stack-name ${stackName} --region ${region}`, { stdio: 'pipe' })
    return true
  } catch (error) {
    return false
  }
}

/**
 * Clear all objects from S3 bucket
 */
async function clearS3Bucket(bucketName, region) {
  log(`Clearing S3 bucket: ${bucketName}`)

  try {
    // List all object versions and delete markers
    const listCommand = `aws s3api list-object-versions --bucket ${bucketName} --region ${region}`
    const listResult = execCommandSafe(listCommand, 'Listing all object versions and delete markers...')

    if (!listResult.success) {
      log('Bucket appears to be empty or does not exist')
      return
    }

    const listData = JSON.parse(listResult.result)
    const versions = listData.Versions || []
    const deleteMarkers = listData.DeleteMarkers || []
    const totalObjects = versions.length + deleteMarkers.length

    if (totalObjects === 0) {
      log('Bucket is already empty')
      return
    }

    log(`Found ${versions.length} object version(s) and ${deleteMarkers.length} delete marker(s) to remove`)

    // Delete all versions
    if (versions.length > 0) {
      for (const version of versions) {
        const deleteCmd = `aws s3api delete-object --bucket ${bucketName} --key "${version.Key}" --version-id ${version.VersionId} --region ${region}`
        execCommandSafe(deleteCmd, `Deleting version: ${version.Key} (${version.VersionId})`)
      }
    }

    // Delete all delete markers
    if (deleteMarkers.length > 0) {
      for (const marker of deleteMarkers) {
        const deleteCmd = `aws s3api delete-object --bucket ${bucketName} --key "${marker.Key}" --version-id ${marker.VersionId} --region ${region}`
        execCommandSafe(deleteCmd, `Deleting delete marker: ${marker.Key} (${marker.VersionId})`)
      }
    }

    log('✅ S3 bucket cleared successfully')
  } catch (error) {
    console.error('Error clearing S3 bucket:', error.message)
    throw error
  }
}

/**
 * Delete CloudFormation stack
 */
async function deleteStack(stackName, region) {
  log(`Deleting CloudFormation stack: ${stackName}`)
  
  const deleteCommand = `aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`
  const result = execCommandSafe(deleteCommand, 'Initiating stack deletion...')
  
  if (!result.success) {
    console.error('Error deleting stack:', result.error)
    if (result.stderr) console.error('STDERR:', result.stderr)
    throw new Error('Failed to delete CloudFormation stack')
  }

  // Wait for stack deletion to complete
  log('Waiting for stack deletion to complete...')
  execCommand(
    `aws cloudformation wait stack-delete-complete --stack-name ${stackName} --region ${region}`,
    'Waiting for stack deletion to complete...'
  )

  log('✅ CloudFormation stack deleted successfully')
}

/**
 * Clean up outputs.json file
 */
function cleanupOutputs() {
  const outputsFile = path.join(__dirname, '..', 'outputs.json')
  try {
    if (fs.existsSync(outputsFile)) {
      fs.unlinkSync(outputsFile)
      log('📄 Cleaned up outputs.json file')
    }
  } catch (error) {
    console.error('Error cleaning up outputs file:', error.message)
  }
}

/**
 * Confirm teardown operation
 */
async function confirmTeardown(options) {
  if (options.force) {
    return true
  }

  console.log('\n⚠️  WARNING: This will permanently delete:')
  console.log('   - All objects in the S3 bucket')
  console.log('   - The CloudFormation stack and all its resources')
  console.log('   - The IAM role and policies')
  console.log('   - The S3 bucket itself')
  console.log('\nThis action cannot be undone!')
  
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question('\nAre you sure you want to continue? (type "yes" to confirm): ', (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'yes')
    })
  })
}

async function teardown(options) {
  const previousOutputs = await readOutputs()
  const bucketName = previousOutputs.BucketName
  const region = options.region || previousOutputs.Region || 'us-east-1'

  if (!bucketName) {
    console.error('❌ Error: Could not determine bucket name from outputs.json')
    console.error('Please ensure the stack was deployed successfully')
    process.exit(1)
  }

  log(`Starting teardown for stack: ${STACK_NAME}`)
  log(`Using bucket name: ${bucketName}`)
  log(`Using region: ${region}`)

  // Check if stack exists
  if (!stackExists(STACK_NAME, region)) {
    log('Stack does not exist, nothing to teardown')
    return
  }

  // Clear S3 bucket first
  await clearS3Bucket(bucketName, region)

  // Delete CloudFormation stack
  await deleteStack(STACK_NAME, region)

  // Clean up outputs file
  cleanupOutputs()

  log('🎉 Teardown completed successfully!')
}

async function main() {
  // Parse command line arguments
  const options = parseArgs()
  
  log('Starting S3 MCP infrastructure teardown...')

  // Pre-flight checks
  checkAWSCLI()
  checkAWSCredentials()

  // Confirm teardown
  const confirmed = await confirmTeardown(options)
  if (!confirmed) {
    log('Teardown cancelled by user')
    process.exit(0)
  }

  // Perform teardown
  await teardown(options)
}

if (require.main === module) {
  main()
}

module.exports = { teardown, clearS3Bucket, deleteStack, STACK_NAME }
