export interface StackConfig {
  readonly stackName: string;
  readonly environment: 'development' | 'staging' | 'production';
  readonly vpc: VpcConfig;
  readonly timestream: TimestreamConfig;
  readonly neptune: NeptuneConfig;
  readonly kinesis: KinesisConfig;
  readonly lambda: LambdaConfig;
  readonly apiGateway: ApiGatewayConfig;
  readonly monitoring: MonitoringConfig;
  readonly tags: Record<string, string>;
}

export interface VpcConfig {
  readonly maxAzs: number;
  readonly natGateways: number;
  readonly enableDnsHostnames: boolean;
  readonly enableDnsSupport: boolean;
  readonly enableFlowLogs: boolean;
}

export interface TimestreamConfig {
  readonly databaseName: string;
  readonly tableName: string;
  readonly memoryStoreRetentionHours: string;
  readonly magneticStoreRetentionDays: string;
}

export interface NeptuneConfig {
  readonly instanceClass: string;
  readonly backupRetentionPeriod: number;
  readonly enableAuditLog: boolean;
  readonly queryTimeout: string;
  readonly autoMinorVersionUpgrade: boolean;
}

export interface KinesisConfig {
  readonly streamName: string;
  readonly shardCount: number;
  readonly retentionPeriodDays: number;
}

export interface LambdaConfig {
  readonly runtime: string;
  readonly timeout: number;
  readonly memorySize: number;
  readonly logRetentionDays: number;
}

export interface ApiGatewayConfig {
  readonly apiName: string;
  readonly description: string;
  readonly stageName: string;
  readonly enableAccessLogs: boolean;
  readonly enableRequestValidation: boolean;
}

export interface MonitoringConfig {
  readonly neptuneConnectionThreshold: number;
  readonly lambdaErrorThreshold: number;
  readonly logRetentionDays: number;
}

export const getStackConfig = (environment: string): StackConfig => {
  const baseConfig: StackConfig = {
    stackName: 'TimestreamNeptuneStack',
    environment: environment as 'development' | 'staging' | 'production',
    vpc: {
      maxAzs: 3,
      natGateways: 2,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      enableFlowLogs: true,
    },
    timestream: {
      databaseName: 'analytics-database',
      tableName: 'metrics-table',
      memoryStoreRetentionHours: '24',
      magneticStoreRetentionDays: '365',
    },
    neptune: {
      instanceClass: 'db.t3.medium',
      backupRetentionPeriod: 7,
      enableAuditLog: true,
      queryTimeout: '120000',
      autoMinorVersionUpgrade: true,
    },
    kinesis: {
      streamName: 'timestream-neptune-data-stream',
      shardCount: 2,
      retentionPeriodDays: 7,
    },
    lambda: {
      runtime: 'python3.12',
      timeout: 300,
      memorySize: 512,
      logRetentionDays: 731,
    },
    apiGateway: {
      apiName: 'Timestream Neptune Analytics API',
      description: 'API for accessing time-series and graph analytics',
      stageName: 'prod',
      enableAccessLogs: true,
      enableRequestValidation: true,
    },
    monitoring: {
      neptuneConnectionThreshold: 80,
      lambdaErrorThreshold: 5,
      logRetentionDays: 7,
    },
    tags: {
      Project: 'TimestreamNeptuneAnalytics',
      Environment: environment,
      Owner: 'DataEngineering',
      CostCenter: 'Analytics',
      Application: 'TimestreamNeptuneAnalytics',
      Compliance: 'SOC2',
      DataClassification: 'Internal',
    },
  };

  // Environment-specific overrides
  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        vpc: { ...baseConfig.vpc, natGateways: 1 },
        neptune: { ...baseConfig.neptune, instanceClass: 'db.t3.small' },
        kinesis: { ...baseConfig.kinesis, shardCount: 1 },
        lambda: { ...baseConfig.lambda, memorySize: 256 },
      };
    case 'staging':
      return {
        ...baseConfig,
        neptune: { ...baseConfig.neptune, backupRetentionPeriod: 3 },
      };
    case 'production':
      return {
        ...baseConfig,
        vpc: { ...baseConfig.vpc, natGateways: 3 },
        neptune: { ...baseConfig.neptune, instanceClass: 'db.r5.large' },
        kinesis: { ...baseConfig.kinesis, shardCount: 4 },
        lambda: { ...baseConfig.lambda, memorySize: 1024 },
      };
    default:
      return baseConfig;
  }
};
