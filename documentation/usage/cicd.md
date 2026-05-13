# CI/CD Integration

YuanTest Playwright can be easily integrated into various CI/CD platforms.

## GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Install YuanTest
        run: npm install -g yuantest-playwright
      
      - name: Run tests
        run: |
          yuantest run \
            --test-dir ./ \
            --output ./test-reports \
            --shards 4
        continue-on-error: true
      
      - name: Upload test reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: test-reports/
          retention-days: 30
```

## GitLab CI

Create `.gitlab-ci.yml`:

```yaml
e2e-tests:
  image: mcr.microsoft.com/playwright:v1.40.0-jammy
  stage: test
  script:
    - npm ci
    - npm install -g yuantest-playwright
    - yuantest run --test-dir ./ --output ./test-reports --shards 4
  artifacts:
    when: always
    paths:
      - test-reports/
    expire_in: 30 days
  allow_failure: true
```

## Jenkins

Jenkinsfile example:

```groovy
pipeline {
    agent any
    
    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
                sh 'npm install -g yuantest-playwright'
                sh 'npx playwright install --with-deps'
            }
        }
        
        stage('Test') {
            steps {
                sh 'yuantest run --test-dir ./ --output ./test-reports --shards 4'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'test-reports/**/*', allowEmptyArchive: true
                }
            }
        }
    }
}
```

## Best Practices

### 1. Use Sharding to Speed Up Tests

```bash
yuantest run --test-dir ./ --shards 4 --output ./reports
```

### 2. Quarantine Flaky Tests

```bash
yuantest flaky --quarantine-all
yuantest run --test-dir ./
```

### 3. Preserve Test Reports

Always upload test reports as CI artifacts for later analysis.

### 4. Set Timeout

```bash
yuantest run --test-dir ./ --timeout 60000
```

### 5. Failure Retry

```bash
yuantest run --test-dir ./ --retries 2
```
