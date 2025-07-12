import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

// Import our custom constructs
import { NetworkingConstruct } from './constructs/networking-construct';
import { DataStorageConstruct } from './constructs/data-storage-construct';
import { DataProcessingConstruct } from './constructs/data-processing-construct';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { MonitoringConstruct } from './constructs/monitoring-construct';

// Import configuration and utilities
import { StackConfig, getStackConfig } from './config/stack-config';
import { NagSuppressionUtils } from './utils/nag-suppressions';

export interface TimestreamNeptuneStackProps extends cdk.StackProps {
  readonly environment?: string;
  readonly config?: StackConfig;
}

export class TimestreamNeptuneStack extends cdk.Stack {
  private readonly config: StackConfig;
  
  // Core infrastructure
  private readonly encryptionKey: kms.Key;
  private readonly networking: NetworkingConstruct;
  private readonly dataStorage: DataStorageConstruct;
  private readonly dataProcessing: DataProcessingConstruct;
  private readonly apiGateway: ApiGatewayConstruct;
  private readonly monitoring: MonitoringConstruct;

  constructor(scope: Construct, id: string, props: TimestreamNeptuneStackProps = {}) {
    super(scope, id, props);

    // Load configuration
    this.config = props.config || getStackConfig(props.environment || 'development');

    // Apply stack-level tags
    this.applyTags();

    // Create core infrastructure components
    this.encryptionKey = this.createEncryptionKey();
    this.networking = this.createNetworking();
    this.dataStorage = this.createDataStorage();
    this.dataProcessing = this.createDataProcessing();
    this.apiGateway = this.createApiGateway();
    this.monitoring = this.createMonitoring();

    // Create outputs
    this.createOutputs();

    // Apply CDK Nag suppressions
    this.applyNagSuppressions();
  }

  private createEncryptionKey(): kms.Key {
    return new kms.Key(this, 'EncryptionKey', {
      description: 'KMS key for Timestream and Neptune encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
    });
  }

  private createNetworking(): NetworkingConstruct {
    return new NetworkingConstruct(this, 'Networking', {
      config: this.config.vpc,
      encryptionKey: this.encryptionKey,
      logRetentionDays: logs.RetentionDays.ONE_WEEK,
    });
  }

  private createDataStorage(): DataStorageConstruct {
    return new DataStorageConstruct(this, 'DataStorage', {
      vpc: this.networking.vpc,
      encryptionKey: this.encryptionKey,
      timestreamConfig: this.config.timestream,
      neptuneConfig: this.config.neptune,
    });
  }

  private createDataProcessing(): DataProcessingConstruct {
    return new DataProcessingConstruct(this, 'DataProcessing', {
      vpc: this.networking.vpc,
      encryptionKey: this.encryptionKey,
      dataBucket: this.dataStorage.dataBucket,
      timestreamDatabase: this.dataStorage.timestreamDatabase,
      timestreamTable: this.dataStorage.timestreamTable,
      neptuneCluster: this.dataStorage.neptuneCluster,
      neptuneSecurityGroup: this.dataStorage.neptuneSecurityGroup,
      kinesisConfig: this.config.kinesis,
      lambdaConfig: this.config.lambda,
    });
  }

  private createApiGateway(): ApiGatewayConstruct {
    return new ApiGatewayConstruct(this, 'ApiGateway', {
      vpc: this.networking.vpc,
      lambdaRole: this.dataProcessing.dataProcessorFunction.role! as iam.Role,
      lambdaSecurityGroup: this.dataProcessing.lambdaSecurityGroup,
      encryptionKey: this.encryptionKey,
      timestreamDatabase: this.dataStorage.timestreamDatabase,
      timestreamTable: this.dataStorage.timestreamTable,
      neptuneCluster: this.dataStorage.neptuneCluster,
      apiGatewayConfig: this.config.apiGateway,
      lambdaConfig: this.config.lambda,
    });
  }

  private createMonitoring(): MonitoringConstruct {
    const monitoring = new MonitoringConstruct(this, 'Monitoring', {
      neptuneCluster: this.dataStorage.neptuneCluster,
      dataProcessorFunction: this.dataProcessing.dataProcessorFunction,
      queryFunction: this.apiGateway.queryFunction,
      config: this.config.monitoring,
    });

    // Create dashboard
    monitoring.createDashboard();

    return monitoring;
  }

  private createOutputs(): void {
    new cdk.CfnOutput(this, 'TimestreamDatabaseName', {
      value: this.dataStorage.timestreamDatabase.databaseName!,
      description: 'Timestream Database Name',
    });

    new cdk.CfnOutput(this, 'NeptuneClusterEndpoint', {
      value: this.dataStorage.neptuneCluster.attrEndpoint,
      description: 'Neptune Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.apiGateway.api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'KinesisStreamName', {
      value: this.dataProcessing.dataStream.streamName,
      description: 'Kinesis Data Stream Name',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.dataStorage.dataBucket.bucketName,
      description: 'S3 Data Bucket Name',
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: this.config.environment,
      description: 'Deployment Environment',
    });
  }

  private applyTags(): void {
    Object.entries(this.config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }

  private applyNagSuppressions(): void {
    // Apply standard suppressions across all constructs
    NagSuppressionUtils.applyStandardSuppressions(this);
  }

  // Getter methods for accessing components (useful for testing)
  public get stackConfig(): StackConfig {
    return this.config;
  }

  public get vpcConstruct(): NetworkingConstruct {
    return this.networking;
  }

  public get storageConstruct(): DataStorageConstruct {
    return this.dataStorage;
  }

  public get processingConstruct(): DataProcessingConstruct {
    return this.dataProcessing;
  }

  public get apiConstruct(): ApiGatewayConstruct {
    return this.apiGateway;
  }

  public get monitoringConstruct(): MonitoringConstruct {
    return this.monitoring;
  }
}
