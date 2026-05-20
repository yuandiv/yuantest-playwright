# Web UI Usage

YuanTest Playwright provides a powerful Web Dashboard for more intuitive and efficient test management.

## Starting the Dashboard

```bash
# Default port 5274
yuantest ui

# Custom port
yuantest ui --port 8080

# Specify report and data directories
yuantest ui --port 5274 --output ./test-reports --data ./test-data

# Do not auto-open browser
yuantest ui --no-open
```

After starting, visit **http://localhost:5274** to view the visual interface.

---

## Dashboard Features

### 1. Overview Page

The Dashboard homepage displays key metrics:

- **Test Run Statistics**: Total run count, pass rate trend
- **Flaky Test Statistics**: Unstable test count and percentage, distribution by category (Flaky/Broken/Regression/Monitor)
- **Execution Time Trend**: Average execution time changes
- **Recent Run Records**: Quick view of recent test results
- **Health Score**: A/B/C/D/F grade, 4-dimensional scoring (stability/trend/recoverability/predictability)

### 2. Test Runs

View all historical test runs:

- **Run List**: Displays detailed information for each run
- **Filter and Search**: Filter test runs by status, time
- **Run Details**: Click to view complete test results
- **Report Download**: Download reports in HTML or JSON format
- **Test Rerun**: Support rerunning single tests or batch reruns

### 3. Flaky Tests

Intelligent management of unstable test cases, providing 6 classification tags:

| Category | Meaning |
|----------|---------|
| Flaky | True intermittent failures |
| Broken | Real bugs with persistent failures |
| Regression | Newly introduced regressions |
| Monitor | Needs attention, may develop into Flaky |
| Stable | Basically stable |
| Insufficient Data | Insufficient data to determine |

Features:

- **Auto Detection**: Automatically identify Flaky tests based on weighted failure rate and Wilson confidence interval
- **Classification Tags**: Each Flaky test displays its category (Broken/Flaky/Regression/Monitor)
- **Weighted Failure Rate**: Shows time-decay weighted failure rate, recent runs have higher weight
- **Root Cause Analysis**: 7 root cause types (timing/data_race/environment/external_service/test_order/resource_leak/assertion_flaky)
- **One-click Quarantine**: Quarantine unstable tests, supports 4 quarantine levels (none/monitor/soft_quarantine/hard_quarantine)
- **Release Tests**: Re-add quarantined tests to the test suite
- **Trend Tracking**: View test pass rate trend direction (improving/stable/degrading/volatile)

### 4. Failure Analysis

Deep analysis of failure causes:

- **Auto Classification**: Intelligently identify 7 types: timeout, assertion failure, element not found, network error, frame error, auth error, etc.
- **Failure Statistics**: Show count and percentage of each failure type
- **Fix Suggestions**: Provide targeted failure fix recommendations
- **Historical Trend**: Track trends of failure causes
- **AI Diagnosis**: One-click trigger AI intelligent analysis

### 5. Real-time Progress

Real-time monitoring during test execution:

- **Progress Bar**: Display test execution progress
- **Real-time Logs**: View test output logs
- **Test Status**: Real-time update of passed, failed, skipped test counts
- **Current Test**: Display currently executing test
- **Flaky Detection Push**: Real-time push of Flaky test detection results

### 6. Agent Panel

The Agent panel provides AI-powered test creation and healing capabilities:

- **Test Planning** - Enter a feature description to generate a structured test plan
  - Supports referencing seed tests for consistent code style
  - Supports referencing PRD documents for requirement alignment
  - Auto-saves plans as Markdown files
- **Test Generation** - Convert test plans into Playwright TypeScript code
  - Uses modern locators (getByRole, getByText, etc.)
  - Generates independently runnable test scenarios
  - Supports custom output directories
- **Test Healing** - Analyze and fix failing tests
  - Multi-round healing with progressive refinement
  - Generates patches with confidence scores and unified diffs
  - Optional auto-apply mode for immediate fixes
  - Security: patches only applied within project root
- **Heal History** - View past healing operations
  - Tracks healing success/failure rates
  - Shows patch details and application status
- **Project Context** - Auto-detected project information
  - Tech stack detection from package.json
  - Playwright config parsing (baseURL, timeout, viewport)
  - Test fixtures discovery

---

## Running Tests via Web UI

### Running Tests through the Interface

1. **Select Test Directory**
   - Click "Settings" on the left side of the Dashboard
   - Enter the test directory path
   - The system will automatically scan for test files

