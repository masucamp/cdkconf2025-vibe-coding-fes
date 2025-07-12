import * as cdk from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { KinesisConfig, LambdaConfig } from '../config/stack-config';

export interface DataProcessingConstructProps {
  readonly vpc: ec2.Vpc;
  readonly encryptionKey: kms.Key;
  readonly dataBucket: s3.Bucket;
  readonly timestreamDatabase: timestream.CfnDatabase;
  readonly timestreamTable: timestream.CfnTable;
  readonly neptuneCluster: neptune.CfnDBCluster;
  readonly neptuneSecurityGroup: ec2.SecurityGroup;
  readonly kinesisConfig: KinesisConfig;
  readonly lambdaConfig: LambdaConfig;
}

export class DataProcessingConstruct extends Construct {
  public readonly dataStream: kinesis.Stream;
  public readonly dataProcessorFunction: lambda.Function;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataProcessingConstructProps) {
    super(scope, id);

    // Kinesis Data Stream
    this.dataStream = this.createKinesisStream(props.kinesisConfig, props.encryptionKey);

    // Lambda Security Group
    this.lambdaSecurityGroup = this.createLambdaSecurityGroup(props.vpc);

    // Lambda Execution Role
    const lambdaRole = this.createLambdaExecutionRole(
      props.encryptionKey,
      props.dataBucket,
      props.timestreamDatabase,
      props.timestreamTable,
      props.neptuneCluster,
      this.dataStream
    );

    // Data Processing Lambda Function
    this.dataProcessorFunction = this.createDataProcessorFunction(
      props.vpc,
      props.lambdaConfig,
      lambdaRole,
      props.timestreamDatabase,
      props.timestreamTable,
      props.neptuneCluster,
      props.dataBucket,
      props.encryptionKey
    );

    // Connect Kinesis to Lambda
    this.connectKinesisToLambda();

    // Allow Lambda to connect to Neptune
    this.allowLambdaToNeptune(props.neptuneSecurityGroup);
  }

  private createKinesisStream(config: KinesisConfig, encryptionKey: kms.Key): kinesis.Stream {
    return new kinesis.Stream(this, 'DataStream', {
      streamName: config.streamName,
      shardCount: config.shardCount,
      encryption: kinesis.StreamEncryption.KMS,
      encryptionKey: encryptionKey,
      retentionPeriod: cdk.Duration.days(config.retentionPeriodDays),
    });
  }

  private createLambdaSecurityGroup(vpc: ec2.Vpc): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });
  }

  private createLambdaExecutionRole(
    encryptionKey: kms.Key,
    dataBucket: s3.Bucket,
    timestreamDatabase: timestream.CfnDatabase,
    timestreamTable: timestream.CfnTable,
    neptuneCluster: neptune.CfnDBCluster,
    dataStream: kinesis.Stream
  ): iam.Role {
    return new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
      inlinePolicies: {
        TimestreamAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'timestream:WriteRecords',
                'timestream:DescribeEndpoints',
                'timestream:Select',
              ],
              resources: [
                `arn:aws:timestream:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:database/${timestreamDatabase.databaseName}`,
                `arn:aws:timestream:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:database/${timestreamDatabase.databaseName}/table/${timestreamTable.tableName}`,
              ],
            }),
          ],
        }),
        NeptuneAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'neptune-db:connect',
                'neptune-db:ReadDataViaQuery',
                'neptune-db:WriteDataViaQuery',
              ],
              resources: [neptuneCluster.attrClusterResourceId],
            }),
          ],
        }),
        KinesisAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kinesis:GetRecords',
                'kinesis:GetShardIterator',
                'kinesis:DescribeStream',
                'kinesis:ListStreams',
              ],
              resources: [dataStream.streamArn],
            }),
          ],
        }),
        KMSAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
                'kms:GenerateDataKey',
              ],
              resources: [encryptionKey.keyArn],
            }),
          ],
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
              ],
              resources: [`${dataBucket.bucketArn}/*`],
            }),
          ],
        }),
      },
    });
  }

  private createDataProcessorFunction(
    vpc: ec2.Vpc,
    config: LambdaConfig,
    role: iam.Role,
    timestreamDatabase: timestream.CfnDatabase,
    timestreamTable: timestream.CfnTable,
    neptuneCluster: neptune.CfnDBCluster,
    dataBucket: s3.Bucket,
    encryptionKey: kms.Key
  ): lambda.Function {
    return new lambda.Function(this, 'DataProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      role: role,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(config.timeout),
      memorySize: config.memorySize,
      environment: {
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint,
        NEPTUNE_PORT: neptuneCluster.attrPort,
        S3_BUCKET: dataBucket.bucketName,
        KMS_KEY_ID: encryptionKey.keyId,
      },
      code: lambda.Code.fromAsset('lib/lambda/data-processor'),
      logRetention: logs.RetentionDays.TWO_YEARS,
    });
  }

  private connectKinesisToLambda(): void {
    this.dataProcessorFunction.addEventSource(
      new lambdaEventSources.KinesisEventSource(this.dataStream, {
        batchSize: 10,
        startingPosition: lambda.StartingPosition.LATEST,
        retryAttempts: 3,
      })
    );
  }

  private allowLambdaToNeptune(neptuneSecurityGroup: ec2.SecurityGroup): void {
    neptuneSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(8182),
      'Allow Lambda to connect to Neptune'
    );
  }
}
