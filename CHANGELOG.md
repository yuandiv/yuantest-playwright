# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-11

### Added

#### Core Features

- **Orchestrator** - Intelligent test orchestration with automatic test discovery and smart sharding
  - Support for distributed test execution across multiple shards
  - Load balancing based on test duration history
  - `ShardOptimizer` for intelligent test distribution

- **Executor** - Test execution engine via Playwright CLI
  - Parallel test execution support
  - Automatic retry mechanism for failed tests
  - Multi-browser testing (chromium, firefox, webkit)
  - Real-time progress tracking via events
  - `ParallelExecutor` for concurrent test runs

- **Reporter** - Comprehensive test reporting system
  - HTML report generation with EJS templates
  - JSON report output
  - Failure analysis with categorization and fix suggestions
  - Test artifacts management (screenshots, videos, traces)

- **Flaky Test Management** - Automatic detection and isolation of unstable tests
  - Flaky test detection based on configurable threshold
  - Quarantine mechanism for isolating problematic tests
  - Historical flaky test tracking
  - REST API for quarantine/release operations

- **Web Dashboard** - Visual interface for test management
  - Real-time test progress display via WebSocket
  - Historical test run visualization
  - Flaky test management UI
  - Failure analysis dashboard
  - REST API with 15+ endpoints

- **CLI Tool** - Complete command-line interface
  - `yuantest run` - Execute tests with various options
  - `yuantest orchestrate` - Preview test distribution plan
  - `yuantest report` - View test reports
  - `yuantest flaky` - Manage flaky tests
  - `yuantest analyze` - Analyze test failures
  - `yuantest ui` - Launch web dashboard

#### Additional Features

- **Trace Management** - Playwright trace file management and organization
- **Annotation Support** - Parse and respect test annotations (skip, only, fail, slow, fixme, todo)
- **Tag Management** - Test tagging system for filtering and organization
- **Visual Testing** - Screenshot comparison with pixelmatch integration
- **Artifact Management** - Organized storage of test artifacts
- **Storage Providers** - Pluggable storage system (Memory and Filesystem implementations)
- **Cache System** - LRU and TTL cache implementations
- **Configuration Loader** - Load and merge configuration from `yuantest.config.ts`
- **Validation** - Zod-based configuration validation
- **Middleware** - Express middleware utilities for error handling and validation

### Technical Details

- Built with TypeScript 5.9+
- Targets ES2020
- CommonJS module output
- Full type declarations included
- Node.js >= 16.0.0 support

### Dependencies

- `@playwright/test` ^1.40.0
- `express` ^4.18.2
- `ws` ^8.14.2
- `ejs` ^5.0.1
- `commander` ^11.1.0
- `zod` ^3.25.76
- `pixelmatch` ^7.1.0
- `chalk` ^4.1.2
- `ora` ^5.4.1
- `dayjs` ^1.11.10

### Documentation

- Comprehensive README with usage examples
- API programming guide
- CLI command reference
- REST API documentation

### Testing

- Unit tests for core modules
- Integration tests for orchestrator-executor flow
- E2E tests for CLI functionality
- Jest configuration with coverage thresholds

---

## Future Roadmap

### Planned Features

- [ ] Plugin system for custom reporters and executors
- [ ] Cloud storage providers (S3, GCS, Azure Blob)
- [ ] Distributed test execution across multiple machines
- [ ] AI-powered failure analysis and fix suggestions
- [ ] Slack/Teams notification integration
- [ ] GitHub Actions integration
- [ ] Performance benchmarking and regression detection
- [ ] Test case management integration

---

[1.0.0]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.0
