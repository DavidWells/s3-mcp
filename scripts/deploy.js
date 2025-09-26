#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

/**
 * Deploy CloudFormation stack for S3 MCP infrastructure
 */

const STACK_NAME = 's3-mcp-infrastructure';
const TEMPLATE_FILE = path.join(__dirname, '..', 'stack.yml');

function log(message) {
  console.log(`[DEPLOY] ${message}`);
}

function execCommand(command, description) {
  log(description);
  try {
    const result = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    return result;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }
}

function checkAWSCLI() {
  try {
    execSync('aws --version', { stdio: 'pipe' });
    log('AWS CLI is installed and available');
  } catch (error) {
    console.error('Error: AWS CLI is not installed or not available in PATH');
    console.error('Please install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html');
    process.exit(1);
  }
}

function checkAWSCredentials() {
  try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' });
    log('AWS credentials are configured');
  } catch (error) {
    console.error('Error: AWS credentials are not configured');
    console.error('Please configure AWS credentials using: aws configure');
    process.exit(1);
  }
}

function stackExists(stackName) {
  try {
    execSync(`aws cloudformation describe-stacks --stack-name ${stackName}`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function deployStack() {
  const bucketName = process.env.BUCKET_NAME || 's3-mcp-bucket';

  log(`Deploying stack: ${STACK_NAME}`);
  log(`Using bucket name: ${bucketName}`);
  log(`Using template: ${TEMPLATE_FILE}`);

  const exists = stackExists(STACK_NAME);
  const operation = exists ? 'update-stack' : 'create-stack';
  const operationText = exists ? 'Updating' : 'Creating';

  const command = `aws cloudformation ${operation} \\
    --stack-name ${STACK_NAME} \\
    --template-body file://${TEMPLATE_FILE} \\
    --parameters ParameterKey=YourBucketName,ParameterValue=${bucketName} \\
    --capabilities CAPABILITY_NAMED_IAM \\
    --region \${AWS_DEFAULT_REGION:-us-east-1}`;

  execCommand(command, `${operationText} CloudFormation stack...`);

  // Wait for stack operation to complete
  const waitCommand = exists ? 'stack-update-complete' : 'stack-create-complete';
  log('Waiting for stack operation to complete...');

  execCommand(
    `aws cloudformation wait ${waitCommand} --stack-name ${STACK_NAME}`,
    'Waiting for stack operation to complete...'
  );

  log('✅ Stack deployment completed successfully!');

  // Get and display outputs
  const outputs = execCommand(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].Outputs' --output table`,
    'Getting stack outputs...'
  );

  console.log('\\n📊 Stack Outputs:');
  console.log(outputs);
}

function main() {
  log('Starting S3 MCP infrastructure deployment...');

  // Pre-flight checks
  checkAWSCLI();
  checkAWSCredentials();

  // Deploy the stack
  deployStack();

  log('🎉 Deployment completed successfully!');
  log('');
  log('💡 Tips:');
  log('- Set BUCKET_NAME environment variable to customize bucket name');
  log('- Ensure your AWS region is set correctly (AWS_DEFAULT_REGION)');
  log('- The Vendia role ARN is now available in the stack outputs');
}

if (require.main === module) {
  main();
}

module.exports = { deployStack, stackExists, STACK_NAME };