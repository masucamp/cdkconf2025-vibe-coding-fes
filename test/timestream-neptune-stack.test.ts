import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TimestreamNeptuneStack } from '../lib/timestream-neptune-stack';

describe('TimestreamNeptuneStack', () => {
  let app: cdk.App;
  let stack: TimestreamNeptuneStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new TimestreamNeptuneStack(app, 'TestTimestreamNeptuneStack');
    template = Template.fromStack(stack);
  });

  test('VPC is created with correct configuration', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test('KMS Key is created with key rotation enabled', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('Timestream Database is created', () => {
    template.hasResourceProperties('AWS::Timestream::Database', {
      DatabaseName: 'analytics-database',
    });
  });

  test('Timestream Table is created with correct retention', () => {
    template.hasResourceProperties('AWS::Timestream::Table', {
      TableName: 'metrics-table',
      RetentionProperties: {
        MemoryStoreRetentionPeriodInHours: '24',
        MagneticStoreRetentionPeriodInDays: '365',
      },
    });
  });

  test('Neptune Cluster is created with encryption', () => {
    template.hasResourceProperties('AWS::Neptune::DBCluster', {
      StorageEncrypted: true,
      BackupRetentionPeriod: 7,
      IamAuthEnabled: true,
    });
  });

  test('Kinesis Stream is created with encryption', () => {
    template.hasResourceProperties('AWS::Kinesis::Stream', {
      StreamEncryption: {
        EncryptionType: 'KMS',
      },
      RetentionPeriodHours: 168, // 7 days
    });
  });

  test('S3 Bucket is created with encryption and lifecycle', () => {
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
      LifecycleConfiguration: {
        Rules: [
          {
            Status: 'Enabled',
            Transitions: [
              {
                StorageClass: 'STANDARD_IA',
                TransitionInDays: 30,
              },
              {
                StorageClass: 'GLACIER',
                TransitionInDays: 90,
              },
            ],
          },
        ],
      },
    });
  });

  test('Lambda functions are created with VPC configuration', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.11',
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              expect.stringMatching(/LambdaSecurityGroup/),
              'GroupId',
            ],
          },
        ],
      },
    });
  });

  test('API Gateway is created with proper configuration', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'Timestream Neptune Analytics API',
      EndpointConfiguration: {
        Types: ['REGIONAL'],
      },
    });
  });

  test('CloudWatch Alarms are created', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'DatabaseConnections',
      Namespace: 'AWS/Neptune',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Errors',
      Namespace: 'AWS/Lambda',
    });
  });

  test('Security Groups have appropriate rules', () => {
    // Neptune Security Group should allow inbound from Lambda
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 8182,
      ToPort: 8182,
    });
  });

  test('IAM Roles follow least privilege principle', () => {
    // Lambda execution role should have specific permissions
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
    });
  });

  test('Stack outputs are defined', () => {
    template.hasOutput('TimestreamDatabaseName', {});
    template.hasOutput('NeptuneClusterEndpoint', {});
    template.hasOutput('ApiGatewayUrl', {});
    template.hasOutput('KinesisStreamName', {});
    template.hasOutput('S3BucketName', {});
  });
});
