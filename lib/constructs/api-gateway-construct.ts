import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import { Construct } from 'constructs';
import { ApiGatewayConfig, LambdaConfig } from '../config/stack-config';

export interface ApiGatewayConstructProps {
  readonly vpc: ec2.Vpc;
  readonly lambdaRole: iam.Role;
  readonly lambdaSecurityGroup: ec2.SecurityGroup;
  readonly encryptionKey: kms.Key;
  readonly timestreamDatabase: timestream.CfnDatabase;
  readonly timestreamTable: timestream.CfnTable;
  readonly neptuneCluster: neptune.CfnDBCluster;
  readonly apiGatewayConfig: ApiGatewayConfig;
  readonly lambdaConfig: LambdaConfig;
}

export class ApiGatewayConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly queryFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    // CloudWatch Log Group for API Gateway
    const apiLogGroup = this.createApiLogGroup(props.encryptionKey);

    // API Gateway
    this.api = this.createApiGateway(props.apiGatewayConfig, apiLogGroup);

    // Query Lambda Function
    this.queryFunction = this.createQueryFunction(
      props.vpc,
      props.lambdaRole,
      props.lambdaSecurityGroup,
      props.lambdaConfig,
      props.timestreamDatabase,
      props.timestreamTable,
      props.neptuneCluster
    );

    // API Gateway Resources and Methods
    this.createApiResources();
  }

  private createApiLogGroup(encryptionKey: kms.Key): logs.LogGroup {
    return new logs.LogGroup(this, 'ApiLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      encryptionKey: encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private createApiGateway(config: ApiGatewayConfig, logGroup: logs.LogGroup): apigateway.RestApi {
    return new apigateway.RestApi(this, 'Api', {
      restApiName: config.apiName,
      description: config.description,
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      cloudWatchRole: true,
      deployOptions: {
        stageName: config.stageName,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        ...(config.enableAccessLogs && {
          accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
          accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        }),
      },
      ...(config.enableRequestValidation && {
        defaultMethodOptions: {
          requestValidatorOptions: {
            validateRequestBody: true,
            validateRequestParameters: true,
          },
        },
      }),
    });
  }

  private createQueryFunction(
    vpc: ec2.Vpc,
    role: iam.Role,
    securityGroup: ec2.SecurityGroup,
    config: LambdaConfig,
    timestreamDatabase: timestream.CfnDatabase,
    timestreamTable: timestream.CfnTable,
    neptuneCluster: neptune.CfnDBCluster
  ): lambda.Function {
    return new lambda.Function(this, 'QueryFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      role: role,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [securityGroup],
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        TIMESTREAM_DATABASE: timestreamDatabase.databaseName!,
        TIMESTREAM_TABLE: timestreamTable.tableName!,
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint,
        NEPTUNE_PORT: neptuneCluster.attrPort,
      },
      code: lambda.Code.fromAsset('lib/lambda/query-function'),
      logRetention: logs.RetentionDays.TWO_YEARS,
    });
  }

  private createApiResources(): void {
    const queryIntegration = new apigateway.LambdaIntegration(this.queryFunction);
    const queryResource = this.api.root.addResource('query');
    const queryMethod = queryResource.addMethod('GET', queryIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
    });
  }
}
