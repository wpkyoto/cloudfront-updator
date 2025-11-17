import {
  CloudFrontClient,
  type DistributionConfig,
  type DistributionSummary,
  GetDistributionConfigCommand,
  type GetDistributionConfigCommandOutput,
  ListDistributionsCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { detailedDiff } from "deep-object-diff";
import pLimit from "p-limit";

export type UpdatorFunction = (
  config: DistributionConfig,
) => DistributionConfig | null | Promise<DistributionConfig | null>;

export type FilterCondition = (summary: DistributionSummary) => boolean | Promise<boolean>;

export interface CloudFrontUpdatorConfig {
  debugMode?: boolean;
  allowSensitiveAction?: boolean;
  taskType?: "parallel" | "sequential";
  concurrencyLimit?: number;
}

export interface CloudFrontUpdatorWorkers {
  updator: UpdatorFunction;
  filter?: FilterCondition;
}

export interface DiffResult {
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
  private readonly concurrencyLimit: number;
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
    this.concurrencyLimit = config.concurrencyLimit ?? 5;
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

  getDiff(): DiffResult | null {
    return this.diff;
  }

  async updateDistribution(distributionId: string): Promise<void> {
    const { config: originalConfig, ETag } = await this.getDistributionConfig(distributionId);

    // Deep copy to preserve the original state for diff calculation
    const beforeConfig = structuredClone(originalConfig);
    const beforeEnabled = originalConfig.Enabled;
    const updatedConfig = await this.updator(originalConfig);

    if (!updatedConfig) {
      return;
    }

    if (this.debugMode) {
      // Use deep-object-diff for granular diff calculation
      this.diff = detailedDiff(beforeConfig, updatedConfig) as DiffResult;
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
      // Limit concurrency to avoid API throttling
      const limit = pLimit(this.concurrencyLimit);

      await Promise.all(
        distributions.map((summary) =>
          limit(async () => {
            if (!summary.Id) return;
            if (await this.filter(summary)) {
              await this.updateDistribution(summary.Id);
            }
          }),
        ),
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
