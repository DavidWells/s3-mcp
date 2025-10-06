# Vendia S3 MCP Example

A CloudFormation stack for deploying an example S3 bucket and the required IAM policies to use with [Vendia's S3 MCP (Model Context Protocol) integration](https://docs.vendia.com/platform/vendia-mcp-server/faq/).

After you deploy this stack, you can [connect the MCP](https://docs.vendia.com/platform/vendia-mcp-server/getting-started/) to Claude Desktop, OpenAI and other MCP tools.

This projects setups a dummy bucket using the data in the `./seed` directory. You can replace this with your own data if you wish!

Deploy, seed your bucket, and chat with your S3 bucket in your AI tool of choice.

## Prerequisites

- **Node.js** (>=20.0.0)
- **AWS CLI** installed and configured
- **AWS credentials** configured (via `aws configure` or environment variables)

## Quick Start

### 1. Deploy the Infrastructure

Deploy the CloudFormation stack to create the S3 bucket and IAM resources:

```bash
npm run deploy
```

Or run directly:

```bash
node scripts/deploy.js
```

### 2. Seed the Data

Upload sample CSV files to the S3 bucket:

```bash
npm run seed
```

Or run directly:

```bash
node scripts/seed.js
```

## Deployment Options

The deploy script supports several command-line options:

```bash
node scripts/deploy.js [options]

Options:
  --region <region>                    AWS region to deploy to (default: us-east-1)
  --bucket-name <name>                 S3 bucket name (default: s3-mcp-bucket)
  --trust-account-one <account-id>     First Vendia account ID for trust policy (default: 690332314549)
  --trust-account-two <account-id>     Second Vendia account ID for trust policy (default: 332134949057)
  --help, -h                           Show help message
```

### Example with custom parameters:

```bash
node scripts/deploy.js --region us-west-2 --bucket-name my-custom-bucket --trust-account-one 123456789012 --trust-account-two 987654321098
```

## Environment Variables

You can also configure deployment using environment variables:

- `AWS_DEFAULT_REGION` - AWS region (overridden by --region)
- `BUCKET_NAME` - S3 bucket name (overridden by --bucket-name)
- `TRUST_ACCOUNT_ONE` - First Vendia account ID (overridden by --trust-account-one)
- `TRUST_ACCOUNT_TWO` - Second Vendia account ID (overridden by --trust-account-two)

## What Gets Deployed

The CloudFormation stack creates:

- **S3 Bucket** - For storing CSV files and data
- **IAM Role** - With trust relationships for Vendia accounts
- **IAM Policies** - For S3 access permissions

## Seed Data

The `seed/` directory contains sample CSV files that will be uploaded to your S3 bucket:

- `q1_2024_sales.csv`
- `q2_2024_sales.csv` 
- `q3_2024_sales.csv`
- `q4_2024_sales.csv`

## Outputs

After deployment, stack outputs are saved to `outputs.json` and include:

- Bucket name
- Region
- Trust policy account IDs
- IAM role ARN

## Troubleshooting

### Common Issues

1. **AWS CLI not found**: Install AWS CLI from [AWS documentation](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

2. **AWS credentials not configured**: Run `aws configure` to set up your credentials

3. **Bucket name conflicts**: S3 bucket names must be globally unique. Try a different bucket name.

4. **Permission denied**: Ensure your AWS credentials have sufficient permissions to create CloudFormation stacks and S3 buckets.

### Getting Help

Run the deploy script with `--help` to see all available options:

```bash
node scripts/deploy.js --help
```

## Vendia Integration

This stack is designed to work with Vendia's MCP server. The trust relationships allow Vendia accounts to assume the IAM role for accessing your S3 bucket.

For more information about Vendia MCP integration, see: https://docs.vendia.com/platform/vendia-mcp-server/storage-connections/

## License

MIT
