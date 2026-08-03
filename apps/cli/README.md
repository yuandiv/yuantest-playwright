# yuantest-playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

English | [中文文档](README.zh.md)

yuantest-playwright is a comprehensive Playwright test orchestration, execution, and reporting platform with real-time Web Dashboard visualization. It provides intelligent test management capabilities that help teams efficiently manage, analyze, and debug E2E tests at scale.

**Zero Learning Curve · Zero Migration Cost · Pure Playwright Ecosystem**

## ✨ Core Features

### 🎯 Intelligent Test Orchestration
- **Auto-discovery of test files** - Smart scanning of test directories with support for multiple file formats
- **Smart sharding strategy** - Optimized shard allocation based on historical execution time for load balancing
- **Parallel execution optimization** - Automatic calculation of optimal parallelism to maximize test efficiency

### 🚀 Flexible Test Execution
- **Multi-browser support** - Run tests on Chromium, Firefox, and WebKit with a single command
- **Failure retry mechanism** - Automatic retry of failed tests to improve test stability
- **Snapshot updates** - Support for automatic visual test snapshot updates
- **No internal API dependencies** - Execution via Playwright CLI ensures upgrade compatibility

### 📊 Real-time Reporting & Visualization
- **WebSocket real-time push** - Real-time view of test progress and results
- **Web Dashboard** - Modern visualization interface for intuitive test data display
- **HTML reports** - Automatic generation of detailed test reports
- **Historical trend analysis** - Track test pass rates and execution time trends

### 🔍 Advanced Flaky Test Management

- **Intelligent classification algorithm** — Automatically classifies tests as Flaky/Broken/Regression/Monitor/Stable
- **Time-decay weighted failure rate** — Wilson confidence intervals for statistically accurate flaky detection
- **Root cause analysis** — 7 automatic detection types for identifying failure patterns
- **Progressive quarantine strategy** — 4-level quarantine system to prevent CI/CD disruption
- **Health scoring system** — A-F grades for test suite health visibility

### 🤖 AI-Powered Failure Diagnosis

- **Context enrichment engine** — Automatically gathers source code, screenshots, logs, and traces for diagnosis
- **Built-in Playwright knowledge base** — 18 error patterns for common Playwright failures
- **Multi-round LLM reasoning** — Confidence-calibrated analysis with iterative refinement
- **Streaming diagnosis** — Real-time SSE diagnosis with actionable fix suggestions
- **Batch clustering** — Identifies common root causes across multiple failures

### 🛠️ Comprehensive Test Management

- **Automatic failure categorization** — Timeout, assertion, element not found, network, and more
- **Trace, screenshot, and video artifact management** — Unified management of all test artifacts
- **Visual regression testing** — Pixel-comparison visual diff with configurable thresholds
- **Test annotations and tagging system** — `@slow`, `@flaky`, `@skip` annotations and custom tags
- **CI/CD integration ready** — CLI + REST API for seamless pipeline integration

## 🎯 What Makes It Special

- **Zero Learning Curve** — All CLI parameters are identical to Playwright CLI. No new commands to learn.
- **Zero Migration Cost** — Pure Playwright commands with no proprietary APIs. Switch back to native Playwright anytime without modifying test code.
- **Pure Playwright Ecosystem** — Fully open-source (GPL-3.0), built on Playwright native capabilities with no compatibility issues.

## 💡 Core Capabilities

### Native Playwright Integration

- Executes tests via Playwright CLI, no internal API dependencies
- Fully compatible with Playwright version upgrades
- Supports all Playwright native features: Trace, screenshots, videos, snapshots, etc.
- Automatically collects and manages Playwright artifacts

### AI-Powered Failure Analysis

- Automatic failure categorization: timeout, assertion failure, element not found, network error, etc.
- Provides targeted fix suggestions
- Supports failure reason trend analysis
- Helps quickly identify root causes

### Aggregated Reports & Trend Analysis

