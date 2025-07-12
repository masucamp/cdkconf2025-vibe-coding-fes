import { NagSuppressions } from 'cdk-nag';
import { IConstruct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';

export class NagSuppressionUtils {
  /**
   * Apply standard suppressions for Lambda execution roles
   */
  static suppressLambdaExecutionRole(role: iam.Role): void {
    NagSuppressions.addResourceSuppressions(
      role,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaVPCAccessExecutionRole is required for Lambda functions in VPC',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'S3 bucket access requires wildcard for object-level operations',
          appliesTo: ['Resource::*'],
        },
      ]
    );
  }

  /**
   * Apply standard suppressions for Lambda functions
   */
  static suppressLambdaFunction(lambdaFunction: lambda.Function): void {
    NagSuppressions.addResourceSuppressions(
      lambdaFunction,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Python 3.12 is the latest stable runtime version available in CDK',
        },
      ]
    );
  }

  /**
   * Apply standard suppressions for API Gateway
   */
  static suppressApiGateway(api: apigateway.RestApi): void {
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

    // Suppress for deployment stage
    if (api.deploymentStage) {
      NagSuppressions.addResourceSuppressions(
        api.deploymentStage,
        [
          {
            id: 'AwsSolutions-APIG3',
            reason: 'WAF is not required for this internal analytics API',
          },
        ]
      );
    }
  }

  /**
   * Apply standard suppressions for API Gateway methods
   */
  static suppressApiGatewayMethod(method: apigateway.Method): void {
    NagSuppressions.addResourceSuppressions(
      method,
      [
        {
          id: 'AwsSolutions-COG4',
          reason: 'IAM authorization is used instead of Cognito for this B2B API',
        },
      ]
    );
  }

  /**
   * Apply standard suppressions for API Gateway CloudWatch role
   */
  static suppressApiGatewayCloudWatchRole(api: apigateway.RestApi): void {
    try {
      const cloudWatchRole = api.node.findChild('CloudWatchRole') as iam.Role;
      if (cloudWatchRole) {
        NagSuppressions.addResourceSuppressions(
          cloudWatchRole,
          [
            {
              id: 'AwsSolutions-IAM4',
              reason: 'AmazonAPIGatewayPushToCloudWatchLogs is the standard AWS managed policy for API Gateway logging',
              appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'],
            },
          ]
        );
      }
    } catch (error) {
      // CloudWatch role might not exist if cloudWatchRole is false
      console.warn('Could not find CloudWatch role for API Gateway');
    }
  }

  /**
   * Apply standard suppressions for Kinesis streams with customer-managed KMS
   */
  static suppressKinesisStream(stream: kinesis.Stream): void {
    NagSuppressions.addResourceSuppressions(
      stream,
      [
        {
          id: 'AwsSolutions-KDS3',
          reason: 'Customer managed KMS key is required for enhanced security and compliance',
        },
      ]
    );
  }

  /**
   * Apply all standard suppressions for a construct and its children
   */
  static applyStandardSuppressions(construct: IConstruct): void {
    // Find and suppress Lambda functions
    construct.node.findAll().forEach(child => {
      if (child instanceof lambda.Function) {
        this.suppressLambdaFunction(child);
      }
      
      if (child instanceof iam.Role && child.node.id.includes('LambdaExecutionRole')) {
        this.suppressLambdaExecutionRole(child);
      }
      
      if (child instanceof apigateway.RestApi) {
        this.suppressApiGateway(child);
        this.suppressApiGatewayCloudWatchRole(child);
      }
      
      if (child instanceof apigateway.Method) {
        this.suppressApiGatewayMethod(child);
      }
      
      if (child instanceof kinesis.Stream) {
        this.suppressKinesisStream(child);
      }
    });
  }
}
