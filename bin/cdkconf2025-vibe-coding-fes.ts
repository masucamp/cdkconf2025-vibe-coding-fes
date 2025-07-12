#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TimestreamNeptuneStack } from '../lib/timestream-neptune-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();

// Create the main stack
const stack = new TimestreamNeptuneStack(app, 'TimestreamNeptuneStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Well-Architected Timestream and Neptune analytics platform',
  tags: {
    Project: 'TimestreamNeptuneAnalytics',
    Environment: 'Production',
    Owner: 'DataEngineering',
    CostCenter: 'Analytics',
  },
});

// Apply CDK Nag for security best practices
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Add stack-level tags for cost allocation and governance
cdk.Tags.of(stack).add('Application', 'TimestreamNeptuneAnalytics');
cdk.Tags.of(stack).add('Compliance', 'SOC2');
cdk.Tags.of(stack).add('DataClassification', 'Internal');