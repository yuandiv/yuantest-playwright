# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-15

### Added

#### Configuration Management

- **PlaywrightConfigMerger** - New configuration validation and merging system
  - Automatic discovery of `playwright.config.ts/js/mts/mjs` files
  - Configuration file validation (existence and parseability)
  - Smart merging of user config with framework defaults
  - Automatic injection of required reporters (html/json)

#### Internationalization (i18n)

- **i18n Module** - Complete internationalization support
  - Support for Chinese (`zh`) and English (`en`)
  - Global language switching via `setLang()`
  - Translation function `t(key, lang?)` with dynamic language support
  - New translation keys: `configNotFound`, `configParseFailed`, `testDirNotFound`, `executorAlreadyRunning`

### Changed

#### API Enhancements

- **API Response Structure** - Enhanced API responses with detailed error information
  - `startRun()` and `rerunTest()` now return `StartRunResult` object instead of `boolean`
  - New interface: `{ success: boolean; error?: string }`
  - Provides detailed error messages for better debugging

#### Configuration Changes

- **Default Port** - Changed default UI port from 3000 to 5274
  - Avoids conflicts with common development servers (e.g., React Dev Server)
  - Updated in all documentation and examples

#### Frontend Improvements

- **Dashboard UI** - Enhanced user experience
  - Removed "Refresh Test Cases" button (auto-refresh on directory switch)
  - Improved error handling with `formatStartError()` function
  - Better test directory switching logic with validation feedback

#### Backend Enhancements

- **UI Server** - Improved request handling
  - Added language middleware for automatic language detection
  - Refactored test directory validation using `PlaywrightConfigMerger.validateProjectPath()`
  - Enhanced test discovery API with `configValidation` field

- **Test Discovery** - Better configuration handling
  - Uses config file directory as working directory
  - Returns validation results instead of empty lists on errors

- **Executor** - Dynamic configuration management
  - Dynamic config merging instead of hardcoded paths
  - Proper working directory resolution based on config location

### Fixed

- **Type Safety** - Added `Artifact` type import in CLI
- **Error Tracking** - Added `cause` property to error objects in config loader
- **Test Assertions** - Updated test messages to match new CLI output

### Dependencies

- **FontAwesome** - Migrated from CDN to local package
  - Replaced CDN link with `@fortawesome/fontawesome-free: ^7.2.0`
  - Improved stability and reduced external dependencies

### Breaking Changes

- **Default Port**: Port changed from 3000 to 5274 - Update scripts and configurations
- **API Response**: `startRun()` and `rerunTest()` now return `{ success, error? }` instead of `boolean`
- **Test Directory Validation**: Use new `validateProjectPath()` method instead of old validation logic

---

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

[1.0.1]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.1
[1.0.0]: https://github.com/yuandiv/yuantest-playwright/releases/tag/v1.0.0
