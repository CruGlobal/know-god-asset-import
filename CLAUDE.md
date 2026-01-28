# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Lambda function that processes GodTools translation assets. When a `.zip` file is uploaded to the `cru-mobilecontentapi-prod` S3 bucket with prefix `GodTools/`, this function:

1. Parses the S3 key to extract resource, language, and version ID
2. Fetches translation metadata from the Mobile Content API
3. Downloads the translation zip from the API
4. Extracts XML files and uploads them to the `know-god-assets` S3 bucket

## Commands

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Run tests
npm run test
```

## Architecture

- **TypeScript source** in `src/` directory
  - `src/index.ts` - Lambda handler with main business logic
  - `src/types.ts` - TypeScript interfaces for API responses
- **Docker container deployment** via `Dockerfile`
- **Terraform** (`know-god-terraform/`) - defines Lambda, S3 triggers, IAM permissions, ECR repo
- **GitHub Actions** - builds Docker image and deploys via cru-deploy

## Key Details

- Runtime: Node.js 24.x (Docker container)
- Uses AWS SDK v3 (`@aws-sdk/client-s3`)
- Uses native `fetch` for HTTP requests
- `extract-zip` v2.x with async/await API
- Lambda has 60-second timeout
- 1.5 second delay before API call allows translation data to be saved
- Environment variables configured via Terraform/SSM:
  - `S3_BUCKET_NAME` - source bucket (cru-mobilecontentapi-prod)
  - `S3_OUTPUT_BUCKET` - destination bucket (know-god-assets)
  - `MOBILE_CONTENT_API_URL` - API endpoint
