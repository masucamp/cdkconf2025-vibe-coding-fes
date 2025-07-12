import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { TimestreamConfig, NeptuneConfig } from '../config/stack-config';

export interface DataStorageConstructProps {
  readonly vpc: ec2.Vpc;
  readonly encryptionKey: kms.Key;
  readonly timestreamConfig: TimestreamConfig;
  readonly neptuneConfig: NeptuneConfig;
}

export class DataStorageConstruct extends Construct {
  public readonly dataBucket: s3.Bucket;
  public timestreamDatabase: timestream.CfnDatabase;
  public timestreamTable: timestream.CfnTable;
  public neptuneCluster: neptune.CfnDBCluster;
  public neptuneInstance: neptune.CfnDBInstance;
  public neptuneSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStorageConstructProps) {
    super(scope, id);

    // S3 Bucket for data archival
    this.dataBucket = this.createS3Bucket(props.encryptionKey);

    // Timestream Database and Table
    this.createTimestreamResources(props.timestreamConfig, props.encryptionKey);

    // Neptune Cluster and Instance
    this.createNeptuneResources(props.vpc, props.neptuneConfig, props.encryptionKey);
  }

  private createS3Bucket(encryptionKey: kms.Key): s3.Bucket {
    return new s3.Bucket(this, 'DataBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      serverAccessLogsPrefix: 'access-logs/',
      lifecycleRules: [
        {
          id: 'ArchiveRule',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  private createTimestreamResources(config: TimestreamConfig, encryptionKey: kms.Key): void {
    this.timestreamDatabase = new timestream.CfnDatabase(this, 'Database', {
      databaseName: config.databaseName,
      kmsKeyId: encryptionKey.keyId,
    });

    this.timestreamTable = new timestream.CfnTable(this, 'Table', {
      databaseName: this.timestreamDatabase.databaseName!,
      tableName: config.tableName,
      retentionProperties: {
        memoryStoreRetentionPeriodInHours: config.memoryStoreRetentionHours,
        magneticStoreRetentionPeriodInDays: config.magneticStoreRetentionDays,
      },
      magneticStoreWriteProperties: {
        enableMagneticStoreWrites: true,
        magneticStoreRejectedDataLocation: {
          s3Configuration: {
            bucketName: this.dataBucket.bucketName,
            objectKeyPrefix: 'rejected-data/',
            encryptionOption: 'SSE_KMS',
            kmsKeyId: encryptionKey.keyId,
          },
        },
      },
    });

    this.timestreamTable.addDependency(this.timestreamDatabase);
  }

  private createNeptuneResources(vpc: ec2.Vpc, config: NeptuneConfig, encryptionKey: kms.Key): void {
    // Neptune Subnet Group
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'SubnetGroup', {
      dbSubnetGroupDescription: 'Subnet group for Neptune cluster',
      subnetIds: vpc.isolatedSubnets.map(subnet => subnet.subnetId),
      dbSubnetGroupName: 'neptune-subnet-group',
    });

    // Neptune Parameter Groups
    const neptuneParameterGroup = new neptune.CfnDBParameterGroup(this, 'ParameterGroup', {
      description: 'Parameter group for Neptune cluster',
      family: 'neptune1.3',
      parameters: {
        'neptune_enable_audit_log': config.enableAuditLog ? '1' : '0',
        'neptune_query_timeout': config.queryTimeout,
      },
    });

    const neptuneClusterParameterGroup = new neptune.CfnDBClusterParameterGroup(this, 'ClusterParameterGroup', {
      description: 'Cluster parameter group for Neptune',
      family: 'neptune1.3',
      parameters: {
        'neptune_enable_audit_log': config.enableAuditLog ? '1' : '0',
      },
    });

    // Security Group for Neptune
    this.neptuneSecurityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Security group for Neptune cluster',
      allowAllOutbound: false,
    });

    // Neptune Cluster
    this.neptuneCluster = new neptune.CfnDBCluster(this, 'Cluster', {
      dbSubnetGroupName: neptuneSubnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [this.neptuneSecurityGroup.securityGroupId],
      dbClusterParameterGroupName: neptuneClusterParameterGroup.ref,
      storageEncrypted: true,
      kmsKeyId: encryptionKey.keyId,
      backupRetentionPeriod: config.backupRetentionPeriod,
      enableCloudwatchLogsExports: config.enableAuditLog ? ['audit'] : [],
      deletionProtection: false, // Set to true in production
      iamAuthEnabled: true,
    });

    // Neptune Instance
    this.neptuneInstance = new neptune.CfnDBInstance(this, 'Instance', {
      dbInstanceClass: config.instanceClass,
      dbClusterIdentifier: this.neptuneCluster.ref,
      dbParameterGroupName: neptuneParameterGroup.ref,
      autoMinorVersionUpgrade: config.autoMinorVersionUpgrade,
    });
  }
}
