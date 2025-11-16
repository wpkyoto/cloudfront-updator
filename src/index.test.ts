import type {
  CloudFrontClient,
  DistributionConfig,
  DistributionSummary,
  GetDistributionConfigCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, expect, it, vi } from "vitest";
import { CloudFrontUpdator } from "./index";

describe("CloudFrontUpdator - TDD", () => {
  describe("インスタンス化", () => {
    it("updator関数を渡してインスタンス化できる", () => {
      const updator = (config: DistributionConfig) => config;
      const client = new CloudFrontUpdator({ updator });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(CloudFrontUpdator);
    });

    it("設定オプションを渡してインスタンス化できる", () => {
      const updator = (config: DistributionConfig) => config;
      const client = new CloudFrontUpdator(
        { updator },
        { debugMode: true, allowSensitiveAction: false },
      );

      expect(client).toBeDefined();
    });
  });

  describe("Distribution設定の取得", () => {
    it("getDistributionConfigを呼び出してDistribution設定を取得できる", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi.fn().mockResolvedValue({
          DistributionConfig: mockConfig,
          ETag: "test-etag",
        }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => config;
      const client = new CloudFrontUpdator({ updator }, {}, mockClient);

      const result = await client.getDistributionConfig("test-distribution-id");

      expect(result).toEqual({
        config: mockConfig,
        ETag: "test-etag",
      });
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("Updator関数の適用と更新", () => {
    it("updator関数を適用してDistribution設定を更新できる", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi
          .fn()
          .mockResolvedValueOnce({
            DistributionConfig: mockConfig,
            ETag: "test-etag",
          })
          .mockResolvedValueOnce({
            DistributionConfig: { ...mockConfig, Comment: "updated" },
          }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Comment = "updated";
        return config;
      };

      const client = new CloudFrontUpdator({ updator }, {}, mockClient);
      await client.updateDistribution("test-distribution-id");

      expect(mockClient.send).toHaveBeenCalledTimes(2);
    });

    it("updator関数がnullを返した場合は更新しない", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi.fn().mockResolvedValue({
          DistributionConfig: mockConfig,
          ETag: "test-etag",
        }),
      } as unknown as CloudFrontClient;

      const updator = () => null;
      const client = new CloudFrontUpdator({ updator }, {}, mockClient);

      await client.updateDistribution("test-distribution-id");

      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it("Enabled変更時、allowSensitiveActionがfalseならエラーを投げる", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi.fn().mockResolvedValue({
          DistributionConfig: mockConfig,
          ETag: "test-etag",
        }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Enabled = false;
        return config;
      };

      const client = new CloudFrontUpdator(
        { updator },
        { allowSensitiveAction: false },
        mockClient,
      );

      await expect(client.updateDistribution("test-distribution-id")).rejects.toThrow(
        "Cannot change Enabled field",
      );
    });

    it("Enabled変更時、allowSensitiveActionがtrueなら更新できる", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi
          .fn()
          .mockResolvedValueOnce({
            DistributionConfig: mockConfig,
            ETag: "test-etag",
          })
          .mockResolvedValueOnce({
            DistributionConfig: { ...mockConfig, Enabled: false },
          }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Enabled = false;
        return config;
      };

      const client = new CloudFrontUpdator({ updator }, { allowSensitiveAction: true }, mockClient);

      await client.updateDistribution("test-distribution-id");

      expect(mockClient.send).toHaveBeenCalledTimes(2);
    });
  });

  describe("Dry runとdiff表示", () => {
    it("debugModeがtrueの場合、実際の更新は実行せずdiffを記録する", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi.fn().mockResolvedValue({
          DistributionConfig: mockConfig,
          ETag: "test-etag",
        }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Comment = "updated";
        config.Enabled = false;
        return config;
      };

      const client = new CloudFrontUpdator({ updator }, { debugMode: true }, mockClient);

      await client.updateDistribution("test-distribution-id");

      expect(mockClient.send).toHaveBeenCalledTimes(1);

      const diff = client.getDiff();
      expect(diff).toBeDefined();
      expect(diff.updated).toEqual({
        Comment: "updated",
        Enabled: false,
      });
    });

    it("debugModeがfalseの場合、diffは記録されない", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockClient = {
        send: vi
          .fn()
          .mockResolvedValueOnce({
            DistributionConfig: mockConfig,
            ETag: "test-etag",
          })
          .mockResolvedValueOnce({
            DistributionConfig: { ...mockConfig, Comment: "updated" },
          }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Comment = "updated";
        return config;
      };

      const client = new CloudFrontUpdator({ updator }, { debugMode: false }, mockClient);

      await client.updateDistribution("test-distribution-id");

      const diff = client.getDiff();
      expect(diff).toBeNull();
    });
  });

  describe("フィルター機能と一括更新", () => {
    it("フィルター関数を使ってDistributionを絞り込める", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "production",
        Enabled: true,
      };

      const mockDistributions: DistributionSummary[] = [
        { Id: "DIST001", ARN: "arn:1", Comment: "production" } as DistributionSummary,
        { Id: "DIST002", ARN: "arn:2", Comment: "staging" } as DistributionSummary,
        { Id: "DIST003", ARN: "arn:3", Comment: "production" } as DistributionSummary,
      ];

      let updateCount = 0;

      const mockClient = {
        send: vi.fn().mockImplementation((command: any) => {
          if (command.constructor.name === "ListDistributionsCommand") {
            return Promise.resolve({
              DistributionList: {
                Items: mockDistributions,
              },
            });
          }
          if (command.constructor.name === "GetDistributionConfigCommand") {
            return Promise.resolve({
              DistributionConfig: mockConfig,
              ETag: "test-etag",
            });
          }
          if (command.constructor.name === "UpdateDistributionCommand") {
            updateCount++;
            return Promise.resolve({});
          }
          return Promise.resolve({});
        }),
      } as unknown as CloudFrontClient;

      const filter = (summary: DistributionSummary) => summary.Comment === "production";
      const updator = (config: DistributionConfig) => {
        config.Comment = "updated";
        return config;
      };

      const client = new CloudFrontUpdator({ updator, filter }, {}, mockClient);

      await client.updateAllDistributions();

      expect(updateCount).toBe(2);
    });

    it("taskType=parallelで並列実行できる", async () => {
      const mockConfig: DistributionConfig = {
        CallerReference: "test-ref",
        Comment: "test",
        Enabled: true,
      };

      const mockDistributions: DistributionSummary[] = [
        { Id: "DIST001", ARN: "arn:1" } as DistributionSummary,
        { Id: "DIST002", ARN: "arn:2" } as DistributionSummary,
      ];

      const mockClient = {
        send: vi.fn().mockImplementation((command: any) => {
          if (command.constructor.name === "ListDistributionsCommand") {
            return Promise.resolve({
              DistributionList: {
                Items: mockDistributions,
              },
            });
          }
          if (command.constructor.name === "GetDistributionConfigCommand") {
            return Promise.resolve({
              DistributionConfig: mockConfig,
              ETag: "test-etag",
            });
          }
          return Promise.resolve({});
        }),
      } as unknown as CloudFrontClient;

      const updator = (config: DistributionConfig) => {
        config.Comment = "updated";
        return config;
      };

      const client = new CloudFrontUpdator({ updator }, { taskType: "parallel" }, mockClient);

      await client.updateAllDistributions();

      expect(mockClient.send).toHaveBeenCalled();
    });
  });
});
