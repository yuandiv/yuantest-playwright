# Getting Started

This guide will help you get started with YuanTest Playwright in 5 minutes.

## Prerequisites

- Node.js >= 16.0.0
- npm >= 7.0.0
- Playwright >= 1.40.0

## Installation

```bash
# Global installation
npm install -g yuantest-playwright

# Install Playwright browsers (if not already installed)
npx playwright install
```

## Basic Usage

### 1. Run Tests

```bash
# Basic usage
yuantest run --test-dir ./

# Specify project name and output directory
yuantest run --project my-app --test-dir ./e2e --output ./reports

# Parallel execution (4 shards)
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

# Specify report and data directories
yuantest ui --port 5274 --output ./reports --data ./test-data
```

Then open **http://localhost:5274** in your browser.

### 3. Manage Flaky Tests

```bash
# View Flaky statistics
yuantest flaky

# List all Flaky tests
yuantest flaky --list

# Quarantine specific test
yuantest flaky --quarantine <test-id>

# Release test
yuantest flaky --release <test-id>
```

## Next Steps

- [Web UI Usage](usage/web-ui.md) - Learn about Dashboard features
- [CLI Usage](usage/cli.md) - Master CLI commands
- [CI/CD Integration](usage/cicd.md) - Integrate into CI/CD pipeline
- [API Reference](api/index.md) - Programming interface documentation

## FAQ

### Q: Dashboard not showing test results?

Ensure test execution and Dashboard use the same output directory:

```bash
yuantest run --output ./test-reports
yuantest ui --output ./test-reports
```

### Q: How to run only specific test files?

```bash
# Method 1: Specify file path directly
yuantest run tests/login.spec.ts --output ./test-reports

# Method 2: Use --grep parameter
yuantest run --grep "login test" --output ./test-reports
```

### Q: How to view help?

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```
