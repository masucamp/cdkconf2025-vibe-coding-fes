import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../config/stack-config';

export interface MonitoringConstructProps {
  readonly neptuneCluster: neptune.CfnDBCluster;
  readonly dataProcessorFunction: lambda.Function;
  readonly queryFunction: lambda.Function;
  readonly config: MonitoringConfig;
}

export class MonitoringConstruct extends Construct {
  public readonly neptuneConnectionsAlarm: cloudwatch.Alarm;
  public readonly lambdaErrorAlarm: cloudwatch.Alarm;
  public readonly autoResponseRule: events.Rule;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    // Neptune Connections Alarm
    this.neptuneConnectionsAlarm = this.createNeptuneConnectionsAlarm(
      props.neptuneCluster,
      props.config.neptuneConnectionThreshold
    );

    // Lambda Error Alarm
    this.lambdaErrorAlarm = this.createLambdaErrorAlarm(
      props.dataProcessorFunction,
      props.config.lambdaErrorThreshold
    );

    // EventBridge Rule for automated responses
    this.autoResponseRule = this.createAutoResponseRule();

    // Additional monitoring for Query Function
    this.createQueryFunctionAlarms(props.queryFunction);
  }

  private createNeptuneConnectionsAlarm(
    neptuneCluster: neptune.CfnDBCluster,
    threshold: number
  ): cloudwatch.Alarm {
    return new cloudwatch.Alarm(this, 'NeptuneConnectionsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Neptune',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: neptuneCluster.ref,
        },
        statistic: 'Average',
      }),
      threshold: threshold,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: `Neptune connections exceeded ${threshold}`,
    });
  }

  private createLambdaErrorAlarm(
    lambdaFunction: lambda.Function,
    threshold: number
  ): cloudwatch.Alarm {
    return new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: lambdaFunction.metricErrors(),
      threshold: threshold,
      evaluationPeriods: 2,
      alarmDescription: `Lambda errors exceeded ${threshold}`,
    });
  }

  private createAutoResponseRule(): events.Rule {
    return new events.Rule(this, 'AutoResponseRule', {
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
  }

  private createQueryFunctionAlarms(queryFunction: lambda.Function): void {
    // Query Function Duration Alarm
    new cloudwatch.Alarm(this, 'QueryFunctionDurationAlarm', {
      metric: queryFunction.metricDuration(),
      threshold: 30000, // 30 seconds
      evaluationPeriods: 3,
      alarmDescription: 'Query function duration is too high',
    });

    // Query Function Throttles Alarm
    new cloudwatch.Alarm(this, 'QueryFunctionThrottlesAlarm', {
      metric: queryFunction.metricThrottles(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Query function is being throttled',
    });
  }

  public createDashboard(): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'TimestreamNeptuneAnalytics',
    });

    // Add widgets to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Neptune Database Connections',
        left: [this.neptuneConnectionsAlarm.metric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [this.lambdaErrorAlarm.metric],
        width: 12,
        height: 6,
      })
    );

    return dashboard;
  }
}
