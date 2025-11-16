# CloudFront Updator

![image](./ogp_light.png)

Modern CloudFront distribution configuration updater with AWS SDK v3.

## Features

- 🚀 Built with AWS SDK v3 for better performance and smaller bundle size
- 📦 Modern tooling: Vite, Vitest, Biome
- 🔒 Type-safe with TypeScript 5
- ✅ Comprehensive test coverage
- 🎯 Dry run mode with diff visualization
- ⚡ Parallel or sequential update execution
- 🛡️ Safe mode for sensitive operations (enable/disable distributions)

## Badges

[![npm version](https://badge.fury.io/js/cloudfront-updator.svg)](https://badge.fury.io/js/cloudfront-updator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install cloudfront-updator
```

## Requirements

- Node.js >= 18.0.0
- AWS SDK v3 credentials configured

## Usage

### Basic Configuration

```typescript
import { CloudFrontUpdator } from "cloudfront-updator";

const updator = new CloudFrontUpdator({
  // Define how to update distribution config
  updator: (config) => {
    config.Comment = "Updated by CloudFront Updator";
    config.DefaultCacheBehavior.MinTTL = 0;
    return config;
  },

  // Optional: Filter which distributions to update
  filter: (summary) => {
    return summary.Comment?.includes("production");
  }
}, {
  // Optional: Configuration
  debugMode: false, // Enable dry-run mode
  allowSensitiveAction: false, // Allow enabling/disabling distributions
  taskType: "sequential" // "sequential" or "parallel"
});
```

### Update a Single Distribution

```typescript
await updator.updateDistribution("E1234EXAMPLE");
```

### Update All Distributions

```typescript
// Update all distributions (filtered by the filter function)
await updator.updateAllDistributions();
```

### Dry Run / Debug Mode

```typescript
const updator = new CloudFrontUpdator({
  updator: (config) => {
    config.HttpVersion = "http2and3";
    config.Enabled = false;
    return config;
  }
}, {
  debugMode: true, // Enable dry-run mode
});

await updator.updateDistribution("E1234EXAMPLE");

// View the diff without actually updating
const diff = updator.getDiff();
console.log(diff);
// {
//   added: {},
//   deleted: {},
//   updated: {
//     HttpVersion: "http2and3",
//     Enabled: false
//   }
// }
```

### Sensitive Actions (Enable/Disable)

By default, changing the `Enabled` field is not allowed. You must explicitly enable it:

```typescript
const updator = new CloudFrontUpdator({
  updator: (config) => {
    config.Enabled = false; // Disable distribution
    return config;
  }
}, {
  allowSensitiveAction: true // Required for enable/disable operations
});

await updator.updateDistribution("E1234EXAMPLE");
```

### Custom CloudFront Client

```typescript
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: "YOUR_ACCESS_KEY",
    secretAccessKey: "YOUR_SECRET_KEY",
  },
});

const updator = new CloudFrontUpdator(
  { updator: (config) => config },
  {},
  client // Pass custom client
);
```

### Parallel Execution

```typescript
const updator = new CloudFrontUpdator({
  updator: (config) => {
    config.Comment = "Bulk update";
    return config;
  }
}, {
  taskType: "parallel" // Update distributions in parallel
});

await updator.updateAllDistributions();
```

## API Reference

### `CloudFrontUpdator`

#### Constructor

```typescript
constructor(
  workers: CloudFrontUpdatorWorkers,
  config?: CloudFrontUpdatorConfig,
  client?: CloudFrontClient
)
```

#### Methods

- `updateDistribution(distributionId: string): Promise<void>` - Update a single distribution
- `updateAllDistributions(): Promise<void>` - Update all distributions matching the filter
- `getDiff(): DiffResult | null` - Get the diff from the last dry-run execution
- `getDistributionConfig(distributionId: string): Promise<{config, ETag}>` - Get distribution config

### Types

```typescript
type UpdatorFunction = (
  config: DistributionConfig
) => DistributionConfig | null | Promise<DistributionConfig | null>;

type FilterCondition = (
  summary: DistributionSummary
) => boolean | Promise<boolean>;

interface CloudFrontUpdatorConfig {
  debugMode?: boolean;
  allowSensitiveAction?: boolean;
  taskType?: "parallel" | "sequential";
}

interface CloudFrontUpdatorWorkers {
  updator: UpdatorFunction;
  filter?: FilterCondition;
}
```

## Migration from v2.x

### Breaking Changes

1. **AWS SDK v3**: Now uses `@aws-sdk/client-cloudfront` instead of `aws-sdk`
2. **Updator Function Signature**: Simplified to only receive `config`
   ```typescript
   // v2.x
   updator: ({ id, arn }, config) => { ... }

   // v3.x
   updator: (config) => { ... }
   ```
3. **Filter Function**: Now receives `DistributionSummary` instead of full `Distribution`
   ```typescript
   // v2.x
   filter: (distribution) => distribution.Status === 'deployed'

   // v3.x
   filter: (summary) => summary.Status === 'Deployed'
   ```
4. **Method Names**: `updateAllDistribution` → `updateAllDistributions` (added 's')

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run dev

# Build
npm run build

# Lint
npm run lint

# Format code
npm run format
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © Hidetaka Okamoto

## Changelog

### v3.0.0 (2025)

- Complete rewrite with AWS SDK v3
- Modern tooling: Vite, Vitest, Biome
- TypeScript 5 support
- Improved type safety
- Breaking changes (see Migration Guide)

### v2.1.2 (2021)

- Last version with AWS SDK v2
- End of life: September 8, 2025