2. **Select Test Files**
   - Check the tests to execute in the test list
   - Support selection by file, by describe block, by individual test
   - Support search and filtering

3. **Configure Execution Parameters**

   | Parameter | Description | Default |
   |-----------|-------------|---------|
   | Browser | Select Chromium / Firefox / WebKit (multiple selection) | chromium |
   | Retries | Set failure retry count | 0 |
   | Timeout | Set test timeout (milliseconds) | 30000 |
   | Workers | Set parallel worker count | 1 |
   | Shards | Set test shard count | 1 |
   | Base URL | Set test base URL | |

4. **Execute Tests**
   - Click "Run Tests" button
   - View test progress in real-time
   - View console output

5. **View Test Report**
   - Automatically navigate to report page after test completion
   - View detailed test results
   - View error messages and stack traces for failed tests
   - View attachments like Trace, screenshots, videos

---

## AI Diagnosis Features

### Single Diagnosis

1. Click "AI Diagnosis" button on the test details page
2. System automatically collects context information (source code, screenshots, console logs, stack traces, environment info, historical data)
3. Match known error patterns from Playwright knowledge base
4. LLM analyzes and returns diagnosis results
5. View diagnosis summary, root cause, fix suggestions, confidence

### Streaming Diagnosis

1. Click "AI Diagnosis (Streaming)" button
2. View AI reasoning process in real-time
3. Support Agent multi-round reasoning mode (LLM can actively read source code, query history)
4. View reasoning steps and tool calls

### Diagnosis Results

Diagnosis results include:

| Field | Description |
|-------|-------------|
| Summary | Overview of failure cause |
| Root Cause | Root cause analysis |
| Fix Suggestions | Actionable fix steps |
| Confidence | Calibrated confidence (0-1) |
| Category | timeout/selector/assertion/network/frame/auth/unknown |
| Code Diff | Suggested code changes (unified diff format) |
| Doc Links | Related Playwright official documentation |
| Reasoning Steps | Agent reasoning process (Agent mode only) |
| Related Failures | Other failed tests with same root cause |

### Batch Clustering Diagnosis

When multiple tests fail in the same run:

1. System automatically identifies similar error patterns
2. Call LLM for representative failures
3. Other failures reference the same diagnosis
4. Mark as "common cause failure affecting N tests"

---

## Error Pattern Management

### View Built-in Patterns

System has 6 categories with 18 built-in Playwright error patterns:

| Category | Typical Patterns |
|----------|------------------|
| TimeoutError | Element not appeared, navigation timeout, API response timeout |
| SelectorError | Element not exists, selector ambiguity, selector in iframe |
| AssertionError | Text mismatch, visibility assertion, attribute assertion |
| NetworkError | Request failed, CORS, DNS resolution failed |
| FrameError | Frame detached, cross-frame operation |
| AuthError | Token expired, unauthorized redirect |

### Add Custom Patterns

1. Click "Add Pattern" on the error pattern management page
2. Fill in pattern name, matching regex, category
3. Takes effect immediately after saving, subsequent diagnoses will match custom patterns
4. Custom patterns are marked with `[custom]` tag

---

## LLM Configuration

### Configure API Key

1. Find "LLM Configuration" in Dashboard settings page
2. Fill in the following information:

   | Config Item | Description | Example |
   |-------------|-------------|---------|
   | API Key | API Key for LLM service | sk-xxx |
   | Base URL | LLM service address | https://api.openai.com/v1 |
   | Model | Model name | gpt-4 |
   | Max Tokens | Maximum output token count | 4096 |
   | Temperature | Generation temperature | 0.3 |

3. Click "Save"

### Compatible LLM Services

Supports all OpenAI API compatible interfaces:

- **OpenAI**: GPT-4, GPT-3.5, etc.
- **Ollama**: Locally deployed open-source models
- **vLLM**: High-performance inference service
- **Azure OpenAI**: Microsoft Azure hosted OpenAI service

### Test Connection

1. Click "Test Connection" after configuration
2. System sends test request to verify configuration
3. Display connection status (green/yellow/red)

---

## Parameter Configuration Panel

The parameter configuration panel is split into two separate dialogs, each opened via the settings icon button on the top-right of the corresponding card.

### Flaky Test Criteria Parameters

