import {
  CloudFrontClient,
  type DistributionConfig,
  type DistributionSummary,
  GetDistributionConfigCommand,
  type GetDistributionConfigCommandOutput,
  ListDistributionsCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";

export type UpdatorFunction = (
  config: DistributionConfig,
) => DistributionConfig | null | Promise<DistributionConfig | null>;

export type FilterCondition = (summary: DistributionSummary) => boolean | Promise<boolean>;

export interface CloudFrontUpdatorConfig {
  debugMode?: boolean;
  allowSensitiveAction?: boolean;
  taskType?: "parallel" | "sequential";
}

export interface CloudFrontUpdatorWorkers {
  updator: UpdatorFunction;
  filter?: FilterCondition;
}

interface DiffResult {
  added: Record<string, any>;
  deleted: Record<string, any>;
  updated: Record<string, any>;
}

export class CloudFrontUpdator {
  private readonly client: CloudFrontClient;
  private readonly updator: UpdatorFunction;
  private readonly filter: FilterCondition;
  private readonly debugMode: boolean;
  private readonly allowSensitiveAction: boolean;
  private readonly taskType: "parallel" | "sequential";
  private diff: DiffResult | null = null;

  constructor(
    workers: CloudFrontUpdatorWorkers,
    config: CloudFrontUpdatorConfig = {},
    client?: CloudFrontClient,
  ) {
    this.client = client ?? new CloudFrontClient({});
    this.updator = workers.updator;
    this.filter = workers.filter ?? (() => true);
    this.debugMode = config.debugMode ?? false;
    this.allowSensitiveAction = config.allowSensitiveAction ?? false;
    this.taskType = config.taskType ?? "sequential";
  }

  async getDistributionConfig(
    distributionId: string,
  ): Promise<{ config: DistributionConfig; ETag: string }> {
    const command = new GetDistributionConfigCommand({ Id: distributionId });
    const response: GetDistributionConfigCommandOutput = await this.client.send(command);

    if (!response.DistributionConfig) {
      throw new Error(`Distribution config not found for ${distributionId}`);
    }
    if (!response.ETag) {
      throw new Error(`ETag not found for ${distributionId}`);
    }

    return {
      config: response.DistributionConfig,
      ETag: response.ETag,
    };
  }

  private calculateDiff(before: DistributionConfig, after: DistributionConfig): DiffResult {
    const result: DiffResult = { added: {}, deleted: {}, updated: {} };

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const beforeValue = (before as any)[key];
      const afterValue = (after as any)[key];

      if (beforeValue === undefined && afterValue !== undefined) {
        result.added[key] = afterValue;
      } else if (beforeValue !== undefined && afterValue === undefined) {
        result.deleted[key] = beforeValue;
      } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        result.updated[key] = afterValue;
      }
    }

    return result;
  }

  getDiff(): DiffResult | null {
    return this.diff;
  }

  async updateDistribution(distributionId: string): Promise<void> {
    const { config: originalConfig, ETag } = await this.getDistributionConfig(distributionId);

    const beforeConfig = { ...originalConfig };
    const beforeEnabled = originalConfig.Enabled;
    const updatedConfig = await this.updator(originalConfig);

    if (!updatedConfig) {
      return;
    }

    if (this.debugMode) {
      this.diff = this.calculateDiff(beforeConfig, updatedConfig);
      return;
    }

    if (!this.allowSensitiveAction && beforeEnabled !== updatedConfig.Enabled) {
      throw new Error("Cannot change Enabled field without allowSensitiveAction");
    }

    const command = new UpdateDistributionCommand({
      Id: distributionId,
      DistributionConfig: updatedConfig,
      IfMatch: ETag,
    });

    await this.client.send(command);
  }

  async updateAllDistributions(): Promise<void> {
    const distributions = await this.listAllDistributions();

    if (this.taskType === "sequential") {
      for (const summary of distributions) {
        if (!summary.Id) continue;
        if (await this.filter(summary)) {
          await this.updateDistribution(summary.Id);
        }
      }
    } else {
      await Promise.all(
        distributions.map(async (summary) => {
          if (!summary.Id) return;
          if (await this.filter(summary)) {
            await this.updateDistribution(summary.Id);
          }
        }),
      );
    }
  }

  private async listAllDistributions(
    marker?: string,
    accumulated: DistributionSummary[] = [],
  ): Promise<DistributionSummary[]> {
    const command = new ListDistributionsCommand({
      Marker: marker,
    });

    const response = await this.client.send(command);

    const items = response.DistributionList?.Items ?? [];
    const allDistributions = [...accumulated, ...items];

    if (response.DistributionList?.NextMarker) {
      return this.listAllDistributions(response.DistributionList.NextMarker, allDistributions);
    }

    return allDistributions;
  }
}
