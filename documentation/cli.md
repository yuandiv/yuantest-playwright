# CLI Command Reference

YuanTest Playwright provides a complete command-line tool for test orchestration, execution, reporting, and analysis.

## Global Options

```bash
yuantest --help       # View help
yuantest --version    # View version (1.0.0)
```

Running `yuantest` without any parameters will display the help information.

---

## 1. run - Execute Tests

Run Playwright tests with support for orchestration, retries, multiple browsers, traces, screenshots, videos, and more.

### Usage

```bash
yuantest run [testFiles...] [options]
```

`testFiles` is an optional positional parameter specifying the test file paths to run. If not specified, all tests in the configuration directory will be run.

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--config` | `-c` | Configuration file path | |
| `--project` | `-p` | Project name | |
| `--test-dir` | `-t` | Test file directory | |
| `--output` | `-o` | Output directory | ./test-reports |
| `--shards` | `-s` | Number of shards | 1 |
| `--workers` | `-w` | Number of workers | 1 |
| `--browsers` | `-b` | Browser list (comma-separated) | chromium |
| `--base-url` | | Test base URL | |
| `--timeout` | | Test timeout (milliseconds) | 30000 |
| `--retries` | | Number of retries | 0 |
| `--trace` | | Trace mode: off, on, retain-on-failure, on-first-retry | on-first-retry |
| `--screenshot` | | Screenshot mode: off, on, only-on-failure | only-on-failure |
| `--video` | | Video mode: off, on, retain-on-failure, on-first-retry | retain-on-failure |
| `--tags` | | Only run tests with specified tags (comma-separated) | |
| `--grep` | | Filter tests by regex match | |
| `--project-filter` | | Only run specified browser projects | |
| `--update-snapshots` | | Update visual test snapshots | false |
| `--visual-threshold` | | Visual difference threshold (0-1) | 0.2 |
| `--annotations` | | Enable annotation scanning | false |
| `--html-report` | | Generate Playwright HTML report | true |

### Examples

```bash
# Basic usage
yuantest run --test-dir ./

# Specify project name and output directory
yuantest run --project my-app --test-dir ./e2e --output ./reports

# Parallel execution (4 shards, 2 workers)
yuantest run --test-dir ./ --shards 4 --workers 2

# Multi-browser testing
yuantest run --test-dir ./ --browsers chromium,firefox,webkit

# Run matching tests
yuantest run --test-dir ./ --grep "smoke"

# Set timeout and retries
yuantest run --test-dir ./ --timeout 60000 --retries 2

# Filter by tags
yuantest run --test-dir ./ --tags smoke,regression

# Enable trace and video
yuantest run --test-dir ./ --trace on --video on

# Enable annotation scanning
yuantest run --test-dir ./ --annotations

# Update visual test snapshots
yuantest run --test-dir ./ --update-snapshots --visual-threshold 0.1

# Specify specific test files
yuantest run tests/login.spec.ts tests/cart.spec.ts

