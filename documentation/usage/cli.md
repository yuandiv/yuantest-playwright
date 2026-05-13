# Command Line Usage

YuanTest Playwright provides a complete CLI tool that supports test execution, orchestration, reporting, flaky management, AI diagnostics, trace management, and more.

## View Help

```bash
yuantest --help
yuantest run --help
yuantest flaky --help
```

---

## Test Execution

### Basic Usage

```bash
# Run all tests
yuantest run --test-dir ./ --output ./test-reports

# Run specific test file
yuantest run tests/login.spec.ts --output ./test-reports

# Run matching tests
yuantest run --grep "login test" --output ./test-reports

# Specify browsers
yuantest run --browsers chromium,firefox --output ./test-reports

# Set parallelism and retries
yuantest run --shards 4 --workers 2 --retries 2 --output ./test-reports
```

### Execution Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--config` | `-c` | Configuration file path | |
| `--project` | `-p` | Project name | test-project |
| `--test-dir` | `-t` | Test file directory | ./ |
| `--output` | `-o` | Output directory | ./test-reports |
| `--shards` | `-s` | Number of shards | 1 |
| `--workers` | `-w` | Number of workers | 1 |
| `--browsers` | `-b` | Browser list (comma-separated) | chromium |
| `--base-url` | | Test base URL | |
| `--timeout` | | Test timeout (milliseconds) | 30000 |
| `--retries` | | Number of retries | 0 |
| `--trace` | | Trace mode | on-first-retry |
| `--screenshot` | | Screenshot mode | only-on-failure |
| `--video` | | Video mode | retain-on-failure |
| `--tags` | | Only run tests with specified tags | |
| `--grep` | | Filter tests by regex match | |
| `--project-filter` | | Only run specified browser projects | |
| `--update-snapshots` | | Update visual test snapshots | false |
| `--visual-threshold` | | Visual difference threshold (0-1) | 0.2 |
| `--annotations` | | Enable annotation scanning | false |
| `--html-report` | | Generate HTML report | false |
| `--html-report-dir` | | HTML report output directory | |

### Advanced Execution Examples

```bash
# Enable trace and screenshots
yuantest run --trace on --screenshot on --video on

# Only run tests with @smoke tag
yuantest run --tags smoke

# Visual testing with baseline update
yuantest run --update-snapshots --visual-threshold 0.1

# Enable annotation scanning
yuantest run --annotations

# Multi-browser + sharding
yuantest run --browsers chromium,firefox,webkit --shards 4 --workers 2
```

---

## Orchestration Preview

View test shard allocation plan (without executing tests):

```bash
# View test shard allocation plan
yuantest orchestrate --test-dir ./ --shards 4

# Use intelligent orchestration strategy
yuantest orchestrate --test-dir ./ --shards 4 --strategy intelligent

# Output orchestration results to file
yuantest orchestrate --test-dir ./ --shards 4 --output orchestration.json
```

Orchestration strategies:

| Strategy | Description |
|------|------|
| `distributed` | Evenly distribute tests across shards |
| `weighted` | Weighted distribution based on historical execution time |
| `intelligent` | Comprehensively consider execution time, flaky status, and dependencies |

---

## View Reports

```bash
# View recent report
yuantest report --output ./test-reports

# Generate HTML report
yuantest report --html-report --html-report-dir ./html-report

# Open HTML report
yuantest show-report
```

---

## Flaky Test Management

### View and Manage Flaky Tests

```bash
# View flaky statistics
yuantest flaky

# List all flaky tests (JSON format)
yuantest flaky --list --json

# List quarantined tests
yuantest flaky --quarantined

# Quarantine specific test
yuantest flaky --quarantine <test-id>

# Release specific test
yuantest flaky --release <test-id>

# Custom threshold
yuantest flaky --list --threshold 0.5
```

### Health Metrics

```bash
# View test health
yuantest health

# JSON format output
yuantest health --json
```

### Failure Prediction

```bash
# View high-risk tests
yuantest prediction --high-risk

# View prediction results for specific test
yuantest prediction --test <test-id>

# View tests with execution time anomalies
yuantest prediction --duration-anomalies

# JSON format output
yuantest prediction --high-risk --json
```

### Correlation Analysis

