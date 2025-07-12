#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TimestreamNeptuneStack } from '../lib/timestream-neptune-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';

// Create the main stack with environment-specific configuration
const stack = new TimestreamNeptuneStack(app, 'TimestreamNeptuneStack', {
  environment: environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `Well-Architected Timestream and Neptune analytics platform (${environment})`,
});

// Apply CDK Nag for security best practices
// Only apply in non-development environments to speed up development
if (environment !== 'development' || app.node.tryGetContext('enableNag')) {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}