- Aggregated display of multiple test run results
- Historical trend charts: pass rate, execution time, failure reason distribution
- Flaky test trend tracking
- Supports data export and custom analysis

## 🌟 Core Advantages

| Advantage | Benefit |
|-----------|---------|
| **All-in-One Solution** | Complete test lifecycle management without combining multiple tools |
| **No Internal API Dependencies** | Executes via Playwright CLI, ensuring upgrade compatibility |
| **Real-time Monitoring** | WebSocket push for live test progress visibility |
| **Intelligent Flaky Management** | Automatic detection, quarantine, and statistical analysis |
| **AI Failure Analysis** | Smart categorization with targeted fix suggestions |
| **Internationalization** | Built-in Chinese/English support |

### 1. All-in-One Solution

yuantest-playwright provides complete test lifecycle management without combining multiple tools:

| Module | Description |
|--------|-------------|
| **Orchestrator** | Smart test sharding, load balancing, optimized allocation based on historical execution time |
| **Executor** | Execution via Playwright CLI, no internal API dependencies, strong upgrade compatibility |
| **RealtimeReporter** | WebSocket real-time push of test progress |
| **DashboardServer** | Complete Web UI + REST API |
| **FlakyTestManager** | Automatic detection, quarantine, and statistics of unstable tests |
| **ArtifactManager** | Unified management of screenshots, videos, and trace files |

### 2. Intelligent Flaky Test Management

This is the **core differentiating value** of the project, a rare capability in the market:

```typescript
// Automatically record test history and calculate failure rate
existing.failureRate = failures / totalRuns;

// One-click quarantine support
yuantest flaky --quarantine <test-id>
```

- Automatic identification of flaky tests based on historical data
- Customizable threshold support
- Automatic quarantine mechanism to avoid CI/CD disruption
- Detailed failure trend analysis

### 3. Real-time Visualization Dashboard

- **WebSocket Real-time Push** - Test execution process visible in real-time, no need to wait for test completion
- **React + Tailwind Modern Frontend** - Responsive design with Chinese/English switching support
- **Performance Optimization** - Batch updates, message rate limiting, state caching for smooth handling of large-scale tests
- **Internationalization Support** - One-click Chinese/English switching

### 4. Intelligent Test Orchestration

```typescript
// ShardOptimizer - Optimize sharding based on historical execution time
const optimizedAssignments = await optimizer.optimize(tests, shards);
```

- Automatic test file discovery with multiple file format support
- Intelligent sharding based on historical execution time for load balancing
- Multi-browser, multi-project parallel execution support

### 5. No Internal API Dependencies

```typescript
// Execute via Playwright CLI, not internal APIs
spawn('npx', ['playwright', 'test', ...args]);
```

This means:
- No compatibility issues with Playwright version upgrades
- Behavior completely consistent with official CLI
- Low long-term maintenance cost

## 🔄 Comparison with allure-playwright

| Dimension | yuantest-playwright | allure-playwright |
|-----------|---------------------|-------------------|
| **Learning Curve** | ✅ Zero learning curve - parameters identical to Playwright CLI | ⚠️ Need to learn Allure configuration and annotations |
| **Migration Cost** | ✅ Zero migration cost - pure Playwright commands | ⚠️ Need to configure Allure Server and History |
| **Ecosystem Dependency** | ✅ Pure Playwright ecosystem - GPL-3.0 license | ⚠️ Depends on Allure ecosystem |
| **Positioning** | Full-stack test management platform | Report generator |
| **Real-time** | ✅ WebSocket real-time push | ❌ Generate report after test completion |
| **Web Dashboard** | ✅ Built-in React Dashboard | ✅ Allure Server (requires extra deployment) |
| **Flaky Management** | ✅ Auto detection + quarantine + statistics | ❌ None |
| **Test Orchestration** | ✅ Smart sharding + load balancing | ❌ None |
| **Test Execution** | ✅ Built-in Executor | ❌ Requires external execution |
| **Native Playwright Integration** | ✅ Executes via Playwright CLI, no internal API | ✅ Integrates via Reporter API |
| **AI Failure Analysis** | ✅ Auto categorization + fix suggestions | ❌ None |
| **Aggregated Reports** | ✅ Built-in, works out of the box | ⚠️ Requires Allure Server configuration |
| **Historical Trends** | ✅ Built-in storage, multi-dimensional trends | ✅ Requires History configuration |
| **Failure Analysis** | ✅ Auto categorization + fix suggestions | ⚠️ Manual analysis required |
| **Internationalization** | ✅ Chinese/English | ⚠️ Self-configuration required |
| **Deployment Complexity** | ✅ Single npm package | ⚠️ Requires Allure Server |
| **Report Aesthetics** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **CI/CD Integration** | ✅ CLI + API | ✅ Wide support |

