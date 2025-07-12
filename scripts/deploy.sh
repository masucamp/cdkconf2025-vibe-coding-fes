#!/bin/bash

# Timestream Neptune Analytics Platform Deployment Script
# This script deploys the CDK stack and provides post-deployment testing

set -e

echo "🚀 Timestream Neptune Analytics Platform Deployment"
echo "=================================================="

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI is not configured or credentials are invalid"
    echo "Please run 'aws configure' first"
    exit 1
fi

# Get current AWS account and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
if [ -z "$REGION" ]; then
    REGION="us-east-1"
    echo "⚠️  No default region set, using us-east-1"
fi

echo "📍 Deploying to Account: $ACCOUNT, Region: $REGION"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build and synthesize
echo "🔨 Building and synthesizing CDK..."
npm run build
npx cdk synth

# Bootstrap CDK (if needed)
echo "🏗️  Bootstrapping CDK (if needed)..."
npx cdk bootstrap

# Deploy the stack
echo "🚀 Deploying stack..."
npx cdk deploy --require-approval never

# Get stack outputs
echo "📋 Getting stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name TimestreamNeptuneStack --region $REGION --query 'Stacks[0].Outputs' --output json)

# Extract important values
KINESIS_STREAM=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="KinesisStreamName") | .OutputValue')
API_URL=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue')
TIMESTREAM_DB=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="TimestreamDatabaseName") | .OutputValue')
NEPTUNE_ENDPOINT=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="NeptuneClusterEndpoint") | .OutputValue')
S3_BUCKET=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue')

echo ""
echo "✅ Deployment completed successfully!"
echo "=================================="
echo "📊 Stack Outputs:"
echo "  • Kinesis Stream: $KINESIS_STREAM"
echo "  • API Gateway URL: $API_URL"
echo "  • Timestream Database: $TIMESTREAM_DB"
echo "  • Neptune Endpoint: $NEPTUNE_ENDPOINT"
echo "  • S3 Bucket: $S3_BUCKET"
echo ""

# Test data sending
echo "🧪 Testing data ingestion..."
if command -v python3 &> /dev/null; then
    echo "📤 Sending test data to Kinesis..."
    python3 scripts/send_test_data.py --stream-name "$KINESIS_STREAM" --region "$REGION" --count 5 --interval 2
    
    echo ""
    echo "⏳ Waiting 30 seconds for data processing..."
    sleep 30
    
    echo "🔍 Testing API query..."
    curl -s "$API_URL/query?type=metrics" | jq '.' || echo "API query test completed (jq not available for formatting)"
else
    echo "⚠️  Python3 not found. Skipping test data sending."
    echo "   You can manually send test data using: python3 scripts/send_test_data.py --stream-name $KINESIS_STREAM"
fi

echo ""
echo "🎉 Setup completed!"
echo "==================="
echo ""
echo "📝 Next Steps:"
echo "  1. Send test data: python3 scripts/send_test_data.py --stream-name $KINESIS_STREAM"
echo "  2. Query API: curl '$API_URL/query?type=metrics'"
echo "  3. Monitor CloudWatch logs and metrics"
echo "  4. Access Neptune via VPC (requires bastion host or VPN)"
echo ""
echo "📚 Documentation: See ARCHITECTURE.md for detailed information"
echo ""
echo "🧹 To clean up resources: npx cdk destroy"
