# Usage Guide

This section provides detailed information on various ways to use YuanTest Playwright.

## Table of Contents

- [Web UI Usage](web-ui.md) - Detailed guide for Dashboard visualization interface
- [CLI Usage](cli.md) - Detailed CLI command documentation
- [CI/CD Integration](cicd.md) - Integration into CI/CD pipelines

## In-depth Guides

For deeper content on specific areas, refer to these guides:

- [Flaky Test Management](../guides/flaky-management.md) - Classification algorithm, root cause analysis, correlation analysis, trend tracking, quarantine strategy, health score, causal graph, parameter customization
- [AI Diagnosis](../guides/ai-diagnosis.md) - Context enrichment, knowledge base, Agent reasoning, confidence calibration, streaming diagnosis, LLM configuration

## Recommended Workflow

### Development Phase

1. **Use Web UI for quick debugging**
   - Start Dashboard: `yuantest ui`
   - Select tests to execute in the interface
   - View test progress and results in real-time
   - Quickly identify failure causes

2. **Use --grep to run specific tests**
   ```bash
   yuantest run --grep "login feature" --output ./test-reports
   ```

3. **View detailed reports**
   - View test details in Dashboard
   - View Trace files to analyze failure causes
   - View screenshots and videos

4. **AI diagnose failed tests**
   - Click "AI Diagnosis" in Dashboard
   - Or use CLI: `yuantest analyze --id <run-id> --ai`

### CI/CD Phase

1. **Run full test suite via CLI**
   ```bash
   yuantest run --test-dir ./ --output ./test-reports --shards 4
   ```

2. **Check Flaky test health**
   ```bash
   yuantest health --json
   yuantest prediction --high-risk --json
   ```

3. **Upload reports as artifacts**
   - GitHub Actions: `actions/upload-artifact`
   - GitLab CI: `artifacts`

4. **Optional: Deploy Dashboard server**
   - Run `yuantest ui` on server
   - Team members can view historical reports anytime

### Flaky Test Governance

1. **Identify Flaky tests**
   ```bash
   yuantest flaky --list --json
   yuantest correlations
   ```

2. **Analyze root causes**
   ```bash
   yuantest analyze --id <run-id> --ai
   ```

3. **Quarantine and monitor**
   - Quarantine Flaky tests in Dashboard
   - Set monitoring thresholds and quarantine parameters
   - Periodically check health scores

4. **Verify fixes**
   ```bash
   yuantest rerun <run-id> <test-id>
   yuantest test-history <test-id>
   ```