### Core Differences Summary

| yuantest-playwright Advantages | allure-playwright Advantages |
|-------------------------------|------------------------------|
| All-in-one solution | More visually appealing reports |
| Real-time test progress monitoring | Mature ecosystem, large community |
| Flaky test management | Support for multiple test frameworks |
| Intelligent test orchestration | Rich historical trend charts |
| Simple deployment | Strong plugin extensibility |

### Best Practice: Complementary Usage

Use yuantest-playwright for daily test management and real-time monitoring, while integrating allure-playwright for generating polished final reports:

```bash
# Daily development: Use yuantest for real-time monitoring
yuantest run --test-dir ./

# CI/CD: Generate Allure report for archiving
npx playwright test --reporter=allure-playwright
```

## 📦 Installation

### Install via npm (Recommended)

```bash
# Global installation
npm install -g yuantest-playwright

# Or as project dependency
npm install --save-dev yuantest-playwright
```

### Install from Source

```bash
git clone https://github.com/yuandiv/yuantest-playwright.git
cd yuantest-playwright
pnpm install
pnpm build
pnpm --filter yuantest-playwright link
```

## 🚀 Quick Start

Get started in 30 seconds:

```bash
# Install
npm install -g yuantest-playwright

# Run tests
yuantest run --test-dir ./

# Start Web Dashboard
yuantest ui

# Analyze flaky tests
yuantest flaky

# AI-powered failure diagnosis
yuantest analyze --id <run-id> --ai
```

### 1. Run Tests

```bash
# Basic usage
yuantest run --test-dir ./

# Specify project name and output directory
yuantest run --project my-app --test-dir ./e2e --output ./reports

# Parallel execution with 4 shards
yuantest run --test-dir ./ --shards 4

# Specify multiple browsers
yuantest run --test-dir ./ --browsers chromium,firefox

# Set timeout and retries
yuantest run --test-dir ./ --timeout 60000 --retries 2
```

### 2. Start Web Dashboard

```bash
# Default port 5274
yuantest ui

# Custom port
yuantest ui --port 8080

# Custom report and data directories
yuantest ui --port 5274 --output ./reports --data ./test-data
```

Then open **http://localhost:5274** in your browser to view the visualization interface.

## 📖 CLI Commands Reference