```bash
# View test correlation analysis
yuantest correlations

# JSON format output
yuantest correlations --json
```

### Test History

```bash
# View history for specific test
yuantest test-history <test-id>

# Paginated view
yuantest test-history <test-id> --page 2 --page-size 20

# JSON format output
yuantest test-history <test-id> --json
```

---

## AI Diagnostics

### Analyze Test Results

```bash
# Analyze failure reasons for specific run
yuantest analyze --id run_20240101_120000_abc123

# Use AI diagnostics
yuantest analyze --id run_20240101_120000_abc123 --ai

# JSON format output
yuantest analyze --id run_20240101_120000_abc123 --ai --json
```

### LLM Configuration Management

```bash
# View current LLM configuration (API Key masked)
yuantest llm-config --show

# Set LLM configuration
yuantest llm-config --set '{"apiKey":"sk-xxx","baseUrl":"https://api.openai.com/v1","model":"gpt-4"}'

# Test LLM connection
yuantest llm-config --test

# View LLM status
yuantest llm-config --status
```

### Error Pattern Management

```bash
# List all error patterns
yuantest error-patterns --list

# List only custom patterns
yuantest error-patterns --custom

# Add custom error pattern
yuantest error-patterns --add '{"name":"Custom Pattern","pattern":"CustomError","category":"unknown"}'

# Delete custom error pattern
yuantest error-patterns --delete <pattern-id>

# JSON format output
yuantest error-patterns --list --json
```

---

## Test Rerun

```bash
# Rerun specific test
yuantest rerun <run-id> <test-id>
```

The system will find the file and line information for the specified test from the report, re-execute the test using `testLocations`, and update the results in the original report.

---

## Trace Management

```bash
# List all trace files
yuantest trace list

# View trace details
yuantest trace show <trace-id>

# Delete trace file
yuantest trace delete <trace-id>
```

---

## Annotations and Tags

### Annotation Scanning

```bash
# Scan annotations in test files
yuantest annotations --scan

# JSON format output
yuantest annotations --json
```

Supported annotation types: `@skip`, `@only`, `@fail`, `@slow`, `@fixme`, `@todo`, `@serial`, `@parallel`

### Tag Management

```bash
# List all tags
yuantest tags --list

# JSON format output
yuantest tags --json
```

---

## Artifact Management

```bash
# List all artifacts
yuantest artifacts list

# Download artifact
yuantest artifacts download <artifact-id>

# Delete artifact
yuantest artifacts delete <artifact-id>
```

Artifact types: screenshot, video, download, trace, attachment

---

## Visual Testing

```bash
# Compare visual test results
yuantest visual compare

# Approve visual differences
yuantest visual approve <test-id>

# Update baseline
yuantest visual baseline <test-id>
```

---

## Start Dashboard

```bash
# Default port 5274
yuantest ui

# Custom port
yuantest ui --port 8080

# Specify directories
yuantest ui --port 5274 --output ./test-reports --data ./test-data

# Do not auto-open browser
yuantest ui --no-open
```

---

## Best Practices

### Development and Debugging

```bash
# Run single test file
yuantest run tests/login.spec.ts

# Run matching tests
yuantest run --grep "login"

# Enable trace and screenshots for debugging
yuantest run --trace on --screenshot on

# Start dashboard to view results
yuantest ui
```

### CI/CD Environment

```bash
# Full test suite
yuantest run --test-dir ./e2e --shards 4 --retries 2 --output ./test-reports

# Check flaky test health
yuantest health --json

# View high-risk tests
yuantest prediction --high-risk --json

# AI diagnostics for failed tests
yuantest analyze --id $RUN_ID --ai --json
```

### Multi-Browser Testing

```bash
# Run on all browsers
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# Run on specific browser only
yuantest run --test-dir ./e2e --browsers chromium

# Specify browser project filter
yuantest run --project-filter chromium
```

### Flaky Test Governance

```bash
# 1. View current flaky status
yuantest flaky --list --json

# 2. View health metrics
yuantest health

# 3. View correlation analysis (find common-cause failures)
yuantest correlations

# 4. View failure predictions
yuantest prediction --high-risk

# 5. AI diagnostics for root cause
yuantest analyze --id $RUN_ID --ai
```
