import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TimestreamNeptuneStack } from '../lib/timestream-neptune-stack';
import { getStackConfig } from '../lib/config/stack-config';

describe('TimestreamNeptuneStack', () => {
  let app: cdk.App;
  let stack: TimestreamNeptuneStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      stack = new TimestreamNeptuneStack(app, 'TestStack', {
        environment: 'development',
      });
      template = Template.fromStack(stack);
    });

    test('should create VPC with correct configuration', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('should create KMS Key with key rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    test('should create Timestream Database', () => {
      template.hasResourceProperties('AWS::Timestream::Database', {
        DatabaseName: 'analytics-database',
      });
    });

    test('should create Timestream Table with correct retention', () => {
      template.hasResourceProperties('AWS::Timestream::Table', {
        TableName: 'metrics-table',
        RetentionProperties: {
          memoryStoreRetentionPeriodInHours: '24',
          magneticStoreRetentionPeriodInDays: '365',
        },
      });
    });

    test('should create Neptune Cluster with encryption', () => {
      template.hasResourceProperties('AWS::Neptune::DBCluster', {
        StorageEncrypted: true,
        BackupRetentionPeriod: 7,
        IamAuthEnabled: true,
      });
    });

    test('should create Kinesis Stream with encryption', () => {
      template.hasResourceProperties('AWS::Kinesis::Stream', {
        StreamEncryption: {
          EncryptionType: 'KMS',
        },
      });
    });

    test('should create S3 Bucket with security features', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
              },
            },
          ],
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('should create Lambda functions with VPC configuration', () => {
      // Check that at least one Lambda function has VPC configuration
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.12',
        VpcConfig: {
          SecurityGroupIds: expect.arrayContaining([
            expect.objectContaining({
              'Fn::GetAtt': expect.arrayContaining([
                expect.stringMatching(/LambdaSecurityGroup/),
                'GroupId',
              ]),
            }),
          ]),
        },
      });
    });

    test('should create API Gateway with proper configuration', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'Timestream Neptune Analytics API',
        EndpointConfiguration: {
          Types: ['REGIONAL'],
        },
      });
    });

    test('should create CloudWatch Alarms', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'DatabaseConnections',
        Namespace: 'AWS/Neptune',
      });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
      });
    });

    test('should have correct stack outputs', () => {
      template.hasOutput('TimestreamDatabaseName', {});
      template.hasOutput('NeptuneClusterEndpoint', {});
      template.hasOutput('ApiGatewayUrl', {});
      template.hasOutput('KinesisStreamName', {});
      template.hasOutput('S3BucketName', {});
      template.hasOutput('Environment', {});
    });

    test('should use development-specific configuration', () => {
      const config = stack.stackConfig;
      expect(config.environment).toBe('development');
      expect(config.vpc.natGateways).toBe(1); // Development uses fewer NAT gateways
      expect(config.kinesis.shardCount).toBe(1); // Development uses fewer shards
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      stack = new TimestreamNeptuneStack(app, 'TestStack', {
        environment: 'production',
      });
      template = Template.fromStack(stack);
    });

    test('should use production-specific configuration', () => {
      const config = stack.stackConfig;
      expect(config.environment).toBe('production');
      expect(config.vpc.natGateways).toBe(3); // Production uses more NAT gateways
      expect(config.kinesis.shardCount).toBe(4); // Production uses more shards
      expect(config.neptune.instanceClass).toBe('db.r5.large'); // Production uses larger instances
    });
  });

  describe('Configuration Management', () => {
    test('should load correct configuration for each environment', () => {
      const devConfig = getStackConfig('development');
      const prodConfig = getStackConfig('production');

      expect(devConfig.environment).toBe('development');
      expect(prodConfig.environment).toBe('production');

      // Development should have fewer resources
      expect(devConfig.vpc.natGateways).toBeLessThan(prodConfig.vpc.natGateways);
      expect(devConfig.kinesis.shardCount).toBeLessThan(prodConfig.kinesis.shardCount);
    });
  });

  describe('Component Access', () => {
    beforeEach(() => {
      stack = new TimestreamNeptuneStack(app, 'TestStack', {
        environment: 'development',
      });
    });

    test('should provide access to all major components', () => {
      expect(stack.vpcConstruct).toBeDefined();
      expect(stack.storageConstruct).toBeDefined();
      expect(stack.processingConstruct).toBeDefined();
      expect(stack.apiConstruct).toBeDefined();
      expect(stack.monitoringConstruct).toBeDefined();
    });

    test('should have proper component relationships', () => {
      // VPC should be used by other components
      expect(stack.storageConstruct).toBeDefined();
      expect(stack.processingConstruct).toBeDefined();
      
      // Data processing should use storage components
      expect(stack.processingConstruct.dataStream).toBeDefined();
      expect(stack.processingConstruct.dataProcessorFunction).toBeDefined();
    });
  });
});
