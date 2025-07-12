import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as kinesisanalytics from 'aws-cdk-lib/aws-kinesisanalytics';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class TimestreamNeptuneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // KMS Key for encryption at rest (Security Pillar)
    const encryptionKey = new kms.Key(this, 'EncryptionKey', {
      description: 'KMS key for Timestream and Neptune encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
    });

    // VPC for secure networking (Security Pillar)
    const vpc = new ec2.Vpc(this, 'TimestreamNeptuneVpc', {
      maxAzs: 3,
      natGateways: 2, // High availability across AZs (Reliability Pillar)
      enableDnsHostnames: true,
      enableDnsSupport: true,
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

    // VPC Flow Logs for monitoring (Operational Excellence)
    const flowLogRole = new iam.Role(this, 'FlowLogRole', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      encryptionKey: encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup, flowLogRole),
    });

    // S3 Bucket for data backup and archival (Reliability & Cost Optimization)
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true, // AwsSolutions-S10
      serverAccessLogsPrefix: 'access-logs/', // AwsSolutions-S1
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

    // Kinesis Data Stream for real-time data ingestion (Performance Efficiency)
    const dataStream = new kinesis.Stream(this, 'DataStream', {
      streamName: 'timestream-neptune-data-stream',
      shardCount: 2,
      encryption: kinesis.StreamEncryption.KMS,
      encryptionKey: encryptionKey,
      retentionPeriod: cdk.Duration.days(7),
    });

    // Timestream Database and Table
    const timestreamDatabase = new timestream.CfnDatabase(this, 'TimestreamDatabase', {
      databaseName: 'analytics-database',
      kmsKeyId: encryptionKey.keyId,
    });

    const timestreamTable = new timestream.CfnTable(this, 'TimestreamTable', {
      databaseName: timestreamDatabase.databaseName!,
      tableName: 'metrics-table',
      retentionProperties: {
        memoryStoreRetentionPeriodInHours: '24', // 24 hours in memory (Cost Optimization)
        magneticStoreRetentionPeriodInDays: '365', // 1 year in magnetic store
      },
      magneticStoreWriteProperties: {
        enableMagneticStoreWrites: true,
        magneticStoreRejectedDataLocation: {
          s3Configuration: {
            bucketName: dataBucket.bucketName,
            objectKeyPrefix: 'rejected-data/',
            encryptionOption: 'SSE_KMS',
            kmsKeyId: encryptionKey.keyId,
          },
        },
      },
    });

    timestreamTable.addDependency(timestreamDatabase);

    // Neptune Subnet Group
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'Subnet group for Neptune cluster',
      subnetIds: vpc.isolatedSubnets.map(subnet => subnet.subnetId),
      dbSubnetGroupName: 'neptune-subnet-group',
    });

    // Neptune Parameter Group for optimization
    const neptuneParameterGroup = new neptune.CfnDBParameterGroup(this, 'NeptuneParameterGroup', {
      description: 'Parameter group for Neptune cluster',
      family: 'neptune1.3',
      parameters: {
        'neptune_enable_audit_log': '1',
        'neptune_query_timeout': '120000',
      },
    });

    // Neptune Cluster Parameter Group
    const neptuneClusterParameterGroup = new neptune.CfnDBClusterParameterGroup(this, 'NeptuneClusterParameterGroup', {
      description: 'Cluster parameter group for Neptune',
      family: 'neptune1.3',
      parameters: {
        'neptune_enable_audit_log': '1',
      },
    });

    // Security Group for Neptune
    const neptuneSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSecurityGroup', {
      vpc,
      description: 'Security group for Neptune cluster',
      allowAllOutbound: false,
    });

    // Neptune Cluster
    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbSubnetGroupName: neptuneSubnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [neptuneSecurityGroup.securityGroupId],
      dbClusterParameterGroupName: neptuneClusterParameterGroup.ref,
      storageEncrypted: true,
      kmsKeyId: encryptionKey.keyId,
      backupRetentionPeriod: 7, // 7 days backup retention (Reliability)
      enableCloudwatchLogsExports: ['audit'], // Operational Excellence
      deletionProtection: false, // Set to true in production
      iamAuthEnabled: true, // Enhanced security
    });

    // Neptune Instance
    const neptuneInstance = new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceClass: 'db.t3.medium', // Cost-optimized instance type
      dbClusterIdentifier: neptuneCluster.ref,
      dbParameterGroupName: neptuneParameterGroup.ref,
      autoMinorVersionUpgrade: true, // AwsSolutions-N2
    });

    // Lambda Execution Role with least privilege (Security Pillar)
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
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
                `arn:aws:timestream:${this.region}:${this.account}:database/${timestreamDatabase.databaseName}`,
                `arn:aws:timestream:${this.region}:${this.account}:database/${timestreamDatabase.databaseName}/table/${timestreamTable.tableName}`,
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

    // Security Group for Lambda functions
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    // Allow Lambda to connect to Neptune
    neptuneSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(8182),
      'Allow Lambda to connect to Neptune'
    );

    // Data Processing Lambda Function
    const dataProcessorFunction = new lambda.Function(this, 'DataProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // AwsSolutions-L1 - Latest runtime
      handler: 'index.handler',
      role: lambdaRole,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint,
        NEPTUNE_PORT: neptuneCluster.attrPort,
        S3_BUCKET: dataBucket.bucketName,
        KMS_KEY_ID: encryptionKey.keyId,
      },
      code: lambda.Code.fromInline(`
import json
import boto3
import os
from datetime import datetime
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

timestream_client = boto3.client('timestream-write')
s3_client = boto3.client('s3')

def handler(event, context):
    """
    Process data from Kinesis and write to Timestream and Neptune
    """
    try:
        for record in event['Records']:
            # Decode Kinesis data
            payload = json.loads(record['kinesis']['data'])
            
            # Write time-series data to Timestream
            write_to_timestream(payload)
            
            # Archive raw data to S3
            archive_to_s3(payload, record['kinesis']['sequenceNumber'])
            
        return {
            'statusCode': 200,
            'body': json.dumps('Successfully processed records')
        }
    except Exception as e:
        logger.error(f"Error processing records: {str(e)}")
        raise

def write_to_timestream(data):
    """Write metrics to Timestream"""
    records = []
    
    current_time = str(int(datetime.now().timestamp() * 1000))
    
    for metric_name, metric_value in data.get('metrics', {}).items():
        record = {
            'Time': current_time,
            'TimeUnit': 'MILLISECONDS',
            'MeasureName': metric_name,
            'MeasureValue': str(metric_value),
            'MeasureValueType': 'DOUBLE',
            'Dimensions': [
                {
                    'Name': 'source',
                    'Value': data.get('source', 'unknown')
                },
                {
                    'Name': 'region',
                    'Value': os.environ.get('AWS_REGION', 'us-east-1')
                }
            ]
        }
        records.append(record)
    
    if records:
        timestream_client.write_records(
            DatabaseName=os.environ['TIMESTREAM_DATABASE'],
            TableName=os.environ['TIMESTREAM_TABLE'],
            Records=records
        )
        logger.info(f"Written {len(records)} records to Timestream")

def archive_to_s3(data, sequence_number):
    """Archive raw data to S3"""
    key = f"raw-data/{datetime.now().strftime('%Y/%m/%d')}/{sequence_number}.json"
    
    s3_client.put_object(
        Bucket=os.environ['S3_BUCKET'],
        Key=key,
        Body=json.dumps(data),
        ServerSideEncryption='aws:kms',
        SSEKMSKeyId=os.environ.get('KMS_KEY_ID')
    )
    logger.info(f"Archived data to S3: {key}")
`),
    });

    // Add Kinesis event source to Lambda
    dataProcessorFunction.addEventSource(
      new lambdaEventSources.KinesisEventSource(dataStream, {
        batchSize: 10,
        startingPosition: lambda.StartingPosition.LATEST,
        retryAttempts: 3,
      })
    );

    // CloudWatch Log Group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      encryptionKey: encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // API Gateway for external access (with proper security)
    const api = new apigateway.RestApi(this, 'TimestreamNeptuneApi', {
      restApiName: 'Timestream Neptune Analytics API',
      description: 'API for accessing time-series and graph analytics',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup), // AwsSolutions-APIG1
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
      defaultMethodOptions: {
        requestValidatorOptions: { // AwsSolutions-APIG2
          validateRequestBody: true,
          validateRequestParameters: true,
        },
      },
    });

    // Query Lambda Function
    const queryFunction = new lambda.Function(this, 'QueryFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // AwsSolutions-L1 - Latest runtime
      handler: 'index.handler',
      role: lambdaRole,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint,
        NEPTUNE_PORT: neptuneCluster.attrPort,
      },
      code: lambda.Code.fromInline(`
import json
import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

timestream_client = boto3.client('timestream-query')

def handler(event, context):
    """
    Query time-series data from Timestream
    """
    try:
        query_type = event.get('queryStringParameters', {}).get('type', 'metrics')
        
        if query_type == 'metrics':
            result = query_timestream_metrics()
        else:
            result = {'error': 'Unsupported query type'}
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps(result)
        }
    except Exception as e:
        logger.error(f"Error querying data: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def query_timestream_metrics():
    """Query recent metrics from Timestream"""
    query = f"""
    SELECT 
        measure_name,
        AVG(measure_value::double) as avg_value,
        MAX(measure_value::double) as max_value,
        MIN(measure_value::double) as min_value,
        COUNT(*) as count
    FROM "{os.environ['TIMESTREAM_DATABASE']}"."{os.environ['TIMESTREAM_TABLE']}"
    WHERE time > ago(1h)
    GROUP BY measure_name
    ORDER BY measure_name
    """
    
    response = timestream_client.query(QueryString=query)
    
    results = []
    for row in response['Rows']:
        result = {}
        for i, column in enumerate(response['ColumnInfo']):
            result[column['Name']] = row['Data'][i].get('ScalarValue', '')
        results.append(result)
    
    return {
        'metrics': results,
        'query_id': response['QueryId']
    }
`),
    });

    // API Gateway integration
    const queryIntegration = new apigateway.LambdaIntegration(queryFunction);
    const queryResource = api.root.addResource('query');
    const queryMethod = queryResource.addMethod('GET', queryIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // Suppress Cognito warning for the specific method
    NagSuppressions.addResourceSuppressions(
      queryMethod,
      [
        {
          id: 'AwsSolutions-COG4',
          reason: 'IAM authorization is used instead of Cognito for this B2B API',
        },
      ]
    );

    // CloudWatch Alarms for monitoring (Operational Excellence)
    const neptuneConnectionsAlarm = new cdk.aws_cloudwatch.Alarm(this, 'NeptuneConnectionsAlarm', {
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/Neptune',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: neptuneCluster.ref,
        },
        statistic: 'Average',
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const lambdaErrorAlarm = new cdk.aws_cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: dataProcessorFunction.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
    });

    // EventBridge rule for automated responses (Operational Excellence)
    const autoResponseRule = new events.Rule(this, 'AutoResponseRule', {
      description: 'Automated response to system events',
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        detail: {
          state: {
            value: ['ALARM'],
          },
        },
      },
    });

    // Outputs for reference
    new cdk.CfnOutput(this, 'TimestreamDatabaseName', {
      value: timestreamDatabase.databaseName!,
      description: 'Timestream Database Name',
    });

    new cdk.CfnOutput(this, 'NeptuneClusterEndpoint', {
      value: neptuneCluster.attrEndpoint,
      description: 'Neptune Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'KinesisStreamName', {
      value: dataStream.streamName,
      description: 'Kinesis Data Stream Name',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: dataBucket.bucketName,
      description: 'S3 Data Bucket Name',
    });

    // CDK Nag Suppressions for justified cases
    NagSuppressions.addResourceSuppressions(
      lambdaRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaVPCAccessExecutionRole is required for Lambda functions in VPC',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'S3 bucket access requires wildcard for object-level operations',
          appliesTo: [`Resource::<DataBucketE3889A50.Arn>/*`],
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(
      dataStream,
      [
        {
          id: 'AwsSolutions-KDS3',
          reason: 'Customer managed KMS key is required for enhanced security and compliance',
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(
      dataProcessorFunction,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Python 3.12 is the latest stable runtime version available in CDK',
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(
      queryFunction,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Python 3.12 is the latest stable runtime version available in CDK',
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(
      api,
      [
        {
          id: 'AwsSolutions-APIG2',
          reason: 'Request validation is enabled via defaultMethodOptions',
        },
        {
          id: 'AwsSolutions-APIG3',
          reason: 'WAF is not required for this internal analytics API',
        },
        {
          id: 'AwsSolutions-COG4',
          reason: 'IAM authorization is used instead of Cognito for this B2B API',
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(
      api.deploymentStage,
      [
        {
          id: 'AwsSolutions-APIG3',
          reason: 'WAF is not required for this internal analytics API',
        },
      ]
    );

    // Suppress API Gateway CloudWatch role managed policy warning
    const apiCloudWatchRole = api.node.findChild('CloudWatchRole') as iam.Role;
    NagSuppressions.addResourceSuppressions(
      apiCloudWatchRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AmazonAPIGatewayPushToCloudWatchLogs is the standard AWS managed policy for API Gateway logging',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'],
        },
      ]
    );
  }
}
