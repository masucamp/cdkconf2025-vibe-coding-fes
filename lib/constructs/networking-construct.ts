import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { VpcConfig } from '../config/stack-config';

export interface NetworkingConstructProps {
  readonly config: VpcConfig;
  readonly encryptionKey: kms.Key;
  readonly logRetentionDays: logs.RetentionDays;
}

export class NetworkingConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public flowLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: NetworkingConstructProps) {
    super(scope, id);

    // VPC with 3-tier architecture
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: props.config.maxAzs,
      natGateways: props.config.natGateways,
      enableDnsHostnames: props.config.enableDnsHostnames,
      enableDnsSupport: props.config.enableDnsSupport,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // VPC Flow Logs (if enabled)
    if (props.config.enableFlowLogs) {
      this.createFlowLogs(props.encryptionKey, props.logRetentionDays);
    }
  }

  private createFlowLogs(encryptionKey: kms.Key, retentionDays: logs.RetentionDays): void {
    const flowLogRole = new iam.Role(this, 'FlowLogRole', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    this.flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      retention: retentionDays,
      encryptionKey: encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new ec2.FlowLog(this, 'FlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(this.flowLogGroup, flowLogRole),
    });
  }
}