### View Help

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```

### Test Execution Parameters

| Parameter | Short | Description | Default |
|-----------|-------|-------------|---------|
| `--project` | `-p` | Project name | test-project |
| `--test-dir` | `-t` | Test file directory | ./ |
| `--output` | `-o` | Output directory | ./test-output |
| `--shards` | `-s` | Number of shards | 1 |
| `--workers` | `-w` | Number of workers | 1 |
| `--browsers` | `-b` | Browser list (comma-separated) | chromium |
| `--base-url` | | Base URL | |
| `--timeout` | | Timeout (ms) | 30000 |
| `--retries` | | Number of retries | 0 |
| `--grep` | | Run matching tests | |
| `--update-snapshots` | | Update snapshots | false |
| `--config` | `-c` | Config file path | |
| `--trace` | | Trace mode: off, on, retain-on-failure, on-first-retry | on-first-retry |
| `--screenshot` | | Screenshot mode: off, on, only-on-failure | only-on-failure |
| `--video` | | Video mode: off, on, retain-on-failure, on-first-retry | retain-on-failure |
| `--tags` | | Run only tests with these tags (comma-separated) | |
| `--project-filter` | | Run only specific browser project | |
| `--visual-threshold` | | Visual diff threshold (0-1) | 0.2 |
| `--annotations` | | Enable annotation scanning | false |
| `--html-report` | | Generate Playwright HTML report | true |

### Orchestration Preview (No Execution)

```bash
# View test shard distribution plan
yuantest orchestrate --test-dir ./ --shards 4
```

### View Reports

```bash
# View recent 10 reports
yuantest report --limit 10

# View specific report
yuantest report --id run_20240101_120000_abc123
```

### Flaky Test Management

```bash
# View Flaky statistics
yuantest flaky

# List all Flaky tests
yuantest flaky --list

# List quarantined tests
yuantest flaky --quarantined

# Quarantine a specific test
yuantest flaky --quarantine <test-id>

# Release a specific test
yuantest flaky --release <test-id>

# Custom threshold
yuantest flaky --list --threshold 0.5
```

### Failure Analysis

```bash
# Analyze failure reasons for a specific run
yuantest analyze --id run_20240101_120000_abc123

# Enable AI diagnosis
yuantest analyze --id run_20240101_120000_abc123 --ai

# Cluster analysis on failures
yuantest analyze --id run_20240101_120000_abc123 --cluster

# Filter by category
yuantest analyze --id run_20240101_120000_abc123 --filter timeout
```

### Trace Management

```bash
# List all traces
yuantest trace --list

# Open a trace file in the viewer
yuantest trace --view <trace-file>

# Show trace statistics
yuantest trace --stats

# Clean traces older than 7 days
yuantest trace --clean
```

### Annotation Scanning

```bash
# Scan test annotations
yuantest annotations --test-dir ./
```

### Tag Management

```bash
# Scan test tags
yuantest tags --test-dir ./
```

### Artifact Management

```bash
# List all artifacts
yuantest artifacts --list

# Show artifact statistics
yuantest artifacts --stats

# Clean artifacts older than 7 days
yuantest artifacts --clean
```

### Visual Testing

```bash
# Show visual testing statistics
yuantest visual --stats

# Update all baselines with current screenshots
yuantest visual --update
```

### View HTML Report

```bash
# Open Playwright HTML report in browser
yuantest show-report

# Specify report path
yuantest show-report --path ./reports/html-report
```

### Test History

```bash
# View test run history
yuantest test-history <testId>

# Output in JSON format
yuantest test-history <testId> --json
```

### Error Pattern Management

```bash
# List all error patterns
yuantest error-patterns --list

# List custom error patterns only
yuantest error-patterns --custom

# Add a custom error pattern
yuantest error-patterns --add '<json>'
```

### LLM Diagnosis Configuration

```bash
# Show current LLM configuration
yuantest llm-config --show

# Test LLM connection
yuantest llm-config --test

# Check LLM status
yuantest llm-config --status

# Update LLM configuration
yuantest llm-config --set '<json>'
```

### Test Health Metrics

```bash
# View test health metrics
yuantest health

# Output in JSON format
yuantest health --json
```

### Failure Prediction

```bash
# List high-risk tests
yuantest prediction --high-risk

# View prediction for a specific test
yuantest prediction --test <testId>

# View duration anomalies
yuantest prediction --duration-anomalies
```

### Correlation Analysis

```bash
# View test correlation analysis
yuantest correlations

# Show causal graph summary
yuantest correlations --causal-graph
```

### Rerun Test

```bash
# Rerun a specific test from a previous run
yuantest rerun <runId> <testId>
```

## 🖥️ Web Dashboard

After starting, visit `http://localhost:<port>`, which includes the following modules:

### Main Pages

- **Overview** - Total test runs, pass rate, Flaky statistics, execution trend charts
- **Test Runs** - Historical test run records with filtering and search support
- **Flaky Tests** - Unstable test list with one-click quarantine/release
- **Failure Analysis** - Failure reason categorization and fix suggestions
- **Real-time Progress** - Real-time progress bar and logs during test execution

### REST API

Dashboard provides RESTful API (prefix: `/api/v1/`) for easy integration with other systems. For the complete API reference, see [Documentation](https://yuantest-playwright.readthedocs.io/).

#### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/stats` | Overall statistics |
| GET | `/api/v1/runs` | Run list (paginated) |
| GET | `/api/v1/runs/:id` | Run details |
| POST | `/api/v1/runs` | Start a test run |
| POST | `/api/v1/runs/stop` | Stop current run |
| DELETE | `/api/v1/runs/:id` | Delete a run |

#### Flaky Test Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/flaky` | Flaky test list |
| GET | `/api/v1/flaky/quarantined` | Quarantined tests |
| POST | `/api/v1/flaky/:testId/quarantine` | Quarantine test |
| POST | `/api/v1/flaky/:testId/release` | Release test |
| GET | `/api/v1/flaky/stats` | Flaky statistics |
| GET | `/api/v1/flaky/health` | Overall health score |
| GET | `/api/v1/flaky/predictions/high-risk` | High-risk predictions |

#### Failure Analysis & Diagnosis

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/analysis/:runId` | Failure analysis |
| GET | `/api/v1/failures/analysis` | Cross-run failure summary |
| POST | `/api/v1/diagnosis` | AI diagnosis |
| POST | `/api/v1/diagnosis/stream` | AI diagnosis (SSE stream) |
| POST | `/api/v1/diagnosis/cluster` | Cluster diagnosis |

#### Test Discovery & Execution

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tests` | Discovered tests |
| POST | `/api/v1/runs/:runId/tests/:testId/rerun` | Rerun a test |
| POST | `/api/v1/runs/:runId/batch-rerun` | Batch rerun tests |
| GET | `/api/v1/tests/:testId/history` | Test history |

#### Artifacts & Traces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/traces` | Trace list |
| GET | `/api/v1/artifacts` | Artifact list |
| GET | `/api/v1/attachments/file` | Serve attachment file |

## 💻 Programmatic API Usage

### Basic Example

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
} from 'yuantest-playwright';