Click the ⚙ settings icon button on the top-right of the "Flaky Tests" card to open the Flaky test criteria dialog, where the following parameters can be adjusted:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Minimum Run Count | 5 | Do not judge below this count |
| Flaky Threshold | 0.3 | Weighted failure rate ≥ this value is judged as Flaky |
| Monitor Threshold | 0.1 | Weighted failure rate ≥ this value is judged as Monitor |
| Stable Threshold | 0.05 | Weighted failure rate < this value is judged as Stable |
| High Risk Threshold | 0.5 | Weighted failure rate ≥ this value triggers high priority |
| Consecutive Failure Threshold | 5 | Consecutive failures ≥ this value is judged as Broken |
| Regression Window | 5 | Regression detection window size |
| Time Decay Rate | 0.1 | Exponential decay rate |
| Confidence Level | 0.95 | Wilson confidence interval confidence level |
| Auto Release Pass Count | 3 | Consecutive passes required for soft quarantine auto release |

### Quarantined Test Criteria Parameters

Click the ⚙ settings icon button on the top-right of the "Quarantined Tests" card to open the quarantined test criteria dialog, where the following parameters can be adjusted:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Soft Quarantine Threshold | 0.15 | Weighted failure rate ≥ this value enters soft quarantine |
| Hard Quarantine Threshold | 0.4 | Weighted failure rate ≥ this value enters hard quarantine |
| Quarantine Budget Ratio | 0.2 | Maximum 20% of tests can be quarantined |
| Hard Quarantine Release Pass Count | 5 | Consecutive passes required for hard quarantine auto release |
| Quarantine Expiry Days | 30 | Quarantine auto expiry days |
| Downgrade on Expiry | true | Auto downgrade on quarantine expiry instead of release |

### Reset to Default Values

Each dialog has a "Reset to Default Values" button. Click it to remove the corresponding config section from `user-preferences.json` and restore default values.

---

## Test History View

1. Click "History" on the test details page
2. View the complete run history of the test
3. Includes for each run: status, duration, error message, screenshots
4. Display stability statistics: pass rate, total run count, last pass/fail time

---

## Health Dashboard

Dashboard provides test health overview:

- **Overall Health Score**: A/B/C/D/F grade
- **4-Dimensional Score**:
  - Stability (weight 35%): Based on weighted failure rate
  - Trend (weight 25%): Based on pass rate trend direction
  - Recoverability (weight 20%): Based on post-failure recovery ability
  - Predictability (weight 20%): Based on prediction model accuracy
- **Flaky Test Distribution**: Statistics by category
- **High Risk Test List**: Tests predicted to potentially fail

---

## Advanced Features

### Flaky Test Quarantine

1. View unstable test list on Flaky Tests page
2. Click "Quarantine" button next to a test
3. System automatically selects quarantine level based on weighted failure rate:
   - **Monitor**: Only monitor, do not skip
   - **Soft Quarantine**: Quarantine but keep retries
   - **Hard Quarantine**: Completely skip
4. Quarantined tests will not be executed in subsequent runs
5. Can view and manage in "Quarantined Tests"

### Failure Analysis

1. Click on a run in Test Runs page
2. Switch to "Failure Analysis" tab
3. View failure cause classification and statistics
4. View detailed information and suggestions for each failed test

### Trace Viewer

1. Click "Trace" button on test details page
2. Automatically opens Playwright Trace Viewer
3. View complete timeline of test execution
4. View screenshots and DOM snapshots for each step

### Artifacts Management

- **Screenshots**: Automatically collect screenshots of failed tests
- **Videos**: Automatically collect videos of failed tests
- **Trace**: Automatically collect test execution traces
- **Unified Storage**: All artifacts stored in `test-reports/` directory

### Causal Graph

1. View causal graph in Dashboard
2. Display dependencies and related failures between tests
3. Identify root cause nodes (infrastructure/external_service/shared_state)
4. Impact analysis: View which other tests are affected by fixing a test

---

## REST API

Dashboard provides RESTful API for integration with other systems. For complete API documentation, refer to [DashboardServer API Reference](../api/dashboard.md).

Common endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/stats` | Overall statistics |
| GET | `/api/v1/runs` | Run list |
| POST | `/api/v1/runs` | Start test run |
| GET | `/api/v1/flaky` | Flaky test list |
| POST | `/api/v1/diagnosis` | AI diagnosis |
| POST | `/api/v1/diagnosis/stream` | AI diagnosis (streaming) |
| GET | `/api/v1/preferences` | User preferences |
| POST | `/api/v1/preferences` | Save preferences |
