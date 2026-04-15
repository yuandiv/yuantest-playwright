# yuantest-playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

[中文文档](README.md)

A powerful Playwright test orchestrator, executor, and reporter with CLI tools and Web Dashboard visualization, helping teams manage and analyze E2E tests more efficiently.

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

### 🔍 Flaky Test Management
- **Automatic detection** - Identify unstable tests based on historical data
- **Smart quarantine** - One-click quarantine of flaky tests to avoid CI/CD disruption
- **Statistical analysis** - Detailed flaky test statistics and trends
- **Custom thresholds** - Flexible configuration of flaky detection standards

### 🛠️ Failure Analysis & Debugging
- **Automatic failure categorization** - Smart identification of timeouts, assertion failures, element not found, etc.
- **Fix suggestions** - Targeted failure fix recommendations
- **Trace management** - Automatic collection and management of Playwright trace files
- **Artifact management** - Unified management of test screenshots, videos, and other artifacts

### 🏷️ Advanced Features
- **Annotation support** - Support for `@slow`, `@flaky`, `@skip` and other test annotations
- **Tag management** - Flexible test tagging system
- **Visual testing** - Integrated pixel-comparison visual regression testing
- **Config hot reload** - Support for dynamic configuration file loading

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
npm install
npm run build
npm link
```

## 🚀 Quick Start

### 1. Run Tests

```bash
# Basic usage
yuantest run --test-dir ./tests

# Specify project name and output directory
yuantest run --project my-app --test-dir ./e2e --output ./reports

# Parallel execution with 4 shards
yuantest run --test-dir ./tests --shards 4

# Specify multiple browsers
yuantest run --test-dir ./tests --browsers chromium,firefox

# Set timeout and retries
yuantest run --test-dir ./tests --timeout 60000 --retries 2
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
| `--test-dir` | `-t` | Test file directory | ./tests |
| `--output` | `-o` | Output directory | ./test-output |
| `--shards` | `-s` | Number of shards | 1 |
| `--workers` | `-w` | Number of workers | 1 |
| `--browsers` | `-b` | Browser list (comma-separated) | chromium |
| `--base-url` | | Base URL | |
| `--timeout` | | Timeout (ms) | 30000 |
| `--retries` | | Number of retries | 0 |
| `--grep` | | Run matching tests | |
| `--update-snapshots` | | Update snapshots | false |

### Orchestration Preview (No Execution)

```bash
# View test shard distribution plan
yuantest orchestrate --test-dir ./tests --shards 4
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

Dashboard provides RESTful API for easy integration with other systems:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Overall statistics |
| GET | `/api/runs` | Run list |
| GET | `/api/runs/:id` | Run details |
| GET | `/api/flaky` | Flaky test list |
| GET | `/api/flaky/quarantined` | Quarantined tests |
| POST | `/api/flaky/:id/quarantine` | Quarantine test |
| POST | `/api/flaky/:id/release` | Release test |
| GET | `/api/flaky/stats` | Flaky statistics |
| GET | `/api/analysis/:runId` | Failure analysis |
| GET | `/api/progress` | Real-time progress |

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
    projectName: 'my-app',
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

  // 5. 启动 Dashboard
  const server = new DashboardServer(5274, './reports', './test-data');
  await server.start();
}

main();
```

### Advanced Usage

```typescript
import { FlakyTestManager, AnnotationManager } from 'yuantest-playwright';

// Flaky test management
const flakyManager = new FlakyTestManager('./test-data');
await flakyManager.initialize();

// Get flaky tests
const flakyTests = await flakyManager.getFlakyTests(0.3);
console.log(`Found ${flakyTests.length} flaky tests`);

// Quarantine test
await flakyManager.quarantineTest('test-id-123');

// Annotation management
const annotationManager = new AnnotationManager('./tests');
const annotations = await annotationManager.scanAnnotations();
console.log(`Found ${annotations.length} annotated tests`);
```

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
│   ├── config/             # Configuration management
│   ├── trace/              # Trace management
│   ├── annotations/        # Annotation scanner
│   ├── tags/               # Tag management
│   ├── artifacts/          # Artifact management
│   ├── visual/             # Visual testing
│   ├── logger/             # Logger module
│   ├── cli/                # CLI commands
│   └── ui/                 # Dashboard server
├── tests/                  # Test files
├── docs/                   # Documentation
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
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  project: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
  timeout: 60000,
  retries: 2,
  flaky: {
    threshold: 0.3,
    autoQuarantine: false,
  },
  dashboard: {
    port: 5274,
    open: true,
  },
});
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

- [API Documentation](https://yuandiv.github.io/yuantest-playwright/)
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

MIT © [YuanDiv](https://github.com/yuandiv)

## 🙏 Acknowledgments

Thanks to the following open source projects:

- [Playwright](https://playwright.dev/) - Powerful end-to-end testing framework
- [React](https://react.dev/) - Dashboard frontend framework
- [Express](https://expressjs.com/) - Dashboard server framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development experience

## 📮 Contact

- GitHub: [@yuandiv](https://github.com/yuandiv)
- Issues: [GitHub Issues](https://github.com/yuandiv/yuantest-playwright/issues)

---

If this project helps you, please give it a ⭐️ Star!