async function main() {
  // 1. Orchestrate tests
  const orchestrator = new Orchestrator({
    version: 'my-app',
    testDir: './e2e',
    outputDir: './reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. Execute tests
  const executor = new Executor(orchestrator.getConfig());

  // Listen to events
  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_progress', (progress) => {
    console.log(`Progress: ${progress.passed}/${progress.totalTests} passed`);
  });

  executor.on('output', (data) => {
    process.stdout.write(data.data);
  });

  executor.on('run_completed', async (result) => {
    // 3. Generate report
    const reporter = new Reporter('./reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);

    // 4. Analyze failures
    const analysis = await reporter.analyzeFailures(result);
    console.log(`Failures: ${analysis.length}`);
  });

  const result = await executor.execute({
    grepPattern: 'smoke',
    projectFilter: 'chromium',
    updateSnapshots: false,
  });
  console.log(`Final: ${result.passed}/${result.totalTests} passed`);

  // 5. Start Dashboard
  const server = new DashboardServer(5274, './reports', './test-data');
  await server.start();
}

main();
```

### Advanced Usage

```typescript
import {
  FlakyTestManager,
  AnnotationManager,
  TagManager,
  TraceManager,
  ArtifactManager,
  VisualTestingManager,
} from 'yuantest-playwright';

// Flaky test management
const flakyManager = new FlakyTestManager('./test-data');

// Get flaky tests
const flakyTests = flakyManager.getFlakyTests(0.3);
console.log(`Found ${flakyTests.length} flaky tests`);

// Quarantine test
await flakyManager.quarantineTest('test-id-123');

// Annotation management
const annotationManager = new AnnotationManager();
const annotations = await annotationManager.scanDirectory('./');
console.log(`Found ${annotations.length} annotated tests`);

// Tag management
const tagManager = new TagManager();
const tags = await tagManager.scanDirectory('./');

// Trace management
const traceManager = new TraceManager(
  { enabled: true, mode: 'on', screenshots: true, snapshots: true, sources: true, attachments: true },
  './traces'
);

// Artifact management
const artifactManager = new ArtifactManager(
  { enabled: true, screenshots: 'on', videos: 'on' },
  './artifacts'
);

// Visual testing
const visualManager = new VisualTestingManager(
  { enabled: true, threshold: 0.2, maxDiffPixelRatio: 0.01, maxDiffPixels: 10, updateSnapshots: false },
  './visual-testing'
);
```

### Key Exports

| Module | Description |
|--------|-------------|
| `Orchestrator`, `ShardOptimizer` | Test orchestration and smart sharding |
| `Executor`, `ParallelExecutor` | Test execution |
| `Reporter`, `JSONReporter` | Report generation |
| `RealtimeReporter`, `RealtimeReporterClient` | WebSocket real-time reporting |
| `FlakyTestManager` | Flaky test detection, quarantine, and statistics |
| `DashboardServer` | Web UI + REST API server |
| `TraceManager` | Playwright trace management |
| `AnnotationManager` | Test annotation scanning |
| `TagManager` | Test tag management |
| `ArtifactManager` | Screenshot, video, and trace artifact management |
| `VisualTestingManager` | Pixel-comparison visual regression testing |
| `PlaywrightConfigBuilder` | Playwright config generation |
| `loadConfigFile`, `mergeConfig` | Configuration loading and merging |
| `StorageProvider`, `FilesystemStorage` | Storage abstraction |
| `TestDiscovery` | Test file discovery |
| `LRUCache`, `TTLCache` | Caching utilities |

## 📁 Project Structure

```
yuantest-playwright/
├── bin/
│   ├── cli.js              # CLI entry
│   └── start-ui.js         # Dashboard startup script
├── dashboard/              # Web Dashboard frontend source
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom Hooks
│   │   ├── services/       # API services
│   │   └── types/          # TypeScript types
│   └── index.html
├── src/
│   ├── index.ts            # Main entry
│   ├── types/              # Type definitions
│   ├── orchestrator/       # Test orchestrator
│   ├── executor/           # Test executor
│   ├── reporter/           # Report generator
│   ├── realtime/           # Real-time reporting
│   ├── flaky/              # Flaky management
│   ├── diagnosis/          # AI diagnosis
│   ├── config/             # Configuration management
│   ├── trace/              # Trace management
│   ├── annotations/        # Annotation scanner
│   ├── tags/               # Tag management
│   ├── artifacts/          # Artifact management
│   ├── visual/             # Visual testing
│   ├── storage/            # Storage providers
│   ├── cache/              # LRU/TTL cache
│   ├── base/               # Base manager classes
│   ├── discovery/          # Test discovery
│   ├── middleware/          # Express middleware
│   ├── validation/         # Zod validation
│   ├── utils/              # Utility functions
│   ├── i18n/               # Internationalization
│   ├── constants/          # Constants
│   ├── logger/             # Logger module
│   ├── cli/                # CLI commands
│   └── ui/                 # Dashboard server
├── documentation/          # Documentation source
├── tests/                  # Test files
└── package.json
```

## 🎯 Use Cases

### CI/CD Integration

```yaml
# GitHub Actions example
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        run: |
          npm install -g yuantest-playwright
          yuantest run --test-dir ./e2e --shards 4 --output ./reports
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: reports/
```

### Large Test Suite Optimization

```bash
# Accelerate large test suites with smart sharding
yuantest run --test-dir ./e2e --shards 8 --workers 4

# Quarantine flaky tests to avoid blocking CI
yuantest flaky --quarantine-all
yuantest run --test-dir ./e2e
```

### Multi-browser Testing

```bash
# Run tests on all browsers
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# Run on specific browser only
yuantest run --test-dir ./e2e --browsers chromium
```

## ⚙️ Configuration File

Support for customizing behavior through configuration files:

```typescript
// yuantest.config.ts
import type { TestConfig } from 'yuantest-playwright';

const config: TestConfig = {
  version: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
  timeout: 60000,
  retries: 2,
  traces: {
    enabled: true,
    mode: 'on-first-retry',
    screenshots: true,
    snapshots: true,
    sources: true,
    attachments: true,
  },
  artifacts: {
    enabled: true,
    screenshots: 'only-on-failure',
    videos: 'retain-on-failure',
  },
  visualTesting: {
    enabled: true,
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
    maxDiffPixels: 10,
    updateSnapshots: false,
  },
};

export default config;
```

## 📊 Performance Features

- **Smart sharding** - Optimized sharding based on historical execution time, improving efficiency by 30-50%
- **Parallel execution** - Multi-worker parallel support to fully utilize multi-core CPUs
- **Incremental testing** - Support for running only change-related tests
- **Cache optimization** - Intelligent caching of test discovery results to reduce redundant computation
- **Memory optimization** - Streaming processing of large test results to reduce memory footprint

## 🔧 Requirements

- Node.js >= 16.0.0
- npm >= 7.0.0
- Playwright >= 1.40.0

## 📚 Documentation

- 📖 [Documentation](https://yuantest-playwright.readthedocs.io/) - Complete guides, usage, and API reference
- 🔧 [API Reference](https://yuandiv.github.io/yuantest-playwright/) - TypeDoc API documentation
- [Changelog](CHANGELOG.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## 🤝 Contributing

Contributions are welcome! Feel free to submit code, report issues, or make suggestions!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📝 License

GPL-3.0 © [YuanDiv](https://github.com/yuandiv)

## 🙏 Acknowledgments

Thanks to the following open source projects:

- [Playwright](https://playwright.dev/) - Powerful end-to-end testing framework
- [React](https://react.dev/) - Dashboard frontend framework
- [Express](https://expressjs.com/) - Dashboard server framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development experience

## 📮 Contact

- GitHub: [@yuandiv](https://github.com/yuandiv)
- Issues: [GitHub Issues](https://github.com/yuandiv/yuantest-playwright/issues)

## ❓ Common Misconceptions Clarified

### Q: Do I need to learn a new CLI?
**No.** All parameters of yuantest-playwright are identical to Playwright CLI, so your existing Playwright knowledge can be reused directly. A Web UI is also provided for use without command line.

### Q: Will I be locked into this tool?
**No.** yuantest-playwright uses pure Playwright commands to execute tests with no proprietary APIs. You can switch back to native Playwright anytime without modifying any test code - truly zero migration cost.

### Q: How is the project maintained?
**Fully open source.** GPL-3.0 license, pure Playwright ecosystem, no barriers. Built on Playwright native capabilities, no compatibility issues with version upgrades.

### Q: Is it compatible with Playwright native features?
**Fully compatible.** Tests are executed via Playwright CLI, supporting all native features: Trace, screenshots, videos, snapshots, etc. Automatically collects and manages all Playwright artifacts.

### Q: How do I analyze test failures?
**AI-powered analysis.** Automatically categorizes failure reasons (timeout, assertion failure, element not found, etc.), provides fix suggestions, supports failure trend analysis, and helps quickly identify root causes.

---

If this project helps you, please give it a ⭐️ Star!

Made with ❤️ by [YuanDiv](https://github.com/yuandiv)
