#!/usr/bin/env node

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { readOutputs } = require('./utils/read-outputs')
/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    region: 'us-east-1',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--region':
        options.region = args[i + 1]
        i++ // Skip next argument as it's the value
        break
      case '--bucket-name':
        options.bucketName = args[i + 1]
        i++ // Skip next argument as it's the value
        break
      case '--trust-account-one':
        options.trustAccountOne = args[i + 1]
        i++ // Skip next argument as it's the value
        break
      case '--trust-account-two':
        options.trustAccountTwo = args[i + 1]
        i++ // Skip next argument as it's the value
        break
      case '--help':
      case '-h':
        console.log(`
Usage: node deploy.js [options]

Options:
  --region <region>                    AWS region to deploy to (default: us-east-1)
  --bucket-name <name>                 S3 bucket name (default: s3-mcp-bucket)
  --trust-account-one <account-id>     First Vendia account ID for trust policy (default: 690332314549)
  --trust-account-two <account-id>     Second Vendia account ID for trust policy (default: 332134949057)
  --help, -h                           Show this help message

Environment Variables:
  AWS_DEFAULT_REGION                   AWS region (overridden by --region)
  BUCKET_NAME                          S3 bucket name (overridden by --bucket-name)
  TRUST_ACCOUNT_ONE                    First Vendia account ID (overridden by --trust-account-one)
  TRUST_ACCOUNT_TWO                    Second Vendia account ID (overridden by --trust-account-two)
        `)
        process.exit(0)
        break
    }
  }

  if(!options.region) {
    console.error('❌ Error: Region is required')
    process.exit(1)
  }

  return options
}

/**
 * Deploy CloudFormation stack for S3 MCP infrastructure
 */

const STACK_NAME = 's3-mcp-infrastructure'
const TEMPLATE_FILE = path.join(__dirname, '..', 'stack.yml')

function log(message) {
  console.log(`[DEPLOY] ${message}`)
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

async function deployStack(options) {
  const previousOutputs = await readOutputs()
  console.log(previousOutputs)
  const bucketName = options.bucketName || process.env.BUCKET_NAME || previousOutputs.BucketName
  const region = options.region || process.env.AWS_DEFAULT_REGION || previousOutputs.Region || 'us-east-1'
  const trustAccountOne = options.trustAccountOne || process.env.TRUST_ACCOUNT_ONE || previousOutputs.TrustPolicyAccountIdOne || '690332314549'
  const trustAccountTwo = options.trustAccountTwo || process.env.TRUST_ACCOUNT_TWO || previousOutputs.TrustPolicyAccountIdTwo || '332134949057'

  log(`Deploying stack: ${STACK_NAME}`)
  log(`Using bucket name: ${bucketName}`)
  log(`Using region: ${region}`)
  console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────')
  log('Vendia Trust Relationship AWS Accounts:')
  log(`Using trust account one: ${trustAccountOne}`)
  log(`Using trust account two: ${trustAccountTwo}`)
  console.log('https://docs.vendia.com/platform/vendia-mcp-server/storage-connections/')
  console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────')
  log(`Using template: ${TEMPLATE_FILE}`)

  const exists = stackExists(STACK_NAME, region)
  const operation = exists ? 'update-stack' : 'create-stack'
  const operationText = exists ? 'Updating' : 'Creating'

  const command = `aws cloudformation ${operation} \\
    --stack-name ${STACK_NAME} \\
    --template-body file://${TEMPLATE_FILE} \\
    --parameters \
        ParameterKey=YourBucketName,ParameterValue=s3-mcp-test-bucket-12345 \
        ParameterKey=TrustPolicyAccountIdOne,ParameterValue=${trustAccountOne} \
        ParameterKey=TrustPolicyAccountIdTwo,ParameterValue=${trustAccountTwo} \
    --capabilities CAPABILITY_NAMED_IAM \\
    --region ${region}`

  if (!trustAccountOne || !trustAccountTwo) {
    console.error('❌ Error: AWS account IDs for Trusted Relationships are required')
    console.log(`
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::TRUST_ACCOUNT_ONE:root",
          "arn:aws:iam::TRUST_ACCOUNT_TWO:root"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
} 

Example:
node deploy.js --trust-account-one 690332314549 --trust-account-two 332134949057 --bucket-name s3-mcp-test-bucket-12345
`)
    throw new Error('AWS account IDs for Trusted Relationships are required')
  }

  // Use safe execution to handle "no updates" scenario
  const result = execCommandSafe(command, `${operationText} CloudFormation stack...`)
  
  if (!result.success) {
    // Check if it's a "no updates" error
    if (result.stderr && result.stderr.includes('No updates are to be performed')) {
      log('ℹ️  No updates are needed - stack is already up to date!')
    } else {
      // Handle other errors
      console.error(`Error: ${result.error}`)
      if (result.stdout) console.log('STDOUT:', result.stdout)
      if (result.stderr) console.error('STDERR:', result.stderr)
      process.exit(1)
    }
  } else {
    // Wait for stack operation to complete only if there was an actual update
    const waitCommand = exists ? 'stack-update-complete' : 'stack-create-complete'
    log('Waiting for stack operation to complete...')

    execCommand(
      `aws cloudformation wait ${waitCommand} --stack-name ${STACK_NAME} --region ${region}`,
      'Waiting for stack operation to complete...'
    )

    log('✅ Stack deployment completed successfully!')
  }

  // Get and display outputs regardless of whether there were updates
  const outputs = execCommand(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].Outputs' --output json --region ${region}`,
    'Getting stack outputs...'
  )

  // Parse the JSON outputs
  let outputsData
  try {
    outputsData = JSON.parse(outputs)
  } catch (error) {
    console.error('Error parsing stack outputs JSON:', error.message)
    process.exit(1)
  }

  // Write outputs to JSON file
  const outputsFile = path.join(__dirname, '..', 'outputs.json')
  try {
    fs.writeFileSync(outputsFile, JSON.stringify(outputsData, null, 2))
    log(`📄 Stack outputs written to: ${outputsFile}`)
  } catch (error) {
    console.error('Error writing outputs file:', error.message)
    process.exit(1)
  }

  // Display outputs in a readable format
  console.log('\\n📊 Stack Outputs:')
  if (outputsData && outputsData.length > 0) {
    outputsData.forEach(output => {
      console.log(`${output.OutputKey}: ${output.OutputValue}`)
    })
  } else {
    console.log('No outputs found')
  }
}

async function main() {
  // Parse command line arguments
  const options = parseArgs()
  
  log('Starting S3 MCP infrastructure deployment...')

  // Pre-flight checks
  checkAWSCLI()
  checkAWSCredentials()

  // Deploy the stack
  await deployStack(options)

  log('🎉 StackDeployment completed successfully!')
}

if (require.main === module) {
  main()
}

module.exports = { deployStack, stackExists, STACK_NAME }