# Only run specific browser projects
yuantest run --test-dir ./ --project-filter chromium
```

---

## 2. orchestrate - Orchestrate Tests

Preview test shard allocation plan without actually executing tests.

### Usage

```bash
yuantest orchestrate [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--test-dir` | `-t` | Test file directory | ./ |
| `--shards` | `-s` | Number of shards | 1 |

### Examples

```bash
# View shard allocation for default directory
yuantest orchestrate

# View 4-shard allocation plan for specified directory
yuantest orchestrate --test-dir ./e2e --shards 4
```

---

## 3. report - View Reports

View test run reports.

### Usage

```bash
yuantest report [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--limit` | `-l` | Number of recent reports to show | 10 |
| `--id` | `-i` | View report for specific run ID | |
| `--open` | `-o` | Open report in browser | |

### Examples

```bash
# View recent 10 reports
yuantest report --limit 10

# View detailed report for specific run
yuantest report --id run_20240101_120000_abc123

# Open report in browser
yuantest report --id run_20240101_120000_abc123 --open
```

---

## 4. flaky - Flaky Test Management

Manage and view flaky tests, supporting quarantine and release operations.

### Usage

```bash
yuantest flaky [options]
```

When run without any options, displays flaky test statistics.

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--list` | `-l` | List all flaky tests | |
| `--quarantined` | `-q` | List quarantined tests | |
| `--quarantine` | | Quarantine specified test (pass test ID) | |
| `--release` | | Release specified test (pass test ID) | |
| `--threshold` | | Flaky threshold (0-1), tests with failure rate above this are considered flaky | 0.3 |

### Examples

```bash
# View flaky test statistics
yuantest flaky

# List all flaky tests
yuantest flaky --list

# List all flaky tests (custom threshold 50%)
yuantest flaky --list --threshold 0.5

# List quarantined tests
yuantest flaky --quarantined

# Quarantine specific test
yuantest flaky --quarantine test-id-123

# Release specific test
yuantest flaky --release test-id-123
```

---

## 5. ui - Launch Dashboard

Launch the Web Dashboard visual interface.

### Usage

```bash
yuantest ui [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--port` | `-p` | Server port | 5274 |
| `--output` | `-o` | Report directory | |
| `--data` | `-d` | Data directory | |

> If `--output` and `--data` are not specified, Dashboard configuration will be loaded from the configuration file.

### Examples

```bash
# Start with default port
yuantest ui

# Custom port
yuantest ui --port 8080

# Specify report and data directories
yuantest ui --port 5274 --output ./reports --data ./test-data
```

---

## 6. analyze - Analyze Test Results

Analyze test failure causes with support for AI diagnostics and cluster analysis.

### Usage

```bash
yuantest analyze [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--id` | `-i` | Run ID (required) | |
| `--json` | | Output in JSON format | |
| `--ai` | | Enable AI diagnostics for each failure | |
| `--cluster` | | Perform cluster analysis on failures | |
| `--filter` | | Filter failures by category (timeout/selector/network/assertion/frame/auth/unknown) | |

### Examples

```bash
# Analyze failures for specific run
yuantest analyze --id run_20240101_120000_abc123

# Enable AI diagnostics
yuantest analyze --id run_20240101_120000_abc123 --ai

# Output in JSON format
yuantest analyze --id run_20240101_120000_abc123 --json

# Filter by category
yuantest analyze --id run_20240101_120000_abc123 --filter timeout

# Cluster analysis
yuantest analyze --id run_20240101_120000_abc123 --cluster

# Combined usage: AI diagnostics + cluster analysis + JSON output
yuantest analyze --id run_20240101_120000_abc123 --ai --cluster --json
```

---

## 7. trace - Trace File Management

Manage and view Playwright trace files.

### Usage

```bash
yuantest trace [options]
```

When run without any options, lists all trace files (up to 20).

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--list` | `-l` | List all trace files | |
| `--dir` | | Trace file directory | ./traces |
| `--view` | | Open specified trace file in viewer | |
| `--port` | | Trace viewer port | 9323 |
| `--clean` | | Clean trace files older than 7 days | false |
| `--stats` | | Display trace statistics | false |

### Examples

```bash
# List all trace files
yuantest trace

# Specify trace directory
yuantest trace --dir ./my-traces

# Open trace file in viewer
yuantest trace --view ./traces/login-failure.zip

# Specify viewer port
yuantest trace --view ./traces/login-failure.zip --port 9999

# Clean old trace files
yuantest trace --clean

# View trace statistics
yuantest trace --stats
```

---

## 8. annotations - Annotation Scanning and Management

Scan and manage test annotations (@skip, @fixme, @fail, @slow, etc.).

### Usage

```bash
yuantest annotations [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--test-dir` | `-t` | Test file directory | ./ |
| `--output` | `-o` | Output report path | ./annotation-report.json |

### Examples

```bash
# Scan annotations in current directory
yuantest annotations

# Specify test directory
yuantest annotations --test-dir ./e2e

# Specify output report path
yuantest annotations --test-dir ./e2e --output ./reports/annotations.json
```

---

## 9. tags - Tag Management

Scan and manage test tags.

### Usage

```bash
yuantest tags [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--test-dir` | `-t` | Test file directory | ./ |
| `--output` | `-o` | Output report path | ./tag-report.json |
| `--run` | | Run tests with specified tags (comma-separated) | |

### Examples

```bash
# Scan tags in current directory
yuantest tags

# Specify test directory
yuantest tags --test-dir ./e2e

# Specify output report path
yuantest tags --test-dir ./e2e --output ./reports/tags.json

# Run tests with specified tags
yuantest tags --test-dir ./e2e --run smoke,regression
```

---

## 10. artifacts - Artifact Management

Manage test artifacts (screenshots, videos, etc.).

### Usage

```bash
yuantest artifacts [options]
```

When run without any options, lists all artifacts.

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--list` | `-l` | List all artifacts | |
| `--dir` | | Artifact directory | ./artifacts |
| `--stats` | | Display artifact statistics | false |
| `--clean` | | Clean artifacts older than 7 days | false |
| `--run-id` | | Filter artifacts by run ID | |

### Examples

```bash
# List all artifacts
yuantest artifacts

# Specify artifact directory
yuantest artifacts --dir ./my-artifacts

# View artifact statistics
yuantest artifacts --stats

# Filter by run ID
yuantest artifacts --run-id run_20240101_120000_abc123

# Clean old artifacts
yuantest artifacts --clean
```

---

## 11. visual - Visual Test Management

Visual test management, including screenshot comparison and baseline management.

### Usage

```bash
yuantest visual [options]
```

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--dir` | Visual test directory | ./visual-testing |
| `--threshold` | Difference threshold (0-1) | 0.2 |
| `--update` | Update all baselines with current screenshots | false |
| `--report` | Generate visual test report | ./visual-report.json |
| `--stats` | Display visual test statistics | false |

### Examples

```bash
# View visual test results
yuantest visual

# Specify visual test directory
yuantest visual --dir ./screenshots

# Custom difference threshold
yuantest visual --threshold 0.1

# Update all baselines
yuantest visual --update

# Generate visual test report
yuantest visual --report ./reports/visual.json

# View statistics
yuantest visual --stats
```

---

## 12. show-report - Open HTML Report

Open Playwright HTML report in browser.

### Usage

```bash
yuantest show-report [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--path` | `-p` | HTML report path | ./test-output/html-report |

### Examples

```bash
# Open HTML report at default path
yuantest show-report

# Specify report path
yuantest show-report --path ./reports/html-report
```

---

## 13. test-history - View Test History

View run history for a specific test.

### Usage

```bash
yuantest test-history <testId> [options]
```

`testId` is a required positional parameter specifying the test ID to view history for.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--page` | Page number | 1 |
| `--page-size` | Items per page | 10 |
| `--json` | Output in JSON format | |

### Examples

```bash
# View test history
yuantest test-history login-test-001

# View page 2
yuantest test-history login-test-001 --page 2

# Custom items per page
yuantest test-history login-test-001 --page 1 --page-size 20

# Output in JSON format
yuantest test-history login-test-001 --json
```

---

## 14. error-patterns - Error Pattern Management

Manage error patterns with support for viewing, adding, and deleting custom error patterns.

### Usage

```bash
yuantest error-patterns [options]
```

When run without any options, lists all error patterns.

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--list` | `-l` | List all error patterns | |
| `--custom` | | Only list custom error patterns | |
| `--add` | | Add custom error pattern (JSON string) | |
| `--delete` | | Delete custom error pattern by ID | |

### JSON Format for Adding Error Patterns

When adding an error pattern, the `--add` parameter requires a JSON string with the following required fields:

| Field | Description |
|------|------|
| `id` | Unique pattern identifier |
| `category` | Error category |
| `name` | Pattern name |
| `regex` | Array of regular expressions |
| `rootCauseTemplate` | Root cause template |
| `suggestionsTemplate` | Suggestions template |
| `description` | Description (optional) |
| `docLinks` | Documentation links (optional) |

### Examples

```bash
# List all error patterns
yuantest error-patterns

# Only list custom error patterns
yuantest error-patterns --custom

# Add custom error pattern
yuantest error-patterns --add '{"id":"custom-001","category":"network","name":"DNS Resolution Failed","regex":["dns resolve failed","ENOTFOUND"],"rootCauseTemplate":"DNS resolution failed: {hostname}","suggestionsTemplate":["Check DNS configuration","Verify network connection"]}'

# Delete custom error pattern
yuantest error-patterns --delete custom-001
```

---

## 15. llm-config - LLM Configuration Management

Manage LLM diagnostic configuration with support for viewing, setting, testing connections, and viewing status.

### Usage

```bash
yuantest llm-config [options]
```

When run without any options, displays current LLM configuration (API Key will be masked).

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--show` | Show current LLM configuration | |
| `--set` | Update LLM configuration (JSON string) | |
| `--test` | Test LLM connection | |
| `--status` | View LLM status | |

### Examples

```bash
# View current LLM configuration
yuantest llm-config

# Update LLM configuration
yuantest llm-config --set '{"enabled":true,"baseUrl":"https://api.openai.com/v1","model":"gpt-4","apiKey":"sk-xxx"}'

# Test LLM connection
yuantest llm-config --test

# View LLM status
yuantest llm-config --status
```

---

## 16. health - Health Metrics

View test health metrics including pass rate, flaky test count, etc.

### Usage

```bash
yuantest health [options]
```

### Parameters

| Parameter | Shorthand | Description | Default |
|------|------|------|--------|
| `--json` | | Output in JSON format | |
| `--limit` | `-l` | Number of recent runs to analyze | 10 |

### Examples

```bash
# View test health
yuantest health

# Analyze recent 20 runs
yuantest health --limit 20

# Output in JSON format
yuantest health --json
```

---

## 17. prediction - Failure Prediction

View test failure predictions including high-risk tests and duration anomalies.

### Usage

```bash
yuantest prediction [options]
```

When run without any options, lists all high-risk tests.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--high-risk` | List high-risk tests | |
| `--test` | View prediction for specific test | |
| `--duration-anomalies` | View execution duration anomalies | |
| `--json` | Output in JSON format | |

### Examples

```bash
# List high-risk tests
yuantest prediction

# List high-risk tests (explicit)
yuantest prediction --high-risk

# View prediction for specific test
yuantest prediction --test login-test-001

# View execution duration anomalies
yuantest prediction --duration-anomalies

# Output in JSON format
yuantest prediction --json
```

---

## 18. correlations - Correlation Analysis

View test correlation analysis including causal graphs and correlation groups.

### Usage

```bash
yuantest correlations [options]
```

When run without any options, displays test correlation group information.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--causal-graph` | Display causal graph summary | |
| `--json` | Output in JSON format | |

### Examples

```bash
# View test correlation groups
yuantest correlations

# View causal graph
yuantest correlations --causal-graph

# Output in JSON format
yuantest correlations --json

# Causal graph + JSON output
yuantest correlations --causal-graph --json
```

---

## 19. rerun - Rerun Tests

Rerun specific tests from a previous run.

### Usage

```bash
yuantest rerun <runId> <testId> [options]
```

`runId` and `testId` are required positional parameters.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--json` | Output results in JSON format | |

### Examples

```bash
# Rerun specific test
yuantest rerun run_20240101_120000_abc123 login-test-001

# Output rerun results in JSON format
yuantest rerun run_20240101_120000_abc123 login-test-001 --json
```

---

## 20. agents - AI Agent System

AI-powered test creation and healing. Provides subcommands for test planning, code generation, and test healing.

### Usage

```bash
yuantest agents [subcommand]
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `init` | Initialize agent definitions for VSCode/Claude/OpenCode |
| `plan` | Generate a test plan using Planner agent |
| `generate` | Generate Playwright test code from a test plan |
| `heal` | Heal a failing test using Healer agent |
| `list` | List generated test plans |

### Examples

```bash
# View agent help
yuantest agents

# Initialize agent definitions
yuantest agents init

# Generate test plan
yuantest agents plan "User login flow"

# Generate test plan with seed test reference
yuantest agents plan "Shopping cart" --seed tests/cart.spec.ts

# Generate test plan with PRD reference
yuantest agents plan "Payment feature" --prd docs/prd.md --output specs/

# Generate test code from plan
yuantest agents generate specs/user-login-flow.md

# Generate test code with custom output directory
yuantest agents generate specs/user-login-flow.md --output tests/ --seed tests/example.spec.ts

# Heal a failing test
yuantest agents heal tests/login.spec.ts

# Heal with error context
yuantest agents heal tests/login.spec.ts --error "Timeout waiting for selector" --apply

# List all test plans
yuantest agents list
```

---

## 21. agents-init - Initialize Agent Definitions

Initialize agent definitions for the specified loop target (VSCode, Claude, or OpenCode).

### Usage

```bash
yuantest agents-init [options]
```

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--loop` | Loop target: vscode, claude, opencode | vscode |

### Examples

```bash
# Initialize for VSCode
yuantest agents-init

# Initialize for Claude
yuantest agents-init --loop claude

# Initialize for OpenCode
yuantest agents-init --loop opencode
```

---

## 22. agents-plan - Generate Test Plan

Generate a structured test plan from a feature description using the Planner agent.

### Usage

```bash
yuantest agents-plan <description> [options]
```

`description` is a required positional parameter describing the feature to test.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--seed` | Reference seed test file path | |
| `--prd` | Product requirement document path | |
| `--output` | Output directory for plans | specs/ |

### Examples

```bash
# Generate test plan
yuantest agents-plan "User login flow"

# With seed test reference
yuantest agents-plan "Shopping cart" --seed tests/cart.spec.ts

# With PRD reference
yuantest agents-plan "Payment feature" --prd docs/prd.md

# Custom output directory
yuantest agents-plan "User registration" --output my-specs/
```

---

## 23. agents-generate - Generate Test Code

Generate Playwright TypeScript test code from a test plan file.

### Usage

```bash
yuantest agents-generate <planPath> [options]
```

`planPath` is a required positional parameter specifying the test plan file path.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--output` | Output directory for generated test files | |
| `--seed` | Reference seed test file path | |

### Examples

```bash
# Generate test code from plan
yuantest agents-generate specs/user-login-flow.md

# Custom output directory
yuantest agents-generate specs/user-login-flow.md --output tests/

# With seed test reference
yuantest agents-generate specs/user-login-flow.md --seed tests/example.spec.ts
```

---

## 24. agents-heal - Heal Failing Test

Analyze a failing test and generate fix patches using the Healer agent.

### Usage

```bash
yuantest agents-heal <testFilePath> [options]
```

`testFilePath` is a required positional parameter specifying the failing test file path.

### Parameters

| Parameter | Description | Default |
|------|------|--------|
| `--error` | Error message from the test failure | |
| `--stack-trace` | Stack trace from the test failure | |
| `--max-rounds` | Maximum number of healing rounds | 3 |
| `--apply` | Automatically apply generated patches | false |

### Examples

```bash
# Heal a failing test
yuantest agents-heal tests/login.spec.ts

# Provide error context
yuantest agents-heal tests/login.spec.ts --error "Timeout waiting for selector"

# Provide error and stack trace
yuantest agents-heal tests/login.spec.ts --error "Assertion failed" --stack-trace "at Object.<anonymous>..."

# Auto-apply patches
yuantest agents-heal tests/login.spec.ts --apply

# Custom max rounds
yuantest agents-heal tests/login.spec.ts --max-rounds 5
```

---

## 25. agents-list - List Test Plans

List all generated test plans.

### Usage

```bash
yuantest agents-list
```

### Examples

```bash
# List all test plans
yuantest agents-list
```

---

## Exit Codes

| Exit Code | Description |
|--------|------|
| 0 | Success |
| 1 | Test failure or command execution error |

---

## Environment Variables

| Variable | Description |
|------|------|
| `YUANTEST_PORT` | Default Dashboard port |
| `YUANTEST_OUTPUT` | Default output directory |
| `YUANTEST_DATA` | Default data directory |
